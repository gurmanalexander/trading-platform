import { netOf, type Trade } from './types'

/** Отбор сделок для статистики */
export interface Filter {
  /** пусто — все счета */
  accounts?: string[]
  /** мс, включительно; по времени закрытия сделки */
  from?: number
  to?: number
  sym?: string
  side?: 1 | -1
  tag?: string
}

/** В статистику идут только закрытые сделки с известным входом */
export const countable = (t: Trade) => t.close > 0 && !t.partial

export function applyFilter(trades: Trade[], f: Filter, tagsOf?: (id: string) => string[] | undefined): Trade[] {
  const accts = f.accounts?.length ? new Set(f.accounts) : null
  return trades.filter((t) => {
    if (accts && !accts.has(t.acct)) return false
    const at = t.close || t.open
    if (f.from != null && at < f.from) return false
    if (f.to != null && at > f.to) return false
    if (f.sym && t.sym !== f.sym) return false
    if (f.side && t.side !== f.side) return false
    if (f.tag && !tagsOf?.(t.id)?.includes(f.tag)) return false
    return true
  })
}

export interface Summary {
  trades: number
  wins: number
  losses: number
  /** доля прибыльных среди сделок с ненулевым итогом, 0…1 */
  winRate: number
  net: number
  gross: number
  fees: number
  funding: number
  volume: number
  /** сумма прибылей / сумма убытков; Infinity, если убытков нет */
  profitFactor: number
  avgWin: number
  /** положительное число: средний размер убыточной сделки */
  avgLoss: number
  /** средняя прибыль / средний убыток */
  payoff: number
  /** средний итог сделки */
  expectancy: number
  best: Trade | null
  worst: Trade | null
  /** наибольшее падение накопленного итога от максимума */
  maxDrawdown: number
  winStreak: number
  lossStreak: number
  /** среднее время удержания, сек */
  avgHold: number
  avgHoldWin: number
  avgHoldLoss: number
}

export function summarize(all: Trade[]): Summary {
  const trades = all.filter(countable).sort((a, b) => a.close - b.close)
  const s: Summary = {
    trades: trades.length,
    wins: 0,
    losses: 0,
    winRate: 0,
    net: 0,
    gross: 0,
    fees: 0,
    funding: 0,
    volume: 0,
    profitFactor: 0,
    avgWin: 0,
    avgLoss: 0,
    payoff: 0,
    expectancy: 0,
    best: null,
    worst: null,
    maxDrawdown: 0,
    winStreak: 0,
    lossStreak: 0,
    avgHold: 0,
    avgHoldWin: 0,
    avgHoldLoss: 0,
  }
  let profit = 0
  let loss = 0
  let peak = 0
  let streak = 0
  let hold = 0
  let holdWin = 0
  let holdLoss = 0
  for (const t of trades) {
    const net = netOf(t)
    const dur = (t.close - t.open) / 1000
    s.net += net
    s.gross += t.gross
    s.fees += t.fee
    s.funding += t.funding
    s.volume += t.vol
    hold += dur
    if (net > 0) {
      s.wins++
      profit += net
      holdWin += dur
      streak = streak > 0 ? streak + 1 : 1
      s.winStreak = Math.max(s.winStreak, streak)
    } else if (net < 0) {
      s.losses++
      loss -= net
      holdLoss += dur
      streak = streak < 0 ? streak - 1 : -1
      s.lossStreak = Math.max(s.lossStreak, -streak)
    }
    if (!s.best || net > netOf(s.best)) s.best = t
    if (!s.worst || net < netOf(s.worst)) s.worst = t
    peak = Math.max(peak, s.net)
    s.maxDrawdown = Math.max(s.maxDrawdown, peak - s.net)
  }
  const decided = s.wins + s.losses
  s.winRate = decided ? s.wins / decided : 0
  s.profitFactor = loss > 0 ? profit / loss : profit > 0 ? Infinity : 0
  s.avgWin = s.wins ? profit / s.wins : 0
  s.avgLoss = s.losses ? loss / s.losses : 0
  s.payoff = s.avgLoss > 0 ? s.avgWin / s.avgLoss : 0
  s.expectancy = s.trades ? s.net / s.trades : 0
  s.avgHold = s.trades ? hold / s.trades : 0
  s.avgHoldWin = s.wins ? holdWin / s.wins : 0
  s.avgHoldLoss = s.losses ? holdLoss / s.losses : 0
  return s
}

// ---------- время ----------

/**
 * Дни считаются в выбранном часовом поясе: tzMin — смещение от UTC в минутах (Москва = 180).
 * Сдвигаем время и дальше работаем с ним как с UTC.
 */
