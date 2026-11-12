import { shallowReactive, watch, onScopeDispose, type WatchSource } from 'vue'
import { symbolKey, type SymbolRef, type Ticker } from '../types'
import { adapters } from '../exchanges'
import { observePrecision } from '../lib/format'

/**
 * Живые цены по инструментам. Подписки считаются по ссылкам: сколько бы компонентов ни
 * следило за BTCUSDT, на бирже это одна подписка. В интерфейс изменения попадают пачкой
 * не чаще нескольких раз в секунду — этого хватает глазу и не грузит телефон.
 */
export const tickers = shallowReactive<Record<string, Ticker>>({})

const FLUSH_MS = 250
const latest = new Map<string, Ticker>()
const dirty = new Set<string>()
const subs = new Map<string, { count: number; off: () => void }>()
const listeners = new Set<(key: string, t: Ticker) => void>()
let timer = 0

function flush() {
  timer = 0
  for (const key of dirty) {
    const t = latest.get(key)
    if (!t) continue
    tickers[key] = t
    for (const l of listeners) l(key, t)
  }
  dirty.clear()
}

export function watchTicker(ref: SymbolRef): () => void {
  const key = symbolKey(ref)
  let entry = subs.get(key)
  if (!entry) {
    const off = adapters[ref.exchange].subscribeTicker(ref.market, ref.symbol, (t, rawPrices) => {
      observePrecision(key, rawPrices)
      latest.set(key, t)
      dirty.add(key)
      if (!timer) timer = window.setTimeout(flush, FLUSH_MS)
    })
    subs.set(key, (entry = { count: 0, off }))
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
