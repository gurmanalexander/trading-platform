import { reactive, watch } from 'vue'
import { load, save } from '../../../src/lib/storage'
import { onWake } from '../../../src/lib/wake'
import type { Envelope, NostrEvent, SyncKeys } from '../../../src/lib/nostr'
import { isDemo } from '../core/demo'
import type { Note, Trade } from '../core/types'
import { importAccount, importNotes, importSnapshot, importWeek, notes, quarterOf, snapshots, state, trades, weekOf } from './journal'

/**
 * Синхронизация журнала между устройствами — тем же способом, что в tvx: документы шифруются на
 * устройстве и публикуются на общедоступных ретрансляторах Nostr, своего сервера нет.
 *
 * Код синхронизации общий с tvx (лежит в том же хранилище), поэтому телефон, уже подключённый
 * к tvx, получает и журнал. Ключи журнала выводятся из кода отдельно: tvx и журнал не видят
 * и не скачивают документы друг друга.
 *
 * Документы: счёт (a:), сделки счёта за неделю (t:), состояние счёта (s:), пометки за квартал (n:).
 * Ключей бирж среди них нет и быть не может — они не покидают расширение-мост.
 */
export const DEFAULT_RELAYS = ['wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.primal.net', 'wss://nostr.mom']
const CODE = /^[A-Za-z0-9_-]{43}$/
/** Ретрансляторы не принимают слишком большие сообщения */
const MAX_CONTENT = 60_000
const TAG = 'tvxj:'

let N!: typeof import('../../../src/lib/nostr')
const nostr = async () => (N ??= await import('../../../src/lib/nostr'))

const saved = load<{ code?: string; relays?: string[] }>('cloud', {})
const cleanRelays = (list: unknown): string[] =>
  Array.isArray(list) ? [...new Set(list.filter((u): u is string => typeof u === 'string' && /^wss?:\/\/[^\s]+$/.test(u.trim())).map((u) => u.trim()))].slice(0, 8) : []

export const cloud = reactive({
  code: saved.code && CODE.test(saved.code) ? saved.code : '',
  relays: cleanRelays(saved.relays).length ? cleanRelays(saved.relays) : DEFAULT_RELAYS.slice(),
  online: 0,
  ready: false,
  sent: 0,
  received: 0,
  lastAt: 0,
  /** документы, которые не поместились в сообщение ретранслятора */
  tooBig: 0,
})

// ---------- упаковка сделок ----------

const r = (v: number) => +v.toPrecision(10)

/** Сделка в виде короткого массива: в документе их сотни */
export function packTrade(t: Trade): unknown[] {
  const tail = t.id.slice(t.acct.length + 1 + t.sym.length + 3) // после «счёт:инструмент:L:»
  return [tail, t.sym, t.side, t.open, t.close, r(t.entry), r(t.exit), r(t.qty), r(t.vol), r(t.gross), r(t.fee), r(t.funding), t.fills, t.partial ? 1 : 0]
}

export function unpackTrade(acct: string, a: unknown): Trade | null {
  if (!Array.isArray(a) || a.length < 13) return null
  const [tail, sym, side, open, close, entry, exit, qty, vol, gross, fee, funding, fills, partial] = a
  if (typeof tail !== 'string' || typeof sym !== 'string' || !/^[A-Z0-9_-]{2,40}$/.test(sym) || (side !== 1 && side !== -1)) return null
  const nums = [open, close, entry, exit, qty, vol, gross, fee, funding, fills]
  if (!nums.every((v) => typeof v === 'number' && isFinite(v))) return null
  const t: Trade = { id: `${acct}:${sym}:${side > 0 ? 'L' : 'S'}:${tail}`, acct, sym, side, open, close, entry, exit, qty, vol, gross, fee, funding, fills }
  if (partial) t.partial = true
  return t
}

// ---------- документы ----------

const syncable = () => state.accounts.filter((a) => !a.demo)

function docIds(): string[] {
  const ids = new Set<string>()
  for (const id of state.removed) ids.add('a:' + id)
  for (const a of syncable()) {
    ids.add('a:' + a.id)
    if (snapshots[a.id]) ids.add('s:' + a.id)
    for (const t of trades[a.id] ?? []) ids.add(`t:${a.id}:${weekOf(t.open)}`)
  }
  for (const [id, n] of Object.entries(notes)) {
    const acct = id.slice(0, id.indexOf(':'))
    if (!isDemo(acct)) ids.add(`n:${acct}:${quarterOf(n.o)}`)
  }
  for (const id of Object.keys(meta)) ids.add(id)
  return [...ids]
}

