import { accountDocs } from '../../journal/src/core/pack'
import { PROTOCOL, type BridgeConfig, type BridgeRequest, type BridgeResponse, type Hello } from '../../journal/src/core/protocol'
import type { ExchangeId } from '../../journal/src/core/types'
import { HOSTS, TICK_MIN, VERSION, allowedSite } from './config'
import { idbStore } from './db'
import { binance } from './exchanges/binance'
import { bybit } from './exchanges/bybit'
import { BridgeError } from './exchanges/http'
import type { ExchangeClient } from './exchanges/types'
import { createHistory } from './history'
import { ext } from './platform'
import { publishChanged } from './publish'
import { contextOf, listAccounts } from './vault'

/**
 * Фоновая часть моста.
 *
 * По расписанию (и по просьбе журнала) догружает историю счетов с биржи, собирает сделки и,
 * если включена синхронизация, публикует их в зашифрованном виде для других устройств — журнал
 * при этом может быть закрыт.
 *
 * Странице журнала отвечает только на запросы из протокола и только готовыми данными; проверяет,
 * что запрос пришёл с разрешённого сайта, из основной вкладки (не из встроенного окна).
 */
const clients: Record<ExchangeId, ExchangeClient> = {
  binance: binance(HOSTS.binance),
  bybit: bybit(HOSTS.bybit),
}

const now = () => Date.now()
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
const history = createHistory({ store: idbStore, client: (x) => clients[x], contextOf, now })

const DEFAULT_CONFIG: BridgeConfig = { sync: null, depthDays: 180, removed: [] }
const loadConfig = async (): Promise<BridgeConfig> => ({ ...DEFAULT_CONFIG, ...((await idbStore.get<BridgeConfig>('config')) ?? {}) })

/** Настройки приходят со страницы — принимаем только то, что имеет ожидаемый вид */
function cleanConfig(raw: unknown): BridgeConfig {
  const c = (raw ?? {}) as Partial<BridgeConfig>
  const out: BridgeConfig = { ...DEFAULT_CONFIG }
  if (typeof c.depthDays === 'number' && c.depthDays >= 1 && c.depthDays <= 730) out.depthDays = Math.round(c.depthDays)
  if (Array.isArray(c.removed)) out.removed = c.removed.filter((x): x is string => typeof x === 'string' && /^[A-Za-z0-9-]{1,40}$/.test(x)).slice(0, 200)
  const s = c.sync
  if (s && typeof s.code === 'string' && /^[A-Za-z0-9_-]{43}$/.test(s.code) && Array.isArray(s.relays)) {
    const relays = [...new Set(s.relays.filter((u): u is string => typeof u === 'string' && /^wss:\/\/[^\s]+$/.test(u)))].slice(0, 8)
    if (relays.length) out.sync = { code: s.code, relays }
  }
  return out
}

/** Счета, с которыми мост работает: все, кроме удалённых пользователем из журнала */
async function activeAccounts() {
  const cfg = await loadConfig()
  return (await listAccounts()).filter((a) => !cfg.removed.includes(a.id))
}

// ---------- фоновая работа ----------

/**
 * Пока идёт работа, раз в 20 секунд обращаемся к интерфейсу расширений: браузер останавливает
 * фоновую часть после полуминуты «тишины», а долгая загрузка истории для него выглядит тишиной.
 */
async function keepAlive<T>(work: Promise<T>): Promise<T> {
  const timer = setInterval(() => void ext.runtime.getPlatformInfo().catch(() => {}), 20_000)
  try {
    return await work
  } finally {
    clearInterval(timer)
  }
}

let publishing: Promise<unknown> | null = null

