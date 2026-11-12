import type { Drawing, Pt } from '../stores/drawings'

/** Соотношение прибыль/риск позиции: |цель − вход| / |вход − стоп| */
export function riskReward(d: Drawing): number {
  const risk = Math.abs(d.pts[0].p - d.pts[2].p)
  return risk ? Math.abs(d.pts[1].p - d.pts[0].p) / risk : 0
}

/**
 * Перемещение маркера позиции с сохранением порядка уровней: у длинной цель выше входа, стоп ниже,
 * у короткой наоборот. handle: 0 — вход, 1 — цель, 2 — стоп, 3 — правый край.
 */
export function movePositionHandle(d: Drawing, handle: number, pt: Pt, minGap: number, barSec: number) {
  const sign = d.type === 'long' ? 1 : -1
  const [entry, target, stop] = d.pts
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
  if (handle === 0) {
    const lo = Math.min(target.p, stop.p) + minGap
    const hi = Math.max(target.p, stop.p) - minGap
    entry.p = lo <= hi ? clamp(pt.p, lo, hi) : entry.p
    entry.t = Math.min(pt.t, target.t - barSec)
    stop.t = entry.t
  } else if (handle === 1) {
    target.p = sign > 0 ? Math.max(pt.p, entry.p + minGap) : Math.min(pt.p, entry.p - minGap)
  } else if (handle === 2) {
    stop.p = sign > 0 ? Math.min(pt.p, entry.p - minGap) : Math.max(pt.p, entry.p + minGap)
  } else {
    target.t = Math.max(pt.t, entry.t + barSec)
  }
}
