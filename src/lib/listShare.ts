import type { ExchangeId, MarketId } from '../types'

/**
 * «Поделиться списком»: по каждой монете — строка «#BNBUSDT Short 677,76» (монета, направление, уровень).
 * Формат тот же, что понимает вставка сетапов, так что список можно вставить и обратно в приложение.
 */
export interface ShareCoin {
  symbol: string
  exchange: ExchangeId
  market: MarketId
  side?: 'long' | 'short' | null
  /** горизонтальные уровни монеты */
  levels: number[]
  /** текущая цена; без неё уровень выбрать нельзя */
  last?: number
  /** знаков после запятой у цены инструмента */
  precision: number
}

/** Уровень, ближайший к цене */
export function nearestLevel(levels: number[], last: number | undefined): number | undefined {
  if (!levels.length || !last || !(last > 0)) return undefined
  let best = levels[0]
  for (const l of levels) if (Math.abs(l - last) < Math.abs(best - last)) best = l
  return best
}

/** Цена для текста: без лишних нулей в хвосте и с запятой — «677,76», «0,0053656» */
export function plainPrice(v: number, precision: number): string {
  let s = v.toFixed(Math.min(12, Math.max(0, precision)))
  if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '')
  return s.replace('.', ',')
}

/**
 * Строка монеты. Биржа и рынок пишутся, только если они не те, на которых получатель
 * откроет монету по умолчанию (defaults).
 */
export function shareLine(c: ShareCoin, defaults: { exchange: ExchangeId; market: MarketId }): string {
  const parts: string[] = []
  if (c.exchange !== defaults.exchange) parts.push(c.exchange)
  if (c.market !== defaults.market) parts.push(c.market)
  parts.push('#' + c.symbol)
  if (c.side) parts.push(c.side === 'long' ? 'Long' : 'Short')
  const level = nearestLevel(c.levels, c.last)
  if (level !== undefined) parts.push(plainPrice(level, c.precision))
  return parts.join(' ')
}
