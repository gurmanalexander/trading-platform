import type { Bar, MarketId, SymbolInfo } from '../types'
import { decimalsOf } from '../lib/format'
import { getJson } from './http'
import { StreamSocket } from './ws'
import type { ExchangeAdapter } from './types'
import { bybitKind, type KindMap } from './tradfi'

const REST = ['https://api.bybit.com', 'https://api.bytick.com']
const CATEGORY: Record<MarketId, string> = { spot: 'spot', futures: 'linear' }
const WS: Record<MarketId, string> = {
  spot: 'wss://stream.bybit.com/v5/public/spot',
  futures: 'wss://stream.bybit.com/v5/public/linear',
}

const sockets = new Map<MarketId, StreamSocket>()
function socket(market: MarketId): StreamSocket {
  let s = sockets.get(market)
  if (!s) {
    s = new StreamSocket({
      urls: [WS[market]],
      encodeSub: (args, id) => ({ op: 'subscribe', args, req_id: String(id) }),
      encodeUnsub: (args, id) => ({ op: 'unsubscribe', args, req_id: String(id) }),
      topicOf: (msg) => msg.topic,
      failedId: (msg) => (msg.success === false && msg.op === 'subscribe' ? Number(msg.req_id) : undefined),
      ping: (id) => ({ op: 'ping', req_id: String(id) }),
      pingMs: 20_000,
      maxTopicsPerMsg: 10, // лимит спота: не больше 10 тем в одном запросе
      sendGapMs: 120,
    })
    sockets.set(market, s)
  }
  return s
}

async function api(path: string): Promise<any> {
  const json = await getJson(REST, path)
  if (json.retCode !== 0) throw new Error(json.retMsg || 'Ошибка Bybit')
  return json.result
}

export const bybit: ExchangeAdapter = {
  async fetchKlines(market, symbol, tf, limit, endTime) {
    let path = `/v5/market/kline?category=${CATEGORY[market]}&symbol=${symbol}&interval=${tf.bybit}&limit=${Math.min(limit, 1000)}`
    if (endTime) path += `&end=${endTime - 1}`
    const rows: string[][] = (await api(path)).list ?? []
    const n = rows.length
    const bars: Bar[] = new Array(n)
    let precision = 0
    // биржа отдаёт от новых к старым — разворачиваем
    for (let i = 0; i < n; i++) {
      const r = rows[n - 1 - i]
      bars[i] = { time: +r[0] / 1000, open: +r[1], high: +r[2], low: +r[3], close: +r[4], volume: +r[5] }
      for (let k = 1; k <= 4; k++) {
        const d = decimalsOf(r[k])
        if (d > precision) precision = d
      }
    }
    return { bars, precision }
  },

  subscribeKline(market, symbol, tf, onBar, onReconnect) {
    const s = socket(market)
    const off = s.subscribe(`kline.${tf.bybit}.${symbol}`, (msg) => {
      const list = msg.data
      if (!Array.isArray(list)) return
      for (const k of list) {
        onBar({ time: k.start / 1000, open: +k.open, high: +k.high, low: +k.low, close: +k.close, volume: +k.volume })
      }
    })
    const offRe = s.onReconnect(onReconnect)
    return () => {
      off()
      offRe()
    }
  },

  subscribeTicker(market, symbol, onTicker) {
    // На фьючерсах после снимка приходят дельты только с изменившимися полями — копим состояние
    const state: Record<string, string> = {}
    return socket(market).subscribe(`tickers.${symbol}`, (msg) => {
      if (!msg.data) return
      Object.assign(state, msg.data)
      if (state.lastPrice === undefined) return
      onTicker(
        {
          last: +state.lastPrice,
          changePct: +state.price24hPcnt * 100 || 0,
          high: +state.highPrice24h,
          low: +state.lowPrice24h,
          quoteVolume: +state.turnover24h,
        },
        [state.lastPrice, state.prevPrice24h, state.highPrice24h, state.lowPrice24h],
      )
    })
  },

  async fetchSymbols(market) {
    const rows: any[] = (await api(`/v5/market/tickers?category=${CATEGORY[market]}`)).list ?? []
    const out: SymbolInfo[] = []
    for (const r of rows) {
      out.push({
        exchange: 'bybit',
        market,
        symbol: r.symbol,
        last: +r.lastPrice,
        changePct: +r.price24hPcnt * 100 || 0,
        quoteVolume: +r.turnover24h || 0,
      })
    }
    return out
  },

  async fetchKinds(market) {
    const out: KindMap = new Map()
    const add = (list: any[]) => {
      for (const r of list) {
        const kind = bybitKind(r)
        if (kind) out.set(r.symbol, kind)
      }
    }
    if (market === 'spot') {
      // спот отдаётся одним ответом; акции — xstocks и mstocks
      for (const type of ['xstocks', 'mstocks']) add((await api(`/v5/market/instruments-info?category=spot&symbolType=${type}`)).list ?? [])
      return out
    }
    // фьючерсы — страницами по 1000
    let cursor = ''
    for (let page = 0; page < 10; page++) {
      const res = await api(`/v5/market/instruments-info?category=linear&limit=1000${cursor ? '&cursor=' + encodeURIComponent(cursor) : ''}`)
      add(res.list ?? [])
      cursor = res.nextPageCursor ?? ''
      if (!cursor) break
    }
    return out
  },

  status: (market) => socket(market).status,
  reconnect: () => sockets.forEach((s) => s.reconnect()),
}
