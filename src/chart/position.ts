import type { Bar } from '../types'
import type { Drawing, Pt } from '../stores/drawings'

const isPositionDrawing = (d: Drawing) => d.type === 'long' || d.type === 'short'

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

/**
 * Задаёт цены позиции числами. Направление определяется расположением цели и стопа:
 * цель выше входа и стоп ниже — лонг, наоборот — шорт. false — цены несовместимы
 * (цель и стоп по одну сторону от входа), позиция не меняется.
 */
export function setPositionPrices(d: Drawing, entry: number, stop: number, target: number): boolean {
  if (!(entry > 0 && stop > 0 && target > 0)) return false
  if (target > entry && stop < entry) d.type = 'long'
  else if (target < entry && stop > entry) d.type = 'short'
  else return false
  d.pts[0].p = entry
  d.pts[1].p = target
  d.pts[2].p = stop
  return true
}

export interface PositionState {
  /** pending — время входа ещё не наступило; open — идёт; tp/sl — закрыта по цели или стопу */
  status: 'pending' | 'open' | 'tp' | 'sl'
  /** результат в R: сколько рисков прошла цена от входа (у закрытой — итог) */
  r: number
  /** где сделка сейчас или где закрылась */
  exitTime: number
  exitPrice: number
}

/**
 * Ход сделки по свечам после времени входа. Если одна свеча задела и стоп, и цель,
 * считаем, что первым был стоп: по свече порядок не восстановить, а это осторожная оценка.
 */
export function evaluatePosition(d: Drawing, bars: Bar[], lastPrice?: number): PositionState {
  const entry = d.pts[0].p
  const target = d.pts[1].p
  const stop = d.pts[2].p
  const t0 = d.pts[0].t
  const sign = d.type === 'long' ? 1 : -1
  const risk = Math.abs(entry - stop)
  const n = bars.length
  if (!n || !risk || bars[n - 1].time < t0) return { status: 'pending', r: 0, exitTime: t0, exitPrice: entry }
  let lo = 0
  let hi = n
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (bars[mid].time < t0) lo = mid + 1
    else hi = mid
  }
  for (let i = lo; i < n; i++) {
    const b = bars[i]
    const hitStop = sign > 0 ? b.low <= stop : b.high >= stop
    const hitTarget = sign > 0 ? b.high >= target : b.low <= target
    if (hitStop) return { status: 'sl', r: -1, exitTime: b.time, exitPrice: stop }
    if (hitTarget) return { status: 'tp', r: Math.abs(target - entry) / risk, exitTime: b.time, exitPrice: target }
  }
  const price = lastPrice ?? bars[n - 1].close
  return { status: 'open', r: (sign * (price - entry)) / risk, exitTime: bars[n - 1].time, exitPrice: price }
}

/** Самая поздняя по времени входа позиция среди рисунков инструмента */
export function latestPosition(list: Drawing[] | undefined): Drawing | null {
  let best: Drawing | null = null
  if (list) for (const d of list) if (isPositionDrawing(d) && d.pts.length >= 3 && (!best || d.pts[0].t > best.pts[0].t)) best = d
  return best
}

/** «+1.2R», «-0.5R», «0R» */
export function fmtR(r: number): string {
  if (!isFinite(r) || Math.abs(r) < 0.05) return '0R'
  return (r > 0 ? '+' : '') + r.toFixed(Math.abs(r) >= 10 ? 0 : 1) + 'R'
}
