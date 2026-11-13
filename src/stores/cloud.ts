import { reactive, watch } from 'vue'
import { load, save } from '../lib/storage'
import { onWake } from '../lib/wake'
import type { Envelope, NostrEvent, SyncKeys } from '../lib/nostr'
import { app, exportSettings, importSettings, toast } from './app'
import { lists, exportLists, importLists } from './watchlist'
import { alerts, importAlerts } from './alerts'
import { checklist, exportChecklist, importChecklist } from './checklist'
import { settings as screener, exportScreener, importScreener } from './screener'
import { drawings, drawDefaults, importDrawings, importDrawDefaults } from './drawings'

/**
 * Синхронизация устройств в реальном времени без своего сервера.
 *
 * Данные разбиты на «документы»: списки, оповещения, чеклист, настройки, условия отбора и рисунки
 * каждой монеты отдельно. Изменённый документ шифруется и публикуется на ретрансляторах; другие
 * устройства с тем же кодом получают его сразу, а включившись позже — забирают последнюю версию.
 * При расхождении побеждает более позднее изменение документа.
 */
export const DEFAULT_RELAYS = ['wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.primal.net', 'wss://nostr.mom']

// Шифрование и подписи нужны только при включённой синхронизации — модуль подгружается по требованию
let N!: typeof import('../lib/nostr')
const nostr = async () => (N ??= await import('../lib/nostr'))
const CODE = /^[A-Za-z0-9_-]{43}$/

const saved = load<{ code?: string; relays?: string[] }>('cloud', {})
const cleanRelays = (list: unknown): string[] =>
  Array.isArray(list) ? [...new Set(list.filter((u): u is string => typeof u === 'string' && /^wss?:\/\/[^\s]+$/.test(u.trim())).map((u) => u.trim()))].slice(0, 8) : []

export const cloud = reactive({
  /** код синхронизации; пусто — выключено */
  code: saved.code && CODE.test(saved.code) ? saved.code : '',
  relays: cleanRelays(saved.relays).length ? cleanRelays(saved.relays) : DEFAULT_RELAYS.slice(),
  /** сколько ретрансляторов сейчас на связи */
  online: 0,
  /** первая сверка с ретрансляторами завершена */
  ready: false,
  sent: 0,
  received: 0,
  /** время последнего обмена */
  lastAt: 0,
})
const persistCloud = () => save('cloud', { code: cloud.code, relays: cloud.relays })

// ---------- документы ----------

interface Doc {
  get(): unknown
  set(v: unknown): void
}
const STATIC: Record<string, Doc> = {
  lists: { get: exportLists, set: importLists },
  alerts: { get: () => alerts, set: importAlerts },
  checklist: { get: exportChecklist, set: importChecklist },
  settings: { get: exportSettings, set: importSettings },
  screener: { get: exportScreener, set: importScreener },
  drawDefaults: { get: () => drawDefaults, set: importDrawDefaults },
}
/** рисунки монеты — отдельный документ: правка одной монеты не затирает другую */
const DRAW = 'd:'
const docFor = (id: string): Doc | null =>
  STATIC[id] ?? (id.startsWith(DRAW) ? { get: () => drawings[id.slice(DRAW.length)] ?? [], set: (v) => importDrawings(id.slice(DRAW.length), v) } : null)

/** время последнего изменения документа на этом устройстве */
const meta: Record<string, number> = load<Record<string, number>>('cloudMeta', {})
let metaTimer = 0
const saveMeta = () => {
  if (!metaTimer)
    metaTimer = window.setTimeout(() => {
      metaTimer = 0
      save('cloudMeta', meta)
    }, 500)
}
/** содержимое документов, уже учтённое синхронизацией (чтобы отличать свои новые правки) */
const known = new Map<string, string>()
const json = (id: string) => JSON.stringify(docFor(id)?.get() ?? null)
const docIds = () => [...new Set([...Object.keys(STATIC), ...Object.keys(drawings).map((k) => DRAW + k), ...Object.keys(meta).filter((k) => k.startsWith(DRAW))])]
const isEmpty = (id: string, text: string) => id.startsWith(DRAW) && text === '[]'

// ---------- связь ----------

let keys: SyncKeys | null = null
/** версии документов, которые есть на ретрансляторах */
const remoteTs = new Map<string, number>()
const lastCreated = new Map<string, number>()
const seen = new Set<string>()
const dirty = new Set<string>()
let flushTimer = 0
let settleTimer = 0
let generation = 0