/** Содержимое документа на этом устройстве; undefined — такого документа у нас нет */
function getDoc(id: string): unknown {
  const [kind, acct, part] = id.split(':')
  if (kind === 'a') {
    if (state.removed.includes(acct)) return null
    const a = state.accounts.find((x) => x.id === acct && !x.demo)
    return a ? { id: a.id, exchange: a.exchange, label: a.label, hint: a.hint, addedAt: a.addedAt } : undefined
  }
  if (state.removed.includes(acct) || !state.accounts.some((a) => a.id === acct)) return undefined
  if (kind === 's') return snapshots[acct]
  if (kind === 't') {
    const week = Number(part)
    const list = (trades[acct] ?? []).filter((t) => weekOf(t.open) === week)
    return list.length ? list.map(packTrade) : undefined
  }
  if (kind === 'n') {
    const q = Number(part)
    const out: Record<string, Note & { o: number }> = {}
    for (const [tid, n] of Object.entries(notes)) if (tid.startsWith(acct + ':') && quarterOf(n.o) === q) out[tid] = { tags: n.tags, text: n.text, o: n.o }
    return Object.keys(out).length || meta[id] ? out : undefined
  }
  return undefined
}

function setDoc(id: string, v: unknown) {
  const [kind, acct, part] = id.split(':')
  if (!acct) return
  if (kind === 'a') importAccount(acct, v)
  else if (kind === 's') importSnapshot(acct, v)
  else if (kind === 't' && Array.isArray(v)) importWeek(acct, Number(part), v.map((x) => unpackTrade(acct, x)).filter((t): t is Trade => !!t))
  else if (kind === 'n' && v && typeof v === 'object') importNotes(acct, Number(part), v as Record<string, Note>)
}

const json = (id: string) => {
  const v = getDoc(id)
  return v === undefined ? '' : JSON.stringify(v)
}

const meta: Record<string, number> = load<Record<string, number>>('j:cloudMeta', {})
let metaTimer = 0
const saveMeta = () => {
  if (!metaTimer)
    metaTimer = window.setTimeout(() => {
      metaTimer = 0
      save('j:cloudMeta', meta)
    }, 500)
}
const known = new Map<string, string>()

// ---------- связь ----------

let keys: SyncKeys | null = null
const remoteTs = new Map<string, number>()
const lastCreated = new Map<string, number>()
const seen = new Set<string>()
const dirty = new Set<string>()
let flushTimer = 0
let settleTimer = 0
let generation = 0
let flushing = false

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
      ws.send(JSON.stringify(['REQ', 'tvxj', { kinds: [N.APP_KIND], authors: [keys!.pk] }]))
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
      else if (msg[0] === 'EOSE') scheduleSettle(400)
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
  wake(stale = false) {
    if (this.closed) return
    if (!stale && (this.open || this.ws?.readyState === WebSocket.CONNECTING)) return
    this.drop()
    clearTimeout(this.timer)
    this.retry = 0
    this.connect()
  }
  private drop() {
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
    count()
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
    this.drop()
  }
}

let relays: Relay[] = []
const count = () => (cloud.online = relays.filter((x) => x.open).length)

// события обрабатываются по одному: приём документа меняет состояние, от которого зависит следующий
let queue: Promise<void> = Promise.resolve()
const onEvent = (ev: NostrEvent) => (queue = queue.then(() => receive(ev)).catch(() => {}))

async function receive(ev: NostrEvent) {
  if (!keys || ev.pubkey !== keys.pk || seen.has(ev.id)) return
  seen.add(ev.id)
  const tag = N.docOf(ev)
  if (!tag?.startsWith(TAG)) return
  const id = tag.slice(TAG.length)
  if (!/^[astn]:[A-Za-z0-9-]{1,40}(:-?\d{1,6})?$/.test(id)) return
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
  // чего у нас нет вовсе — принимаем; иначе побеждает более позднее изменение
  if (mine.json === '' || N.newer(theirs, mine)) {
    setDoc(id, env.v)
    known.set(id, json(id))
    meta[id] = env.ts
    saveMeta()
    cloud.received++
    cloud.lastAt = Date.now()
  } else if (mine.ts > 0) {
    dirty.add(id)
    scheduleFlush(600)
  }
}

