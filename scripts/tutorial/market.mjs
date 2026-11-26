// Живые котировки для записи обучения.
//
// Видео пишется в среде, где фьючерсный адрес Binance и потоки WebSocket могут быть недоступны.
// Поэтому запросы фьючерсов перенаправляются на официальный адрес рыночных данных
// data-api.binance.vision (спот — цены почти те же), а поток котировок заменён опросом REST:
// подписки на свечи и тикеры приложение получает в том же формате, что и от биржи.

const SPOT = 'https://data-api.binance.vision'

/** Запрос из Node (через прокси окружения, если он задан) — ответ для страницы */
async function relay(route, url, map) {
  const res = await fetch(url)
  let body = await res.text()
  if (map && res.ok) body = JSON.stringify(map(JSON.parse(body)))
  return route.fulfill({ status: res.status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body })
}

/** Подменяет фьючерсный REST Binance на спотовый */
export async function routeMarket(ctx) {
  await ctx.route(/^https:\/\/data-api\.binance\.vision\//, (route) => relay(route, route.request().url()).catch(() => route.abort()))
  await ctx.route(/^https:\/\/fapi\.binance\.com\//, async (route) => {
    const u = new URL(route.request().url())
    const p = u.pathname
    try {
      if (p === '/fapi/v1/klines') {
        const q = new URLSearchParams(u.search)
        q.set('limit', String(Math.min(1000, +(q.get('limit') ?? 500))))
        return relay(route, `${SPOT}/api/v3/klines?${q}`)
      }
      if (p === '/fapi/v1/ticker/24hr') {
        const sym = u.searchParams.get('symbol')
        if (sym) return relay(route, `${SPOT}/api/v3/ticker/24hr?symbol=${sym}`)
        // все тикеры — только пары к USDT, как у фьючерсов
        return relay(route, `${SPOT}/api/v3/ticker/24hr`, (rows) =>
          rows.filter((r) => r.symbol.endsWith('USDT') && !/^(USDC|FDUSD|TUSD|BUSD|USDP|EUR|AEUR|DAI|XUSD|USD1|BFUSD|RLUSD|U)USDT$/.test(r.symbol)),
        )
      }
      if (p === '/fapi/v1/exchangeInfo') return route.fulfill({ json: { symbols: [] } })
      if (p === '/fapi/v1/openInterest' || p.startsWith('/futures/data/')) return route.fulfill({ json: [] })
      return route.fulfill({ json: [] })
    } catch {
      return route.abort()
    }
  })
  // Bybit в записи не участвует
  await ctx.route(/^https:\/\/api\.bybit\.com\//, (route) => route.fulfill({ json: { retCode: 0, retMsg: 'OK', result: { list: [] } } }))
}

/**
 * Скрипт страницы: WebSocket к Binance заменяется опросом REST (через тот же перенаправленный адрес).
 * Свечи подписанных инструментов — каждые 2 с, тикеры — одним запросом каждые 3 с.
 */
export const fakeStreams = () => {
  const Real = window.WebSocket
  class Poll extends EventTarget {
    static CONNECTING = 0
    static OPEN = 1
    static CLOSING = 2
    static CLOSED = 3
    constructor(url) {
      super()
      this.url = url
      this.readyState = 0
      this.subs = new Set()
      this.onopen = this.onmessage = this.onclose = this.onerror = null
      setTimeout(() => {
        this.readyState = 1
        this.onopen?.({ type: 'open' })
      }, 60)
      this.timers = [setInterval(() => this.klines(), 2000), setInterval(() => this.tickers(), 3000)]
    }
    emit(obj) {
      if (this.readyState === 1) this.onmessage?.({ data: JSON.stringify(obj) })
    }
    send(raw) {
      const m = JSON.parse(raw)
      if (m.method === 'SUBSCRIBE') m.params.forEach((p) => this.subs.add(p))
      if (m.method === 'UNSUBSCRIBE') m.params.forEach((p) => this.subs.delete(p))
      this.emit(m.method === 'LIST_SUBSCRIPTIONS' ? { result: [...this.subs], id: m.id } : { result: null, id: m.id })
      if (m.method === 'SUBSCRIBE') setTimeout(() => this.tickers(), 300)
    }
    close() {
      this.timers.forEach(clearInterval)
      this.readyState = 3
      this.onclose?.({ code: 1000, reason: '' })
    }
    async klines() {
      for (const s of this.subs) {
        const m = /^(.+)@kline_(.+)$/.exec(s)
        if (!m) continue
        try {
          const rows = await (await fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${m[1].toUpperCase()}&interval=${m[2]}&limit=1`)).json()
          const r = rows[rows.length - 1]
          if (r) this.emit({ stream: s, data: { e: 'kline', s: m[1].toUpperCase(), k: { t: r[0], o: r[1], h: r[2], l: r[3], c: r[4], v: r[5], x: false } } })
        } catch {}
      }
    }
    async tickers() {
      const syms = [...this.subs].map((s) => /^(.+)@miniTicker$/.exec(s)?.[1].toUpperCase()).filter(Boolean)
      if (!syms.length) return
      for (let i = 0; i < syms.length; i += 80) {
        try {
          const part = syms.slice(i, i + 80)
          const url = part.length === 1 ? `symbol=${part[0]}` : `symbols=${encodeURIComponent(JSON.stringify(part))}`
          let rows = await (await fetch(`https://data-api.binance.vision/api/v3/ticker/24hr?${url}`)).json()
          if (!Array.isArray(rows)) rows = [rows]
          for (const r of rows) {
            if (!r?.symbol) continue
            this.emit({ stream: `${r.symbol.toLowerCase()}@miniTicker`, data: { e: '24hrMiniTicker', s: r.symbol, c: r.lastPrice, o: r.openPrice, h: r.highPrice, l: r.lowPrice, v: r.volume, q: r.quoteVolume } })
          }
        } catch {}
      }
    }
  }
  /**
   * Ретрансляторы синхронизации (Nostr) в записи недоступны: тихий ретранслятор принимает события
   * и отвечает на подписки, чтобы окно синхронизации показывало связь. Данные никуда не уходят.
   */
  class Relay extends Poll {
    constructor(url) {
      super(url)
      this.timers.forEach(clearInterval)
      this.timers = []
    }
    send(raw) {
      const m = JSON.parse(raw)
      if (m[0] === 'REQ') setTimeout(() => this.emit(['EOSE', m[1]]), 80)
      if (m[0] === 'EVENT') setTimeout(() => this.emit(['OK', m[1]?.id, true, '']), 80)
    }
  }
  window.WebSocket = function (url, protocols) {
    const u = String(url)
    if (/binance|bybit/.test(u)) return new Poll(u)
    if (/damus|nos\.lol|primal|nostr/.test(u)) return new Relay(u)
    return new Real(url, protocols)
  }
  Object.assign(window.WebSocket, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3, prototype: Real.prototype })
}