class Relay {
  ws: WebSocket | null = null
  open = false
  private retry = 0
  private timer = 0
  private closed = false
  constructor(
    readonly url: string,
    private gen: number,
  ) {
    this.connect()
  }
  private connect() {
    if (this.closed) return
    let ws: WebSocket
    try {
      ws = new WebSocket(this.url)
    } catch {
      return this.again()
    }
    this.ws = ws
    ws.onopen = () => {
      this.open = true
      this.retry = 0
      count()
      // всё, что есть под нашим ключом; дальше ретранслятор присылает новое сам
      ws.send(JSON.stringify(['REQ', 'tvx', { kinds: [N.APP_KIND], authors: [keys!.pk] }]))
    }
    ws.onmessage = (m) => {
      if (this.gen !== generation) return
      let msg: unknown
      try {
        msg = JSON.parse(String(m.data))
      } catch {
        return
      }
      if (!Array.isArray(msg)) return
      if (msg[0] === 'EVENT' && msg[2]) onEvent(msg[2] as NostrEvent)
      else if (msg[0] === 'EOSE') scheduleSettle(300)
    }
    ws.onclose = () => {
      this.open = false
      this.ws = null
      count()
      this.again()
    }
    ws.onerror = () => {
      /* за ошибкой следует close */
    }
  }
  private again() {
    if (this.closed) return
    clearTimeout(this.timer)
    this.timer = window.setTimeout(() => this.connect(), Math.min(60_000, 3000 * 2 ** this.retry++))
  }
  /**
   * Соединение могло «зависнуть», пока приложение было в фоне. stale — отсутствовали долго:
   * тогда и «открытому» соединению не верим и создаём его заново.
   */
  wake(stale = false) {
    if (this.closed) return
    if (!stale && (this.open || this.ws?.readyState === WebSocket.CONNECTING)) return
    const ws = this.ws
    if (ws) {
      ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null
      try {
        ws.close()
      } catch {
        /* уже закрыт */
      }
      this.ws = null
      this.open = false
      count()
    }
    clearTimeout(this.timer)
    this.retry = 0
    this.connect()
  }
  send(ev: NostrEvent): boolean {
    if (!this.open || !this.ws) return false
    try {
      this.ws.send(JSON.stringify(['EVENT', ev]))
      return true
    } catch {
      return false
    }
  }
  close() {
    this.closed = true
    clearTimeout(this.timer)
    const ws = this.ws
    this.ws = null
    this.open = false
    if (ws) {
      ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null
      try {
        ws.close()
      } catch {
        /* уже закрыт */
      }
    }
  }
}

let relays: Relay[] = []

/** Возвращает связь с ретрансляторами; stale — пересоздать и те соединения, что считаются открытыми */
export function wakeRelays(stale = false) {
  relays.forEach((r) => r.wake(stale))
}
const count = () => (cloud.online = relays.filter((r) => r.open).length)

// ---------- приём ----------

async function onEvent(ev: NostrEvent) {
  if (!keys || ev.pubkey !== keys.pk || seen.has(ev.id)) return
  seen.add(ev.id)
  const tag = N.docOf(ev)
  if (!tag?.startsWith('tvx:')) return
  const id = tag.slice(4)
  const doc = docFor(id)
  if (!doc) return
  lastCreated.set(id, Math.max(lastCreated.get(id) ?? 0, ev.created_at))
  let env: Envelope
  try {
    env = JSON.parse(await N.unseal(keys.aes, ev.content))
  } catch {
    return // не наш ключ или повреждено
  }
  if (!env || typeof env.ts !== 'number') return
  remoteTs.set(id, Math.max(remoteTs.get(id) ?? 0, env.ts))
  const mine = { ts: meta[id] ?? 0, json: known.get(id) ?? json(id) }
  const theirs = { ts: env.ts, json: JSON.stringify(env.v ?? null) }
  if (theirs.json === mine.json) {
    if (env.ts > mine.ts) {
      meta[id] = env.ts
      saveMeta()
    }
    return
  }
  if (N.newer(theirs, mine)) {
    doc.set(env.v)
    // после приёма содержимое могло нормализоваться — запоминаем то, что получилось на самом деле
    known.set(id, json(id))
    meta[id] = env.ts
    saveMeta()
    cloud.received++
    cloud.lastAt = Date.now()
  } else if (mine.ts > 0) {
    // на ретрансляторе версия старее нашей — обновим её
    dirty.add(id)
    scheduleFlush(400)
  }
}

// ---------- отправка ----------

async function publish(id: string): Promise<boolean> {
  if (!keys) return false
  const k = keys
  const text = json(id)
  const ts = meta[id] ?? Date.now()
  const content = await N.seal(k.aes, JSON.stringify({ ts, v: JSON.parse(text) } satisfies Envelope))
  // у заменяемых событий побеждает большее время создания, поэтому оно обязано расти
  const created = Math.max(Math.floor(ts / 1000), (lastCreated.get(id) ?? 0) + 1)
  const ev = N.signEvent(k, 'tvx:' + id, content, created)
  seen.add(ev.id)
  let ok = false
  for (const r of relays) ok = r.send(ev) || ok
  if (ok) {
    lastCreated.set(id, created)
    remoteTs.set(id, ts)
    cloud.sent++
    cloud.lastAt = Date.now()
  }
  return ok
}

