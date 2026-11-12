import { reactive } from 'vue'
import { sameSymbol, type SymbolRef } from '../types'
import { load, persist } from '../lib/storage'

const DEFAULTS: SymbolRef[] = [
  { exchange: 'binance', market: 'spot', symbol: 'BTCUSDT' },
  { exchange: 'binance', market: 'spot', symbol: 'ETHUSDT' },
  { exchange: 'binance', market: 'spot', symbol: 'SOLUSDT' },
  { exchange: 'binance', market: 'spot', symbol: 'BNBUSDT' },
  { exchange: 'binance', market: 'spot', symbol: 'XRPUSDT' },
  { exchange: 'binance', market: 'futures', symbol: 'BTCUSDT' },
  { exchange: 'bybit', market: 'futures', symbol: 'BTCUSDT' },
  { exchange: 'bybit', market: 'futures', symbol: 'ETHUSDT' },
  { exchange: 'bybit', market: 'spot', symbol: 'BTCUSDT' },
  { exchange: 'bybit', market: 'spot', symbol: 'SOLUSDT' },
]

export const watchlist = reactive<SymbolRef[]>(
  load<SymbolRef[]>('watchlist', DEFAULTS).filter((r) => r && r.exchange && r.market && r.symbol),
)

persist('watchlist', watchlist, () => watchlist)

export const inWatchlist = (ref: SymbolRef) => watchlist.some((r) => sameSymbol(r, ref))

export function toggleWatch(ref: SymbolRef) {
  const i = watchlist.findIndex((r) => sameSymbol(r, ref))
  if (i >= 0) watchlist.splice(i, 1)
  else watchlist.push({ exchange: ref.exchange, market: ref.market, symbol: ref.symbol })
}
