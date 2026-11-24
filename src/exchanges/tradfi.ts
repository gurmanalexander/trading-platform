import type { ExchangeId, MarketId } from '../types'

/**
 * Не криптовалюта: токенизированные акции и фонды, сырьё, валюты, доли компаний до IPO.
 * Определяется по полям самих бирж, а не по названию: COINUSDT на Binance — акция Coinbase,
 * а SPXUSDT — мемкоин, не индекс S&P 500.
 */
export type AssetKind = 'stock' | 'etf' | 'commodity' | 'forex' | 'preipo'

// подписи видов — русские строки, переводятся при показе: t(ASSET_KIND_NAMES[kind])
export const ASSET_KIND_NAMES: Record<AssetKind, string> = {
  stock: 'акция',
  etf: 'фонд',
  commodity: 'сырьё',
  forex: 'валюта',
  preipo: 'до IPO',
}

/**
 * Binance USDⓈ-M, GET /fapi/v1/exchangeInfo: у TradFi-контрактов contractType TRADIFI_PERPETUAL
 * и метка TradFi в underlyingSubType; вид — по underlyingType (EQUITY, HK_EQUITY, COMMODITY, FX, PREMARKET…).
 * Токенизированное золото PAXG и XAUT биржа считает криптовалютой — так и оставляем.
 */
export function binanceFuturesKind(row: { contractType?: string; underlyingType?: string; underlyingSubType?: string[] }): AssetKind | null {
  const tradfi = row.contractType === 'TRADIFI_PERPETUAL' || (Array.isArray(row.underlyingSubType) && row.underlyingSubType.includes('TradFi'))
  if (!tradfi) return null
  const u = row.underlyingType ?? ''
  if (u === 'PREMARKET' || row.underlyingSubType?.includes('Pre-IPO')) return 'preipo'
  if (u === 'COMMODITY') return 'commodity'
  if (u === 'FX') return 'forex'
  return 'stock'
}

/**
 * Bybit v5, GET /v5/market/instruments-info: поле symbolType. Фьючерсы — stock, ETF, commodity, forex
 * (доли до IPO — stock со статусом PreLaunch); спот — xstocks и mstocks (токенизированные акции).
 */
export function bybitKind(row: { symbolType?: string; status?: string }): AssetKind | null {
  switch ((row.symbolType ?? '').toLowerCase()) {
    case 'stock':
      return row.status === 'PreLaunch' ? 'preipo' : 'stock'
    case 'etf':
      return 'etf'
    case 'commodity':
      return 'commodity'
    case 'forex':
      return 'forex'
    case 'xstocks':
    case 'mstocks':
      return 'stock'
  }
  return null
}

export type KindMap = Map<string, AssetKind>

const TTL_MS = 6 * 3600_000
const cache = new Map<string, { at: number; promise: Promise<KindMap> }>()

/** Не криптовалютные инструменты рынка. Список меняется редко — держим его 6 часов; ошибки не кэшируются */
export function loadKinds(exchange: ExchangeId, market: MarketId, fetchKinds: (m: MarketId) => Promise<KindMap>): Promise<KindMap> {
  const key = `${exchange}:${market}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.promise
  const promise = fetchKinds(market)
  cache.set(key, { at: Date.now(), promise })
  promise.catch(() => {
    if (cache.get(key)?.promise === promise) cache.delete(key)
  })
  return promise
}