function scheduleFlush(delay = 350) {
  clearTimeout(flushTimer)
  flushTimer = window.setTimeout(flush, delay)
}
async function flush() {
  if (!keys || !cloud.ready) return
  for (const id of [...dirty]) {
    dirty.delete(id)
    if (!(await publish(id))) dirty.add(id) // нет связи — отправим, когда появится
  }
}

/** Находит документы, изменённые на этом устройстве, и ставит их в очередь */
function scan() {
  if (!keys) return
  let changed = false
  for (const id of docIds()) {
    const text = json(id)
    if (known.get(id) === text) continue
    // пустой документ, которого никогда не было, — не событие (например, монету просто открыли)
    if (!known.has(id) && isEmpty(id, text) && !meta[id]) {
      known.set(id, text)
      continue
    }
    known.set(id, text)
    meta[id] = Date.now()
    dirty.add(id)
    changed = true
  }
  if (changed) {
    saveMeta()
    scheduleFlush()
  }
}

/** Первая сверка: ретрансляторы отдали всё, что у них было. Досылаем то, чего там нет или что устарело */
function scheduleSettle(delay: number) {
  clearTimeout(settleTimer)
  settleTimer = window.setTimeout(settle, delay)
}
function settle() {
  if (!keys || !cloud.online) return
  for (const id of docIds()) {
    const text = known.get(id) ?? json(id)
    const have = remoteTs.get(id)
    if (have === undefined) {
      if (isEmpty(id, text)) continue
      meta[id] ??= Date.now()
      dirty.add(id)
    } else if ((meta[id] ?? 0) > have) dirty.add(id)
  }
  saveMeta()
  cloud.ready = true
  flush()
}

// ---------- включение и выключение ----------

let stopWatch: (() => void) | null = null
let scanTimer = 0

async function start() {
  stop()
  if (!cloud.code) return
  const gen = ++generation
  const k = await (await nostr()).deriveKeys(cloud.code)
  if (gen !== generation) return
  keys = k
  // точка отсчёта: то, что есть сейчас, — уже «известное»; изменения после этого — новые правки
  for (const id of docIds()) known.set(id, json(id))
  relays = cloud.relays.map((url) => new Relay(url, gen))
  // если ни один ретранслятор не ответил «конец истории», всё равно начинаем работать
  scheduleSettle(6000)
  stopWatch = watch(
    [() => lists.all, () => lists.marks, () => lists.activeId, alerts, () => checklist.blocks, () => checklist.selections, drawings, drawDefaults, screener, () => exportSettings()],
    () => {
      clearTimeout(scanTimer)
      scanTimer = window.setTimeout(scan, 250)
    },
    { deep: true },
  )
}

function stop() {
  generation++
  stopWatch?.()
  stopWatch = null
  clearTimeout(scanTimer)
  clearTimeout(flushTimer)
  clearTimeout(settleTimer)
  relays.forEach((r) => r.close())
  relays = []
  keys = null
  known.clear()
  remoteTs.clear()
  lastCreated.clear()
  seen.clear()
  dirty.clear()
  cloud.online = 0
  cloud.ready = false
}

/** Включает синхронизацию: без кода — создаёт новую, с кодом — подключает устройство к существующей */
export async function enableSync(code?: string): Promise<boolean> {
  const lib = await nostr()
  const next = code?.trim() || lib.newSyncCode()
  if (!lib.validSyncCode(next)) return false
  // подключаемся к чужому набору: местные версии считаем «старыми», чтобы приняли присланное
  if (code) for (const k of Object.keys(meta)) delete meta[k]
  cloud.code = next
  persistCloud()
  save('cloudMeta', meta)
  await start()
  return true
}

export function disableSync() {
  stop()
  cloud.code = ''
  for (const k of Object.keys(meta)) delete meta[k]
  persistCloud()
  save('cloudMeta', meta)
}

export function setRelays(list: string[]) {
  const next = cleanRelays(list)
  cloud.relays = next.length ? next : DEFAULT_RELAYS.slice()
  persistCloud()
  if (cloud.code) start()
}

/** Ссылка для второго устройства */
export const syncLink = () => new URL('./', location.href).href + '#sync=' + cloud.code

/** Код из ссылки или вставленного текста */
export function codeFrom(text: string): string {
  const t = text.trim()
  const m = /#sync=([A-Za-z0-9_-]{43})/.exec(t)
  return m ? m[1] : t
}

// связь восстанавливается сама, когда вкладка снова на экране или вернулась сеть
if (typeof document !== 'undefined') {
  onWake((awayMs) => wakeRelays(awayMs > 60_000))
  // правки последних секунд должны успеть уйти до закрытия вкладки
  window.addEventListener('pagehide', () => {
    if (!keys) return
    scan()
    flush()
  })
}

if (cloud.code) start().catch(() => toast('Не удалось запустить синхронизацию', 'error'))

// app используется косвенно (exportSettings), но импорт нужен, чтобы хранилище настроек было готово раньше
void app