const DAY = 86_400_000
export const dayIndex = (ms: number, tzMin: number) => Math.floor((ms + tzMin * 60_000) / DAY)
/** Начало дня (мс UTC) по его номеру */
export const dayStart = (day: number, tzMin: number) => day * DAY - tzMin * 60_000
export const dayKey = (day: number) => new Date(day * DAY).toISOString().slice(0, 10)

export interface DayStat {
  /** номер дня от начала эпохи в выбранном поясе */
  day: number
  net: number
  trades: number
  wins: number
  volume: number
}

/** Итог по дням закрытия сделок, по возрастанию даты; дни без сделок пропущены */
export function byDay(all: Trade[], tzMin: number): DayStat[] {
  const map = new Map<number, DayStat>()
  for (const t of all) {
    if (!countable(t)) continue
    const day = dayIndex(t.close, tzMin)
    let d = map.get(day)
    if (!d) map.set(day, (d = { day, net: 0, trades: 0, wins: 0, volume: 0 }))
    const net = netOf(t)
    d.net += net
    d.trades++
    d.volume += t.vol
    if (net > 0) d.wins++
  }
  return [...map.values()].sort((a, b) => a.day - b.day)
}

export interface EquityPoint {
  t: number
  /** накопленный итог после этой сделки */
  v: number
}

/** Накопленный итог по сделкам в порядке закрытия; первая точка — ноль перед первой сделкой */
export function equityCurve(all: Trade[]): EquityPoint[] {
  const trades = all.filter(countable).sort((a, b) => a.close - b.close)
  if (!trades.length) return []
  const out: EquityPoint[] = [{ t: trades[0].open, v: 0 }]
  let v = 0
  for (const t of trades) out.push({ t: t.close, v: (v += netOf(t)) })
  return out
}

// ---------- разрезы ----------

export interface Group {
  key: string
  trades: number
  wins: number
  net: number
  volume: number
}

export function groupBy(all: Trade[], keyOf: (t: Trade) => string | string[] | null): Group[] {
  const map = new Map<string, Group>()
  for (const t of all) {
    if (!countable(t)) continue
    const k = keyOf(t)
    for (const key of k == null ? [] : Array.isArray(k) ? k : [k]) {
      let g = map.get(key)
      if (!g) map.set(key, (g = { key, trades: 0, wins: 0, net: 0, volume: 0 }))
      const net = netOf(t)
      g.trades++
      g.net += net
      g.volume += t.vol
      if (net > 0) g.wins++
    }
  }
  return [...map.values()]
}

export const bySymbol = (all: Trade[]) => groupBy(all, (t) => t.sym).sort((a, b) => b.net - a.net)

export const bySide = (all: Trade[]) => {
  const g = groupBy(all, (t) => (t.side > 0 ? 'long' : 'short'))
  const empty = (key: string): Group => ({ key, trades: 0, wins: 0, net: 0, volume: 0 })
  return ['long', 'short'].map((k) => g.find((x) => x.key === k) ?? empty(k))
}

/** По дням недели закрытия: 0 — понедельник … 6 — воскресенье; все семь, включая пустые */
export function byWeekday(all: Trade[], tzMin: number): Group[] {
  const g = groupBy(all, (t) => String((dayIndex(t.close, tzMin) + 3) % 7)) // 1 января 1970 — четверг
  return Array.from({ length: 7 }, (_, i) => g.find((x) => x.key === String(i)) ?? { key: String(i), trades: 0, wins: 0, net: 0, volume: 0 })
}

/** По часу открытия сделки (0…23) в выбранном поясе */
export function byHour(all: Trade[], tzMin: number): Group[] {
  const hour = (ms: number) => Math.floor((((ms + tzMin * 60_000) % DAY) + DAY) % DAY / 3_600_000)
  const g = groupBy(all, (t) => String(hour(t.open)))
  return Array.from({ length: 24 }, (_, i) => g.find((x) => x.key === String(i)) ?? { key: String(i), trades: 0, wins: 0, net: 0, volume: 0 })
}

/** Границы длительности удержания, сек: до 5 минут, до 15, до часа, до 4 часов, до суток, дольше */
export const HOLD_BUCKETS = [300, 900, 3600, 14_400, 86_400, Infinity]

export function byHold(all: Trade[]): Group[] {
  const g = groupBy(all, (t) => String(HOLD_BUCKETS.findIndex((lim) => (t.close - t.open) / 1000 < lim)))
  return HOLD_BUCKETS.map((_, i) => g.find((x) => x.key === String(i)) ?? { key: String(i), trades: 0, wins: 0, net: 0, volume: 0 })
}

export const byTag = (all: Trade[], tagsOf: (id: string) => string[] | undefined) =>
  groupBy(all, (t) => tagsOf(t.id) ?? null).sort((a, b) => b.net - a.net)
