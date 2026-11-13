import type { Bar, MarketId, SymbolInfo } from '../types'
import { decimalsOf } from '../lib/format'
import { getJson } from './http'
import { StreamSocket, type StreamConfig } from './ws'
import type { ExchangeAdapter } from './types'

// Спот: data-api.binance.vision / data-stream.binance.vision — официальные адреса «только рыночные данные».
// Фьючерсы USDⓈ-M: свечи и тикеры идут по маршруту /market; прежний общий адрес оставлен запасным.
const REST: Record<MarketId, string[]> = {
  spot: ['https://data-api.binance.vision', 'https://api.binance.com', 'https://api-gcp.binance.com'],
  futures: ['https://fapi.binance.com'],
}
const KLINES: Record<MarketId, string> = { spot: '/api/v3/klines', futures: '/fapi/v1/klines' }
const TICKERS: Record<MarketId, string> = { spot: '/api/v3/ticker/24hr?type=MINI', futures: '/fapi/v1/ticker/24hr' }

const WS: Record<MarketId, string[]> = {
  spot: ['wss://data-stream.binance.vision/stream', 'wss://stream.binance.com:443/stream'],
  futures: ['wss://fstream.binance.com/market/stream', 'wss://fstream.binance.com/stream'],
}

const baseCfg: Omit<StreamConfig, 'urls'> = {
  encodeSub: (params, id) => ({ method: 'SUBSCRIBE', params, id }),
  encodeUnsub: (params, id) => ({ method: 'UNSUBSCRIBE', params, id }),
  topicOf: (msg) => msg.stream,
  failedId: (msg) => (msg.error && typeof msg.id === 'number' ? msg.id : undefined),
  ping: (id) => ({ method: 'LIST_SUBSCRIPTIONS', id }),
  pingMs: 30_000,
  maxTopicsPerMsg: 100,
  sendGapMs: 260, // лимит: 5 входящих сообщений в секунду
}

const sockets = new Map<MarketId, StreamSocket>()
function marketSocket(m: MarketId): StreamSocket {
  let s = sockets.get(m)
  if (!s) sockets.set(m, (s = new StreamSocket({ ...baseCfg, urls: WS[m] })))
  return s
}

const DAY = 86_400_000

export const binance: ExchangeAdapter = {
  async fetchKlines(market, symbol, tf, limit, endTime) {
    let path = `${KLINES[market]}?symbol=${symbol}&interval=${tf.binance}&limit=${Math.min(limit, 1000)}`
    if (endTime) path += `&endTime=${endTime - 1}`
    const rows: any[][] = await getJson(REST[market], path)
    const bars: Bar[] = new Array(rows.length)
    let precision = 0
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]
      bars[i] = { time: r[0] / 1000, open: +r[1], high: +r[2], low: +r[3], close: +r[4], volume: +r[5] }
      for (let k = 1; k <= 4; k++) {
        const d = decimalsOf(r[k])
        if (d > precision) precision = d
      }
    }
    return { bars, precision }
  },

  subscribeKline(market, symbol, tf, onBar, onReconnect) {
    const s = marketSocket(market)
    const off = s.subscribe(`${symbol.toLowerCase()}@kline_${tf.binance}`, (msg) => {
      const k = msg.data?.k
      if (!k) return
      onBar({ time: k.t / 1000, open: +k.o, high: +k.h, low: +k.l, close: +k.c, volume: +k.v })
    })
    const offRe = s.onReconnect(onReconnect)
    return () => {
      off()
      offRe()
    }
  },

  subscribeTicker(market, symbol, onTicker) {
    return marketSocket(market).subscribe(`${symbol.toLowerCase()}@miniTicker`, (msg) => {
      const d = msg.data
      if (!d) return
      const last = +d.c
      const open = +d.o
      onTicker(
        { last, changePct: open ? ((last - open) / open) * 100 : 0, high: +d.h, low: +d.l, quoteVolume: +d.q },
        [d.c, d.o, d.h, d.l],
      )
    })
  },

  async fetchSymbols(market) {
    const rows: any[] = await getJson(REST[market], TICKERS[market])
    const fresh = Date.now() - 2 * DAY
    const out: SymbolInfo[] = []
    for (const r of rows) {
      const quoteVolume = +r.quoteVolume
      // снятые с торгов пары остаются в ответе с нулевым оборотом и старым временем
      if (!quoteVolume || r.closeTime < fresh) continue
      const last = +r.lastPrice
      const open = +r.openPrice
      out.push({
        exchange: 'binance',
        market,
        symbol: r.symbol,
        last,
        changePct: open ? ((last - open) / open) * 100 : 0,
        quoteVolume,
      })
    }
    return out
  },

  status: (market) => marketSocket(market).status,
  reconnect: () => sockets.forEach((s) => s.reconnect()),
}
