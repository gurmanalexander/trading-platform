import type { Bar } from '../types'

/** Свечи Хейкен Аши по обычным свечам */
export function heikinAshi(bars: Bar[]): Bar[] {
  const out: Bar[] = new Array(bars.length)
  for (let i = 0; i < bars.length; i++) out[i] = heikinBar(bars[i], i ? out[i - 1] : null)
  return out
}

export function heikinBar(b: Bar, prev: Bar | null): Bar {
  const close = (b.open + b.high + b.low + b.close) / 4
  const open = prev ? (prev.open + prev.close) / 2 : (b.open + b.close) / 2
  return { time: b.time, open, close, high: Math.max(b.high, open, close), low: Math.min(b.low, open, close), volume: b.volume }
}

/** Индекс первой свечи с time >= t */
export function lowerBound(bars: Bar[], t: number): number {
  let lo = 0
  let hi = bars.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (bars[mid].time < t) lo = mid + 1
    else hi = mid
  }
  return lo
}
