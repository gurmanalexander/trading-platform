import { shallowReactive, watch, onScopeDispose, type WatchSource } from 'vue'
import { symbolKey, type SymbolRef, type Ticker } from '../types'
import { adapters } from '../exchanges'
import { observePrecision } from '../lib/format'
import { onWake } from '../lib/wake'

/**
 * Живые цены по инструментам. Подписки считаются по ссылкам: сколько бы компонентов ни
 * следило за BTCUSDT, на бирже это одна подписка. В интерфейс изменения попадают пачкой
 * не чаще нескольких раз в секунду — этого хватает глазу и не грузит телефон.
 *
 * Поток по отдельной монете может замолчать при живом соединении (биржа потеряла подписку,
 * отклонила её, сообщения застряли). Поэтому за каждой монетой следит сторож: если поток молчит
 * дольше STALE_MS, цена берётся по REST, а если она разошлась с последней из потока — подписка
 * на монету делается заново. Тихая монета, у которой цена и правда не менялась, проверяется реже.
 */
export const tickers = shallowReactive<Record<string, Ticker>>({})

const FLUSH_MS = 250
/** поток по монете молчит дольше — проверяем цену по REST */
const STALE_MS = 12_000
/** цена по REST совпала с потоком (монета просто тихая) — следующая проверка не раньше */
const QUIET_RECHECK_MS = 45_000
const WATCHDOG_MS = 4000
/** не больше стольких REST-запросов за один проход сторожа */
const POLL_BATCH = 8

interface Sub {
  ref: SymbolRef
  count: number
  off: () => void
  /** когда последний раз пришло сообщение из потока, мс */
  seen: number
  /** не проверять по REST раньше этого момента, мс */
  nextPoll: number
  polling: boolean
}

const latest = new Map<string, Ticker>()
const dirty = new Set<string>()
const subs = new Map<string, Sub>()
const listeners = new Set<(key: string, t: Ticker) => void>()
let timer = 0

function flush() {
  timer = 0
  const keys = [...dirty]
  dirty.clear()
  for (const key of keys) {
    const t = latest.get(key)
    if (!t) continue
    tickers[key] = t
    for (const l of listeners) {
      // ошибка одного слушателя не должна останавливать обновление остальных цен
      try {
        l(key, t)
      } catch (e) {
        console.error(e)
      }
    }
  }
}

function put(key: string, t: Ticker, raw: (string | undefined)[]) {
  observePrecision(key, raw)
  latest.set(key, t)
  dirty.add(key)
  if (!timer) timer = window.setTimeout(flush, FLUSH_MS)
}

async function poll(key: string, e: Sub) {
  e.polling = true
  try {
    const { ticker, raw } = await adapters[e.ref.exchange].fetchTicker(e.ref.market, e.ref.symbol)
    if (subs.get(key) !== e || !(ticker.last > 0)) return
    // за время запроса поток ожил — его данные свежее
    if (Date.now() - e.seen < STALE_MS) return
    const prev = latest.get(key)
    if (prev && prev.last === ticker.last) {
      // цена не менялась: монета тихая, поток в порядке
      e.nextPoll = Date.now() + QUIET_RECHECK_MS
      return
    }
    put(key, ticker, raw)
    e.nextPoll = Date.now() + STALE_MS
    // поток отстал от биржи — подписываемся на него заново
    if (prev) adapters[e.ref.exchange].refreshTicker(e.ref.market, e.ref.symbol)
  } catch {
    e.nextPoll = Date.now() + STALE_MS
  } finally {
    e.polling = false
  }
}

/** Проход сторожа: монеты, поток по которым замолчал, проверяем по REST */
function watchdog(force = false) {
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
  const now = Date.now()
  let n = 0
  // сначала те, что молчат дольше всех
  const stale = [...subs].filter(([, e]) => !e.polling && now - e.seen > (force ? 3000 : STALE_MS) && (force || now >= e.nextPoll))
  stale.sort((a, b) => a[1].seen - b[1].seen)
  for (const [key, e] of stale) {
    if (n++ >= POLL_BATCH) break
    poll(key, e)
  }
}

let watchdogTimer = 0
function startWatchdog() {
  if (watchdogTimer || typeof window === 'undefined') return
  watchdogTimer = window.setInterval(() => watchdog(), WATCHDOG_MS)
  // вернулись в приложение — цены могли отстать, проверяем сразу, не дожидаясь сторожа
  onWake(() => watchdog(true))
}

export function watchTicker(ref: SymbolRef): () => void {
  const key = symbolKey(ref)
  let entry = subs.get(key)
  if (!entry) {
    startWatchdog()
    const e: Sub = { ref: { exchange: ref.exchange, market: ref.market, symbol: ref.symbol }, count: 0, off: () => {}, seen: Date.now(), nextPoll: 0, polling: false }
    e.off = adapters[ref.exchange].subscribeTicker(ref.market, ref.symbol, (t, rawPrices) => {
      e.seen = Date.now()
      e.nextPoll = 0
      put(key, t, rawPrices)
    })
    subs.set(key, (entry = e))
  }
  entry.count++
  let done = false
  return () => {
    if (done) return
    done = true
    const e = subs.get(key)
    if (!e) return
    if (--e.count <= 0) {
      e.off()
      subs.delete(key)
    }
  }
}

/** Слушатель всех обновлений (для оповещений) */
export function onTicker(cb: (key: string, t: Ticker) => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

/** Держит подписки на тикеры в соответствии с реактивным списком инструментов */
export function useTickers(source: WatchSource<SymbolRef[]>) {
  const offs = new Map<string, () => void>()
  const stop = watch(
    source,
    (list) => {
      const want = new Map(list.map((r) => [symbolKey(r), r]))
      for (const [key, off] of offs) {
        if (!want.has(key)) {
          off()
          offs.delete(key)
        }
      }
      for (const [key, r] of want) if (!offs.has(key)) offs.set(key, watchTicker(r))
    },
    { immediate: true, deep: true },
  )
  onScopeDispose(() => {
    stop()
    offs.forEach((off) => off())
    offs.clear()
  })
}