/** Отправляет на ретрансляторы то, что изменилось с прошлой отправки */
function publish(): Promise<unknown> {
  return (publishing ??= (async () => {
    const cfg = await loadConfig()
    if (!cfg.sync) return
    const docs = new Map<string, unknown>()
    for (const a of await activeAccounts()) {
      const data = await history.data(a.id)
      // пока история счёта ни разу не загружена до конца, публиковать нечего
      if (!data.rev) continue
      const { expiresAt: _exp, ...account } = a
      for (const [id, v] of accountDocs(account, data.trades, data.snapshot)) docs.set(id, v)
    }
    await publishChanged(cfg.sync, docs, { store: idbStore, now, sleep, socket: (url) => new WebSocket(url) })
  })()
    .catch(() => {})
    .finally(() => (publishing = null)))
}

/** Догружает историю счетов и выгружает изменения для других устройств */
function runAll(only?: string): Promise<void> {
  return keepAlive(
    (async () => {
      const cfg = await loadConfig()
      const accounts = (await activeAccounts()).filter((a) => !only || a.id === only)
      await Promise.all(accounts.map((a) => history.pull(a.id, cfg.depthDays)))
      await publish()
    })(),
  )
}

const ALARM = 'tvx-bridge-tick'
async function schedule() {
  const have = await ext.alarms.get(ALARM)
  if (!have || have.periodInMinutes !== TICK_MIN) await ext.alarms.create(ALARM, { periodInMinutes: TICK_MIN, delayInMinutes: Math.min(1, TICK_MIN) })
}
ext.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM) void runAll()
})
ext.runtime.onInstalled.addListener(() => void schedule())
ext.runtime.onStartup.addListener(() => {
  void schedule()
  void runAll()
})
void schedule()

// ---------- запросы ----------

async function status() {
  return history.status((await activeAccounts()).map((a) => a.id))
}

/** Запросы страницы журнала */
async function handleSite(req: BridgeRequest): Promise<unknown> {
  switch (req?.op) {
    case 'hello':
      return { version: VERSION, protocol: PROTOCOL, accounts: await activeAccounts(), status: await status() } satisfies Hello
    case 'status':
      return status()
    case 'trades': {
      if (typeof req.account !== 'string' || !(await activeAccounts()).some((a) => a.id === req.account)) throw new BridgeError('no-account')
      return history.data(req.account)
    }
    case 'refresh':
      if (req.account !== undefined && typeof req.account !== 'string') throw new BridgeError('bad-request')
      void runAll(req.account)
      return true
    case 'config':
      await idbStore.set('config', cleanConfig(req.config))
      // настройки могли включить синхронизацию или вернуть счёт — выгружаем, не дожидаясь расписания
      void keepAlive(publish())
      return true
    case 'options':
      await ext.runtime.openOptionsPage()
      return true
    default:
      throw new BridgeError('bad-request')
  }
}

/** Запросы страницы самого расширения (добавление и удаление ключей) */
async function handleOwn(req: { own?: string; account?: string }): Promise<unknown> {
  switch (req?.own) {
    case 'status':
      return history.status((await listAccounts()).map((a) => a.id))
    case 'added':
      void runAll(req.account)
      return true
    case 'removed':
      if (typeof req.account === 'string') await history.forget(req.account)
      return true
    default:
      throw new BridgeError('bad-request')
  }
}

ext.runtime.onMessage.addListener((req: BridgeRequest & { own?: string }, sender, respond: (res: BridgeResponse) => void) => {
  if (sender.id !== ext.runtime.id) return false
  const own = !!sender.url?.startsWith(ext.runtime.getURL(''))
  const site = !own && (sender.frameId ?? 0) === 0 && allowedSite(sender.url)
  if (!own && !site) {
    respond({ ok: false, error: 'forbidden' })
    return false
  }
  ;(own ? handleOwn(req) : handleSite(req)).then(
    (data) => respond({ ok: true, data }),
    (e) => respond(e instanceof BridgeError ? { ok: false, error: e.code, message: e.message } : { ok: false, error: 'exchange', message: String(e?.message ?? e) }),
  )
  return true // ответ придёт позже
})

// значок расширения открывает страницу со счетами
ext.action.onClicked.addListener(() => void ext.runtime.openOptionsPage())
