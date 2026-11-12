export interface Timeframe {
  id: string
  label: string
  /** длительность в секундах (для месяца — приблизительно) */
  sec: number
  binance: string
  bybit: string
}

const M = 60
const H = 3600
const D = 86400

export const TIMEFRAMES: Timeframe[] = [
  { id: '1m', label: '1м', sec: M, binance: '1m', bybit: '1' },
  { id: '3m', label: '3м', sec: 3 * M, binance: '3m', bybit: '3' },
  { id: '5m', label: '5м', sec: 5 * M, binance: '5m', bybit: '5' },
  { id: '15m', label: '15м', sec: 15 * M, binance: '15m', bybit: '15' },
  { id: '30m', label: '30м', sec: 30 * M, binance: '30m', bybit: '30' },
  { id: '1h', label: '1ч', sec: H, binance: '1h', bybit: '60' },
  { id: '2h', label: '2ч', sec: 2 * H, binance: '2h', bybit: '120' },
  { id: '4h', label: '4ч', sec: 4 * H, binance: '4h', bybit: '240' },
  { id: '6h', label: '6ч', sec: 6 * H, binance: '6h', bybit: '360' },
  { id: '12h', label: '12ч', sec: 12 * H, binance: '12h', bybit: '720' },
  { id: '1d', label: '1Д', sec: D, binance: '1d', bybit: 'D' },
  { id: '1w', label: '1Н', sec: 7 * D, binance: '1w', bybit: 'W' },
  { id: '1M', label: '1Мес', sec: 30 * D, binance: '1M', bybit: 'M' },
]

export const DEFAULT_FAVORITE_TFS = ['1m', '5m', '1h', '4h', '1d']

const byId = new Map(TIMEFRAMES.map((t) => [t.id, t]))
export const getTf = (id: string): Timeframe => byId.get(id) ?? byId.get('1h')!
export const isTf = (id: unknown): id is string => typeof id === 'string' && byId.has(id)

/**
 * Интервал, набранный с клавиатуры: "5" и "15" — минуты, "1h"/"4ч" — часы, "D"/"1д" — день,
 * "W"/"н" — неделя, "M"/"мес" — месяц. Латинская m — минуты, M — месяц.
 */
export function parseTf(input: string): Timeframe | null {
  const m = /^(\d*)\s*([a-zA-Zа-яА-Я]*)$/.exec(input.trim())
  if (!m || (!m[1] && !m[2])) return null
  const n = m[1] ? parseInt(m[1], 10) : 1
  const u = m[2]
  const lower = u.toLowerCase()
  if (u === 'M' || lower === 'мес' || lower === 'mo') return n === 1 ? byId.get('1M')! : null
  let unit: number
  if (!u || u === 'm' || lower === 'м' || lower === 'мин' || lower === 'min') unit = M
  else if (lower === 'h' || lower === 'ч') unit = H
  else if (lower === 'd' || lower === 'д') unit = D
  else if (lower === 'w' || lower === 'н') unit = 7 * D
  else return null
  const sec = n * unit
  return TIMEFRAMES.find((t) => t.id !== '1M' && t.sec === sec) ?? null
}
