import type { ExchangeId, MarketId, SymbolInfo } from '../types'
import { binance } from './binance'
import { bybit } from './bybit'
import type { ExchangeAdapter } from './types'

export const adapters: Record<ExchangeId, ExchangeAdapter> = { binance, bybit }

export const SOURCES: { exchange: ExchangeId; market: MarketId }[] = [
  { exchange: 'binance', market: 'futures' },
  { exchange: 'binance', market: 'spot' },
  { exchange: 'bybit', market: 'futures' },
  { exchange: 'bybit', market: 'spot' },
]

const TTL_MS = 5 * 60_000
const cache = new Map<string, { at: number; promise: Promise<SymbolInfo[]> }>()

/** Список инструментов рынка. Ответ кэшируется (maxAgeMs), ошибки не кэшируются */
export function loadSymbols(exchange: ExchangeId, market: MarketId, maxAgeMs = TTL_MS): Promise<SymbolInfo[]> {
  const key = `${exchange}:${market}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < maxAgeMs) return hit.promise
  const promise = adapters[exchange].fetchSymbols(market)
  cache.set(key, { at: Date.now(), promise })
  promise.catch(() => {
    if (cache.get(key)?.promise === promise) cache.delete(key)
  })
  return promise
}

export interface SymbolVolume extends SymbolInfo {
  /** оборот за 24ч, приведённый к долларам — чтобы сравнивать пары с разной валютой котировки */
  usdVolume: number
}

const STABLE = ['USDT', 'USDC', 'FDUSD', 'TUSD', 'BUSD', 'USDE', 'USD1', 'DAI', 'PERP', 'USD']
const OTHER_QUOTES = ['BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'TRX', 'DOGE', 'EUR', 'TRY', 'BRL', 'JPY', 'ARS', 'MXN', 'PLN', 'RON', 'UAH', 'ZAR', 'CZK', 'COP', 'IDR', 'GBP', 'AUD']

/** Пересчитывает оборот в доллары по ценам из того же списка (BTCUSDT, USDTTRY и т.п.) */
export function withUsdVolume(list: SymbolInfo[]): SymbolVolume[] {
  const price = new Map(list.map((s) => [s.symbol, s.last]))
  return list.map((s) => {
    let usd = 0
    if (STABLE.some((q) => s.symbol.endsWith(q)) || s.symbol.includes('-')) usd = s.quoteVolume
    else {
      const q = OTHER_QUOTES.find((x) => s.symbol.endsWith(x))
      if (q) {
        const direct = price.get(q + 'USDT')
        const inverse = price.get('USDT' + q)
        if (direct) usd = s.quoteVolume * direct
        else if (inverse) usd = s.quoteVolume / inverse
      }
    }
    return { ...s, usdVolume: usd }
  })
}
