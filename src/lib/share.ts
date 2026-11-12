import type { ExchangeId, MarketId } from '../types'
import { formatSetup, type Setup } from './setup'
import { formatSignal } from './signal'

/** Позиция в ссылке: стороны, цены и время от входа до правого края */
export interface SharePos {
  side: 'long' | 'short'
  entry: number
  stop: number
  target: number
  t: number
  t2: number
}

/** То, чем делятся: монета, направление, дата графика, уровни и позиции */
export interface SharePack {
  symbol: string
  exchange?: ExchangeId
  market?: MarketId
  side?: 'long' | 'short'
  date?: { y: number; m: number; d: number }
  levels: number[]
  positions: SharePos[]
}

/** n уровней, ближайших к цене; порядок — от ближнего к дальнему */
export function nearestLevels(levels: number[], price: number, n = 3): number[] {
  return [...new Set(levels)].sort((a, b) => Math.abs(a - price) - Math.abs(b - price)).slice(0, n)
}

const b64 = (s: string) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const unb64 = (s: string) => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))))

/** Компактная запись для адреса страницы */
export function encodeShare(p: SharePack): string {
  const o: Record<string, unknown> = { s: p.symbol }
  if (p.exchange) o.e = p.exchange
  if (p.market) o.m = p.market
  if (p.side) o.d = p.side === 'long' ? 1 : -1
  if (p.date) o.t = [p.date.y, p.date.m, p.date.d]
  if (p.levels.length) o.l = p.levels
  if (p.positions.length) o.p = p.positions.map((x) => [x.side === 'long' ? 1 : -1, x.entry, x.stop, x.target, x.t, x.t2])
  return b64(JSON.stringify(o))
}

const num = (v: unknown): v is number => typeof v === 'number' && isFinite(v)

export function decodeShare(code: string): SharePack | null {
  try {
    const o = JSON.parse(unb64(code))
    if (!o || typeof o.s !== 'string' || !/^[A-Z0-9]{2,24}$/.test(o.s)) return null
    const pack: SharePack = { symbol: o.s, levels: [], positions: [] }
    if (o.e === 'binance' || o.e === 'bybit') pack.exchange = o.e
    if (o.m === 'spot' || o.m === 'futures') pack.market = o.m
    if (o.d === 1 || o.d === -1) pack.side = o.d === 1 ? 'long' : 'short'
    if (Array.isArray(o.t) && o.t.length === 3 && o.t.every(num)) pack.date = { y: o.t[0], m: o.t[1], d: o.t[2] }
    if (Array.isArray(o.l)) pack.levels = o.l.filter((v: unknown) => num(v) && v > 0).slice(0, 10)
    if (Array.isArray(o.p)) {
      for (const x of o.p.slice(0, 10)) {
        if (!Array.isArray(x) || x.length < 6 || !x.slice(1).every(num)) continue
        pack.positions.push({ side: x[0] === 1 ? 'long' : 'short', entry: x[1], stop: x[2], target: x[3], t: x[4], t2: x[5] })
      }
    }
    return pack
  } catch {
    return null
  }
}

/** Часть ссылки после адреса приложения: короткая читаемая строка, если хватает её, иначе — упакованные данные */
export function shareQuery(p: SharePack): string {
  if (!p.positions.length && p.levels.length <= 1) {
    const s: Setup = { symbol: p.symbol, exchange: p.exchange, market: p.market, side: p.side, date: p.date, level: p.levels[0] }
    return '?q=' + encodeURIComponent(formatSetup(s))
  }
  return '#share=' + encodeShare(p)
}

/** То же текстом — для мессенджера: строки сетапа (по одной на уровень) и позиции в формате сделки */
export function shareText(p: SharePack, precision: number): string {
  const base: Setup = { symbol: p.symbol, exchange: p.exchange, market: p.market, side: p.side }
  const lines = p.levels.length
    ? p.levels.map((level, i) => formatSetup({ ...base, level, date: i === 0 ? p.date : undefined }))
    : [formatSetup({ ...base, date: p.date })]
  const blocks = [lines.join('\n')]
  for (const x of p.positions) blocks.push(formatSignal(p.symbol, x.side, x.entry, x.stop, x.target, precision))
  return blocks.join('\n\n')
}