async function publish(id: string): Promise<boolean> {
  if (!keys) return false
  const k = keys
  const text = json(id)
  if (text === '') return true // документа больше нет — публиковать нечего
  const ts = meta[id] ?? Date.now()
  const content = await N.seal(k.aes, JSON.stringify({ ts, v: JSON.parse(text) } satisfies Envelope))
  if (content.length > MAX_CONTENT) {
    cloud.tooBig++
    return true
  }
  const created = Math.max(Math.floor(ts / 1000), (lastCreated.get(id) ?? 0) + 1)
  const ev = N.signEvent(k, TAG + id, content, created)
  seen.add(ev.id)
  let ok = false
  for (const x of relays) ok = x.send(ev) || ok
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
  if (!keys || !cloud.ready || flushing) return
  flushing = true
  const gen = generation
  try {
    for (const id of [...dirty]) {
      if (gen !== generation) return
      dirty.delete(id)
      if (!(await publish(id))) {
        dirty.add(id) // нет связи — отправим, когда появится
        break
      }
      // ретрансляторы ограничивают частоту сообщений — первая выгрузка истории идёт не залпом
      await new Promise((res) => setTimeout(res, 70))
    }
  } finally {
    flushing = false
  }
}

/** Находит документы, изменённые на этом устройстве, и ставит их в очередь */
function scan() {
  if (!keys) return
  let changed = false
  for (const id of docIds()) {
    const text = json(id)
    if (known.get(id) === text) continue
    known.set(id, text)
    if (text === '') continue
    meta[id] = Date.now()
    dirty.add(id)
    changed = true
  }
  if (changed) {
    saveMeta()
    scheduleFlush()
  }
}

function scheduleSettle(delay: number) {
  clearTimeout(settleTimer)
  settleTimer = window.setTimeout(settle, delay)
}

/** Первая сверка: ретрансляторы отдали всё, что у них было. Досылаем то, чего там нет или что устарело */
async function settle() {
  if (!keys || !cloud.online) return
  await queue
  for (const id of docIds()) {
    const text = known.get(id) ?? json(id)
    if (text === '') continue
    const have = remoteTs.get(id)
    if (have === undefined) {
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
  // «/journal» в основе ключей: у журнала свой адрес на ретрансляторах, отдельный от tvx
  const k = await (await nostr()).deriveKeys(cloud.code + '/journal')
  if (gen !== generation) return
  keys = k
  for (const id of docIds()) known.set(id, json(id))
  relays = cloud.relays.map((url) => new Relay(url, gen))
  scheduleSettle(6000)
  stopWatch = watch(
    () => state.rev,
    () => {
      clearTimeout(scanTimer)
      scanTimer = window.setTimeout(scan, 300)
    },
  )
}

function stop() {
  generation++
  stopWatch?.()
  stopWatch = null
  clearTimeout(scanTimer)
  clearTimeout(flushTimer)
  clearTimeout(settleTimer)
  relays.forEach((x) => x.close())
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

const persistCloud = () => save('cloud', { code: cloud.code, relays: cloud.relays })

/** Включает синхронизацию: без кода — создаёт новую, с кодом — подключает устройство к существующей */
export async function enableSync(code?: string): Promise<boolean> {
  const lib = await nostr()
  const next = code?.trim() || lib.newSyncCode()
  if (!lib.validSyncCode(next)) return false
  if (code) {
    // подключаемся к существующему набору: местные версии считаем старыми — и здесь, и в tvx
    for (const k of Object.keys(meta)) delete meta[k]
    if (next !== cloud.code) save('cloudMeta', {})
  }
  cloud.code = next
  persistCloud()
  save('j:cloudMeta', meta)
  await start()
  return true
}

/** Выключает синхронизацию на этом устройстве — и журнала, и tvx: код у них общий */
export function disableSync() {
  stop()
  cloud.code = ''
  for (const k of Object.keys(meta)) delete meta[k]
  persistCloud()
  save('j:cloudMeta', meta)
  save('cloudMeta', {})
}

/** Ссылка для второго устройства */
export const syncLink = () => new URL('./', location.href).href + '#sync=' + cloud.code

export function codeFrom(text: string): string {
  const s = text.trim()
  const m = /#sync=([A-Za-z0-9_-]{43})/.exec(s)
  return m ? m[1] : s
}

export function startSync() {
  onWake((awayMs) => relays.forEach((x) => x.wake(awayMs > 60_000)))
  window.addEventListener('pagehide', () => {
    if (!keys) return
    scan()
    flush()
  })
  if (cloud.code) start().catch(() => {})
}
