export type ExchangeId = 'binance' | 'bybit'
export type MarketId = 'spot' | 'futures'

export interface SymbolRef {
  exchange: ExchangeId
  market: MarketId
  symbol: string
}

/** Свеча. time — начало свечи, секунды UTC */
export interface Bar {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface Ticker {
  last: number
  changePct: number
  high: number
  low: number
  /** оборот за 24ч в валюте котировки */
  quoteVolume: number
}

export interface SymbolInfo extends SymbolRef {
  last: number
  changePct: number
  quoteVolume: number
}

export const symbolKey = (r: SymbolRef) => `${r.exchange}:${r.market}:${r.symbol}`

export const sameSymbol = (a: SymbolRef, b: SymbolRef) =>
  a.exchange === b.exchange && a.market === b.market && a.symbol === b.symbol

export const EXCHANGE_NAMES: Record<ExchangeId, string> = { binance: 'Binance', bybit: 'Bybit' }
export const MARKET_NAMES: Record<MarketId, string> = { spot: 'Спот', futures: 'Фьючерсы' }
