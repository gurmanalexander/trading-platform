import type { ExchangeId, MarketId, SymbolInfo } from '../types'
import { binance } from './binance'
import { bybit } from './bybit'
import type { ExchangeAdapter } from './types'

export const adapters: Record<ExchangeId, ExchangeAdapter> = { binance, bybit }

export const SOURCES: { exchange: ExchangeId; market: MarketId }[] = [
  { exchange: 'binance', market: 'spot' },
  { exchange: 'binance', market: 'futures' },
  { exchange: 'bybit', market: 'spot' },
  { exchange: 'bybit', market: 'futures' },
]

const TTL_MS = 5 * 60_000
const cache = new Map<string, { at: number; promise: Promise<SymbolInfo[]> }>()

/** Список инструментов рынка; кэшируется на несколько минут, ошибки не кэшируются */
export function loadSymbols(exchange: ExchangeId, market: MarketId): Promise<SymbolInfo[]> {
  const key = `${exchange}:${market}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.promise
  const promise = adapters[exchange].fetchSymbols(market)
  cache.set(key, { at: Date.now(), promise })
  promise.catch(() => {
    if (cache.get(key)?.promise === promise) cache.delete(key)
  })
  return promise
}
