import type { Bar, MarketId, SymbolInfo, Ticker } from '../types'
import type { Timeframe } from '../lib/timeframes'
import type { SocketStatus } from './ws'
import type { Ref } from 'vue'

export interface KlinesResult {
  bars: Bar[]
  /** знаков после запятой в ценах инструмента */
  precision: number
}

export interface ExchangeAdapter {
  /** Свечи по возрастанию времени. endTime — мс, свечи строго раньше этого момента */
  fetchKlines(market: MarketId, symbol: string, tf: Timeframe, limit: number, endTime?: number): Promise<KlinesResult>
  subscribeKline(
    market: MarketId,
    symbol: string,
    tf: Timeframe,
    onBar: (bar: Bar) => void,
    onReconnect: () => void,
  ): () => void
  subscribeTicker(market: MarketId, symbol: string, onTicker: (t: Ticker, rawPrices: (string | undefined)[]) => void): () => void
  /** Все торгуемые инструменты рынка с ценой и оборотом */
  fetchSymbols(market: MarketId): Promise<SymbolInfo[]>
  status(market: MarketId): Ref<SocketStatus>
}
