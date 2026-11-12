/**
 * Расчёты по дневному ATR — те же формулы и значения по умолчанию, что в индикаторе «Trader Assistant».
 *
 * ATR — среднее диапазонов (high − low) пяти предыдущих завершённых дневных свечей; текущий день
 * в расчёт не входит. Стоп — 10% ATR, тейк — 4 стопа, люфт — 10% стопа. Для входа «по пятиминуткам»
 * стоп — два ATR(30) пятиминутного графика.
 */
export const ATR_LENGTH = 5
export const STOP_PART = 0.1
export const TAKE_RATIO = 4
export const SLIP_PART = 0.1
/** ATR исчерпан меньше чем на 30% — запас хода есть; больше 70% — ход на исходе */
export const FRESH_BELOW = 30
export const SPENT_ABOVE = 70
export const ATR5_LENGTH = 30
export const ATR5_STOP = 2
/** Дневной оборот, ниже которого монету лучше не торговать, $ */
export const MIN_DAY_VOLUME = 30_000_000

/** ranges — диапазоны завершённых дневных свечей от старых к новым */
export function dailyAtr(ranges: number[], len = ATR_LENGTH): number {
  const last = ranges.filter((r) => isFinite(r)).slice(-len)
  if (!last.length) return 0
  return last.reduce((s, v) => s + v, 0) / last.length
}

/** ATR Уайлдера (ta.atr): сглаженное RMA истинного диапазона */
export function wilderAtr(bars: { high: number; low: number; close: number }[], len = ATR5_LENGTH): number {
  if (bars.length < 2) return 0
  const tr: number[] = []
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i]
    const prev = i ? bars[i - 1].close : b.close
    tr.push(Math.max(b.high - b.low, Math.abs(b.high - prev), Math.abs(b.low - prev)))
  }
  const n = Math.min(len, tr.length)
  let rma = tr.slice(0, n).reduce((s, v) => s + v, 0) / n
  for (let i = n; i < tr.length; i++) rma = (rma * (len - 1) + tr[i]) / len
  return rma
}

/** Стоп, тейк и люфт в пунктах цены от «базы»: дневного ATR либо двух ATR пятиминутки */
export function riskFrom(stop: number) {
  return { stop, take: stop * TAKE_RATIO, slip: stop * SLIP_PART }
}
export const dailyRisk = (atr: number) => riskFrom(atr * STOP_PART)
export const fiveMinRisk = (atr5: number) => riskFrom(atr5 * ATR5_STOP)

export interface DayBar {
  open: number
  high: number
  low: number
}

/**
 * Насколько исчерпан дневной ATR, %: fromOpen — от открытия дня до текущей цены,
 * traveled — по размаху дня (максимум − минимум).
 */
export function atrSpent(atr: number, day: DayBar, last: number) {
  const high = Math.max(day.high, last)
  const low = Math.min(day.low, last)
  return { fromOpen: (Math.abs(last - day.open) / atr) * 100, traveled: ((high - low) / atr) * 100 }
}

/** Куда цена может дойти за день по ATR: от открытия и от уже показанных минимума и максимума */
export function atrBounds(atr: number, day: DayBar, last: number) {
  const high = Math.max(day.high, last)
  const low = Math.min(day.low, last)
  return { maxFromOpen: day.open + atr, minFromOpen: day.open - atr, maxFromLow: low + atr, minFromHigh: high - atr }
}

export const spentTone = (pct: number) => (pct < FRESH_BELOW ? 'up' : pct > SPENT_ABOVE ? 'down' : '')
