import { onScopeDispose, shallowReactive, watch, type WatchSource } from 'vue'
import { symbolKey, type SymbolRef } from '../types'
import { adapters } from '../exchanges'
import { getTf } from '../lib/timeframes'
import { robustAtr } from '../lib/atr'

/** Дневные показатели инструмента: ATR и свеча текущего дня */
export interface DayStats {
  atr: number
  open: number
  high: number
  low: number
  /** номер суток UTC, к которым относятся open/high/low */
  day: number
  at: number
}

export const dayStats = shallowReactive<Record<string, DayStats>>({})

const FRESH_MS = 10 * 60_000
const PARALLEL = 3
const queue: SymbolRef[] = []
const pending = new Set<string>()
let running = 0

const today = () => Math.floor(Date.now() / 86_400_000)

async function load(ref: SymbolRef) {
  const key = symbolKey(ref)
  try {
    const { bars } = await adapters[ref.exchange].fetchKlines(ref.market, ref.symbol, getTf('1d'), 40)
    if (bars.length < 2) return
    const cur = bars[bars.length - 1]
    // последняя свеча — текущий день, он ещё не закончен и в ATR не участвует
    const atr = robustAtr(bars.slice(0, -1).map((b) => b.high - b.low))
    if (atr > 0) dayStats[key] = { atr, open: cur.open, high: cur.high, low: cur.low, day: Math.floor(cur.time / 86400), at: Date.now() }
  } catch {
    /* попробуем при следующем обновлении */
  } finally {
    pending.delete(key)
  }
}

function pump() {
  while (running < PARALLEL && queue.length) {
    const ref = queue.shift()!
    running++
    load(ref).finally(() => {
      running--
      pump()
    })
  }
}

/** Запрашивает дневные показатели, если их нет или они устарели */
export function ensureDayStats(ref: SymbolRef) {
  const key = symbolKey(ref)
  const s = dayStats[key]
  if ((s && Date.now() - s.at < FRESH_MS && s.day === today()) || pending.has(key)) return
  pending.add(key)
  queue.push(ref)
  pump()
}

/** Держит дневные показатели актуальными для реактивного списка инструментов */
export function useDayStats(source: WatchSource<SymbolRef[]>) {
  let current: SymbolRef[] = []
  const stop = watch(
    source,
    (list) => {
      current = list
      list.forEach(ensureDayStats)
    },
    { immediate: true, deep: true },
  )
  const timer = window.setInterval(() => {
    if (document.visibilityState === 'visible') current.forEach(ensureDayStats)
  }, 60_000)
  onScopeDispose(() => {
    stop()
    clearInterval(timer)
  })
}

/**
 * Сколько дневного ATR уже пройдено, %: fromOpen — от открытия дня до текущей цены,
 * traveled — по размаху дня (максимум − минимум).
 */
export function dayProgress(s: DayStats, last: number) {
  const high = Math.max(s.high, last)
  const low = Math.min(s.low, last)
  return { fromOpen: (Math.abs(last - s.open) / s.atr) * 100, traveled: ((high - low) / s.atr) * 100 }
}
