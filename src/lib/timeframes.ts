import { i18n } from './i18n'

export interface Timeframe {
  id: string
  /** подпись на языке интерфейса */
  readonly label: string
  /** длительность в секундах (для месяца — приблизительно) */
  sec: number
  binance: string
  bybit: string
}

const M = 60
const H = 3600
const D = 86400

/** Интервал с подписью, которая читает язык при каждом обращении: tf.label везде сразу на текущем языке */
const tf = (id: string, ru: string, en: string, rest: Omit<Timeframe, 'id' | 'label'>): Timeframe => ({
  id,
  get label() {
    return i18n.lang === 'en' ? en : ru
  },
  ...rest,
})

export const TIMEFRAMES: Timeframe[] = [
  tf('1m', '1м', '1m', { sec: M, binance: '1m', bybit: '1' }),
  tf('3m', '3м', '3m', { sec: 3 * M, binance: '3m', bybit: '3' }),
  tf('5m', '5м', '5m', { sec: 5 * M, binance: '5m', bybit: '5' }),
  tf('15m', '15м', '15m', { sec: 15 * M, binance: '15m', bybit: '15' }),
  tf('30m', '30м', '30m', { sec: 30 * M, binance: '30m', bybit: '30' }),
  tf('1h', '1ч', '1h', { sec: H, binance: '1h', bybit: '60' }),
  tf('2h', '2ч', '2h', { sec: 2 * H, binance: '2h', bybit: '120' }),
  tf('4h', '4ч', '4h', { sec: 4 * H, binance: '4h', bybit: '240' }),
  tf('6h', '6ч', '6h', { sec: 6 * H, binance: '6h', bybit: '360' }),
  tf('12h', '12ч', '12h', { sec: 12 * H, binance: '12h', bybit: '720' }),
  tf('1d', '1Д', '1D', { sec: D, binance: '1d', bybit: 'D' }),
  tf('1w', '1Н', '1W', { sec: 7 * D, binance: '1w', bybit: 'W' }),
  tf('1M', '1Мес', '1M', { sec: 30 * D, binance: '1M', bybit: 'M' }),
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
