import { onScopeDispose, shallowReactive, watch, type WatchSource } from 'vue'
import { symbolKey, type SymbolRef } from '../types'
import { adapters } from '../exchanges'
import { getTf } from '../lib/timeframes'
import { atrSpent, dailyAtr, wilderAtr } from '../lib/atr'

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
    const atr = dailyAtr(bars.slice(0, -1).map((b) => b.high - b.low))
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

/** Сколько дневного ATR уже пройдено, % (см. atrSpent) */
export function dayProgress(s: DayStats, last: number) {
  return atrSpent(s.atr, s, last)
}

// ---------- ATR пятиминутного графика: для расчётного стопа «по пятиминуткам» ----------

export const atr5 = shallowReactive<Record<string, { value: number; at: number }>>({})
const pending5 = new Set<string>()

export async function ensureAtr5(ref: SymbolRef) {
  const key = symbolKey(ref)
  const s = atr5[key]
  if ((s && Date.now() - s.at < 60_000) || pending5.has(key)) return
  pending5.add(key)
  try {
    const { bars } = await adapters[ref.exchange].fetchKlines(ref.market, ref.symbol, getTf('5m'), 300)
    // последняя свеча ещё формируется — как и в индикаторе, она участвует в расчёте
    const value = wilderAtr(bars)
    if (value > 0) atr5[key] = { value, at: Date.now() }
  } catch {
    /* попробуем при следующем обновлении */
  } finally {
    pending5.delete(key)
  }
}

/** Держит ATR пятиминутки актуальным для инструмента окна */
export function useAtr5(source: WatchSource<SymbolRef | null>) {
  let current: SymbolRef | null = null
  const stop = watch(
    source,
    (ref) => {
      current = ref
      if (ref) ensureAtr5(ref)
    },
    { immediate: true, deep: true },
  )
  const timer = window.setInterval(() => {
    if (current && document.visibilityState === 'visible') ensureAtr5(current)
  }, 60_000)
  onScopeDispose(() => {
    stop()
    clearInterval(timer)
  })
}
