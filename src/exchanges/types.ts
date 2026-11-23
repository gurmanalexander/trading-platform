import type { Bar, MarketId, SymbolInfo, Ticker } from '../types'
import type { Timeframe } from '../lib/timeframes'
import type { SocketStatus } from './ws'
import type { Ref } from 'vue'
import type { KindMap } from './tradfi'

/** Открытый интерес на момент time (сек) */
export interface OiPoint {
  time: number
  value: number
}

/** Самый крупный шаг из доступных бирже, не крупнее интервала свечей (сек → название шага) */
export function oiPeriod<T>(periods: [number, T][], tfSec: number): [number, T] {
  let best = periods[0]
  for (const p of periods) if (p[0] <= tfSec) best = p
  return best
}

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
  /** Тикер одного инструмента по REST — запасной путь, если поток по нему замолчал */
  fetchTicker(market: MarketId, symbol: string): Promise<{ ticker: Ticker; raw: (string | undefined)[] }>
  /** Подписывается на поток тикера заново (соединение то же) */
  refreshTicker(market: MarketId, symbol: string): void
  /**
   * Открытый интерес фьючерса (в монетах) по возрастанию времени: точки с шагом не крупнее tfSec,
   * но не мельче 5 минут, примерно count штук. На споте — пустой список.
   */
  fetchOpenInterest(market: MarketId, symbol: string, tfSec: number, count: number): Promise<OiPoint[]>
  /** Все торгуемые инструменты рынка с ценой и оборотом */
  fetchSymbols(market: MarketId): Promise<SymbolInfo[]>
  /** Акции, фонды, сырьё и прочие не криптовалютные инструменты рынка: символ → вид */
  fetchKinds(market: MarketId): Promise<KindMap>
  status(market: MarketId): Ref<SocketStatus>
  /** Пересоздаёт соединения с биржей: подписки восстанавливаются сами */
  reconnect(): void
}
