/**
 * Дневной ATR без аномальных свечей.
 *
 * Берутся диапазоны (high − low) завершённых дневных свечей. Опорное значение — медиана последних
 * `len` диапазонов. От новых к старым набираются `len` свечей, чей диапазон укладывается
 * в [lower, upper] от опорного; их среднее — новое опорное, и отбор повторяется ещё раз уже
 * относительно среднего. Результат — среднее отобранных свечей.
 */
export const ATR_LENGTH = 5
export const ATR_UPPER = 1.5
export const ATR_LOWER = 0.5
/** Сколько дней назад можно уходить в поисках «нормальных» свечей */
const LOOKBACK = 60

const avg = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length

function median(a: number[]): number {
  const s = a.slice().sort((x, y) => x - y)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** ranges — диапазоны завершённых дневных свечей от старых к новым */
export function robustAtr(ranges: number[], len = ATR_LENGTH, upper = ATR_UPPER, lower = ATR_LOWER): number {
  const clean = ranges.filter((r) => r > 0 && isFinite(r)).slice(-LOOKBACK)
  if (!clean.length) return 0
  let ref = median(clean.slice(-len))
  for (let pass = 0; pass < 2; pass++) {
    const picked: number[] = []
    for (let i = clean.length - 1; i >= 0 && picked.length < len; i--) {
      if (clean[i] >= lower * ref && clean[i] <= upper * ref) picked.push(clean[i])
    }
    if (!picked.length) break
    ref = avg(picked)
  }
  return ref
}
