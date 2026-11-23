import type { Bar, MarketId, SymbolInfo } from '../types'
import { decimalsOf } from '../lib/format'
import { getJson } from './http'
import { StreamSocket } from './ws'
import { oiPeriod, type ExchangeAdapter, type OiPoint } from './types'
import { bybitKind, type KindMap } from './tradfi'

const REST = ['https://api.bybit.com', 'https://api.bytick.com']
const CATEGORY: Record<MarketId, string> = { spot: 'spot', futures: 'linear' }
const WS: Record<MarketId, string> = {
  spot: 'wss://stream.bybit.com/v5/public/spot',
  futures: 'wss://stream.bybit.com/v5/public/linear',
}

const OI_PERIODS: [number, string][] = [
  [300, '5min'],
  [900, '15min'],
  [1800, '30min'],
  [3600, '1h'],
  [14400, '4h'],
  [86400, '1d'],
]

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

  async fetchTicker(market, symbol) {
    const r = ((await api(`/v5/market/tickers?category=${CATEGORY[market]}&symbol=${symbol}`)).list ?? [])[0]
    if (!r) throw new Error('Нет такого инструмента')
    return {
      ticker: { last: +r.lastPrice, changePct: +r.price24hPcnt * 100 || 0, high: +r.highPrice24h, low: +r.lowPrice24h, quoteVolume: +r.turnover24h || 0 },
      raw: [r.lastPrice, r.prevPrice24h, r.highPrice24h, r.lowPrice24h],
    }
  },

  async fetchOpenInterest(market, symbol, tfSec, count) {
    if (market !== 'futures') return []
    const [, period] = oiPeriod(OI_PERIODS, tfSec)
    const out: OiPoint[] = []
    let cursor = ''
    // биржа отдаёт от новых к старым по 200 точек; страницы — по курсору
    for (let page = 0; page < 5 && out.length < count; page++) {
      const limit = Math.min(200, Math.max(2, count - out.length))
      const res = await api(
        `/v5/market/open-interest?category=linear&symbol=${symbol}&intervalTime=${period}&limit=${limit}${cursor ? '&cursor=' + encodeURIComponent(cursor) : ''}`,
      )
      const rows: any[] = res.list ?? []
      for (const r of rows) out.push({ time: Math.floor(+r.timestamp / 1000), value: +r.openInterest })
      cursor = res.nextPageCursor ?? ''
      if (!cursor || rows.length < limit) break
    }
    return out.filter((p) => p.value > 0).sort((a, b) => a.time - b.time)
  },

  refreshTicker(market, symbol) {
    socket(market).resubscribe(`tickers.${symbol}`)
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
