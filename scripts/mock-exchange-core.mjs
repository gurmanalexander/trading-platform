// Учебная «биржа»: отвечает на те же запросы, что Binance USDⓈ-M Futures и Bybit V5, и так же
// проверяет подписи, окна времени и постраничную выдачу. Данные — из генератора демо-сделок.
// Нужна, чтобы проверять мост и журнал целиком без настоящих ключей: в тестах (как подмена fetch)
// и вживую (scripts/mock-exchange.mjs поднимает её как локальный сервер).
//
// Это модель по документации бирж, а не сами биржи: совпадение с ней не гарантирует, что настоящая
// биржа ответит так же.
import { createHmac } from 'node:crypto'
import { demoData } from '../journal/src/core/demo.ts'

export const MOCK_SECRET = 'mock-secret'
/** Ключи учебной биржи. *-trade — с правом торговли: мост должен их отклонить */
export const MOCK_KEYS = {
  'mock-binance-read': { exchange: 'binance', data: 'demo-binance', readOnly: true },
  'mock-binance-trade': { exchange: 'binance', data: 'demo-binance', readOnly: false },
  'mock-bybit-read': { exchange: 'bybit', data: 'demo-bybit', readOnly: true },
  'mock-bybit-trade': { exchange: 'bybit', data: 'demo-bybit', readOnly: false },
}

const WEEK = 7 * 86_400_000
const hmac = (text) => createHmac('sha256', MOCK_SECRET).update(text).digest('hex')

/**
 * @param {{ now?: () => number, skew?: number }} [opts] skew — на сколько часы биржи впереди часов клиента, мс
 */
export function createMock(opts = {}) {
  const now = opts.now ?? (() => Date.now())
  const serverNow = () => now() + (opts.skew ?? 0)
  const started = now()
  const cache = new Map()
  /** счётчик запросов по путям — для тестов */
  const calls = {}

  /** исходные демо-данные и сделки, добавленные по ходу проверки */
  const raws = new Map()
  const extra = new Map()
  const rawOf = (name) => {
    if (!raws.has(name)) raws.set(name, demoData(name, started))
    return raws.get(name)
  }

  /** Новая закрытая сделка «только что» — чтобы проверить, что мост сам подхватывает свежее */
  function addTrade(name, { sym = 'BTCUSDT', side = 1, entry = 100_000, exit = 100_500, qty = 0.01 } = {}) {
    const list = extra.get(name) ?? []
    extra.set(name, list)
    const next = 1_000_000 + list.length
    const t = now()
    list.push({ id: String(next), t: t - 60_000, sym, side, px: entry, qty, fee: entry * qty * 0.0005 })
    list.push({ id: String(next + 1), t: t - 20_000, sym, side: -side, px: exit, qty, fee: exit * qty * 0.0005 })
    cache.delete(name)
  }

  function dataset(name) {
    let d = cache.get(name)
    if (d) return d
    const raw = rawOf(name)
    const fills = [...raw.fills, ...(extra.get(name) ?? [])].sort((a, b) => a.t - b.t || Number(a.id) - Number(b.id))
    // позиция по каждому инструменту — чтобы знать закрытый объём и результат каждого исполнения
    const pos = new Map()
    const rows = fills.map((f) => {
      const p = pos.get(f.sym) ?? { size: 0, avg: 0 }
      const signed = f.side * f.qty
      let closed = 0
      let pnl = 0
      if (p.size !== 0 && Math.sign(p.size) !== f.side) {
        closed = Math.min(f.qty, Math.abs(p.size))
        pnl = (f.px - p.avg) * closed * Math.sign(p.size)
      }
      const next = +(p.size + signed).toFixed(8)
      if (closed < f.qty) p.avg = closed > 0 ? f.px : (p.avg * Math.abs(p.size) + f.px * f.qty) / (Math.abs(p.size) + f.qty)
      p.size = next
      pos.set(f.sym, p)
      return { ...f, closed, pnl }
    })
    d = { rows, funding: raw.funding.slice().sort((a, b) => a.t - b.t), snapshot: raw.snapshot }
    cache.set(name, d)
    return d
  }

  const json = (status, body, headers = {}) => ({ status, body, headers })

  // ---------- Binance ----------

  function binance(path, url, headers) {
    const q = url.searchParams
    if (path === '/fapi/v1/time') return json(200, { serverTime: serverNow() })
    if (path === '/fapi/v1/klines') {
      const start = Number(q.get('startTime'))
      const out = []
      for (let t = Math.floor(start / 86_400_000) * 86_400_000; t <= Number(q.get('endTime')) && out.length < 30; t += 86_400_000)
        out.push([t, '600', '610', '590', '600', '1000'])
      return json(200, out)
    }
    const key = MOCK_KEYS[headers['x-mbx-apikey']]
    if (!key || key.exchange !== 'binance') return json(401, { code: -2015, msg: 'Invalid API-key, IP, or permissions for action.' })
    const raw = url.search.slice(1)
    const cut = raw.lastIndexOf('&signature=')
    if (cut < 0 || hmac(raw.slice(0, cut)) !== raw.slice(cut + 11)) return json(400, { code: -1022, msg: 'Signature for this request is not valid.' })
    const ts = Number(q.get('timestamp'))
    const recv = Number(q.get('recvWindow') ?? 5000)
    if (!(ts > serverNow() - recv && ts < serverNow() + 1000)) return json(400, { code: -1021, msg: "Timestamp for this request is outside of the recvWindow." })
    const d = dataset(key.data)
    const weight = { 'x-mbx-used-weight-1m': '40' }

    if (path === '/sapi/v1/account/apiRestrictions')
      return json(200, {
        ipRestrict: false,
        createTime: started,
        enableReading: true,
        enableWithdrawals: false,
        enableInternalTransfer: false,
        enableMargin: false,
        enableFutures: !key.readOnly,
        permitsUniversalTransfer: false,
        enableVanillaOptions: false,
        enableFixApiTrade: false,
        enableFixReadOnly: false,
        enableSpotAndMarginTrading: !key.readOnly,
        enablePortfolioMarginTrading: false,
      })
    if (path === '/fapi/v3/account') {
      const s = d.snapshot
      return json(200, { totalWalletBalance: s.wallet.toFixed(8), totalUnrealizedProfit: s.upnl.toFixed(8), totalMarginBalance: s.equity.toFixed(8), availableBalance: s.wallet.toFixed(8), assets: [], positions: [] }, weight)
    }
    if (path === '/fapi/v3/positionRisk')
      return json(
        200,
        d.snapshot.positions.map((p) => ({
          symbol: p.sym,
          positionSide: 'BOTH',
          positionAmt: String(p.side * p.qty),
          entryPrice: String(p.entry),
          breakEvenPrice: String(p.entry),
          markPrice: String(p.mark),
          unRealizedProfit: String(p.upnl),
          liquidationPrice: '0',
          notional: String(p.mark * p.qty),
          marginAsset: 'USDT',
          updateTime: started,
        })),
        weight,
      )

    const from = Number(q.get('startTime') ?? serverNow() - WEEK)
    const to = Number(q.get('endTime') ?? serverNow())
    const limit = Math.min(1000, Number(q.get('limit') ?? 500))
    // история доступна только за три месяца
    const floor = serverNow() - 90 * 86_400_000

    if (path === '/fapi/v1/income') {
      const rows = []
      for (const f of d.rows) {
        rows.push({ symbol: f.sym, incomeType: 'COMMISSION', income: (-f.fee).toFixed(8), asset: 'USDT', info: 'COMMISSION', time: f.t, tranId: Number(f.id) * 10 + 1, tradeId: f.id })
        if (f.closed > 0) rows.push({ symbol: f.sym, incomeType: 'REALIZED_PNL', income: f.pnl.toFixed(8), asset: 'USDT', info: 'REALIZED_PNL', time: f.t, tranId: Number(f.id) * 10 + 2, tradeId: f.id })
      }
      d.funding.forEach((x, i) => rows.push({ symbol: x.sym, incomeType: 'FUNDING_FEE', income: x.amt.toFixed(8), asset: 'USDT', info: 'FUNDING_FEE', time: x.t, tranId: 9_000_000 + i, tradeId: '' }))
      rows.sort((a, b) => a.time - b.time || a.tranId - b.tranId)
      return json(200, rows.filter((r) => r.time >= Math.max(from, floor) && r.time <= to).slice(0, limit), weight)
    }
    if (path === '/fapi/v1/userTrades') {
      const symbol = q.get('symbol')
      if (!symbol) return json(400, { code: -1102, msg: "Mandatory parameter 'symbol' was not sent, was empty/null, or malformed." })
      if (to - from > WEEK) return json(400, { code: -4165, msg: 'Invalid time interval: more than 7 days.' })
      const rows = d.rows
        .filter((f) => f.sym === symbol && f.t >= Math.max(from, floor) && f.t <= to)
        .slice(0, limit)
        .map((f) => ({
          buyer: f.side > 0,
          commission: f.fee.toFixed(8),
          commissionAsset: 'USDT',
          id: Number(f.id),
          maker: !!f.maker,
          orderId: Number(f.id) + 500_000,
          price: String(f.px),
          qty: String(f.qty),
          quoteQty: String(f.px * f.qty),
          realizedPnl: f.pnl.toFixed(8),
          side: f.side > 0 ? 'BUY' : 'SELL',
          positionSide: 'BOTH',
          symbol: f.sym,
          time: f.t,
        }))
      return json(200, rows, weight)
    }
    return json(404, { code: -1, msg: 'not found' })
  }

  // ---------- Bybit ----------

  const ok = (result) => json(200, { retCode: 0, retMsg: 'OK', result, retExtInfo: {}, time: serverNow() })
  const bad = (retCode, retMsg, status = 200) => json(status, { retCode, retMsg, result: {}, retExtInfo: {}, time: serverNow() })

  function bybit(path, url, headers) {
    const q = url.searchParams
    if (path === '/v5/market/time') return ok({ timeSecond: String(Math.floor(serverNow() / 1000)), timeNano: String(serverNow() * 1e6) })
    const apiKey = headers['x-bapi-api-key']
    const key = MOCK_KEYS[apiKey]
    if (!key || key.exchange !== 'bybit') return bad(10003, 'API key is invalid.', 401)
    const ts = headers['x-bapi-timestamp']
    const recv = headers['x-bapi-recv-window'] ?? '5000'
    if (hmac(ts + apiKey + recv + url.search.slice(1)) !== headers['x-bapi-sign']) return bad(10004, 'Error sign, please check your signature generation algorithm.')
    if (!(Number(ts) >= serverNow() - Number(recv) && Number(ts) < serverNow() + 1000)) return bad(10002, 'invalid request, please check your server timestamp or recv_window param.')
    const d = dataset(key.data)

    if (path === '/v5/user/query-api')
      return ok({
        id: '1',
        note: 'mock',
        apiKey,
        readOnly: key.readOnly ? 1 : 0,
        secret: '',
        permissions: key.readOnly
          ? { ContractTrade: [], Spot: [], Wallet: [], Options: [], Derivatives: [], Exchange: [], Earn: [] }
          : { ContractTrade: ['Order', 'Position'], Spot: ['SpotTrade'], Wallet: ['AccountTransfer'], Options: [], Derivatives: ['DerivativesTrade'], Exchange: [], Earn: [] },
        ips: ['*'],
        type: 1,
        deadlineDay: 60,
        expiredAt: new Date(started + 60 * 86_400_000).toISOString().replace(/\.\d+Z$/, 'Z'),
        createdAt: new Date(started).toISOString().replace(/\.\d+Z$/, 'Z'),
        uta: 1,
        isMaster: true,
      })
    if (path === '/v5/account/wallet-balance') {
      if (q.get('accountType') !== 'UNIFIED') return bad(10001, 'accountType only support UNIFIED.')
      const s = d.snapshot
      return ok({ list: [{ accountType: 'UNIFIED', totalEquity: s.equity.toFixed(4), totalWalletBalance: s.wallet.toFixed(4), totalMarginBalance: s.equity.toFixed(4), totalAvailableBalance: s.wallet.toFixed(4), totalPerpUPL: s.upnl.toFixed(4), coin: [] }] })
    }
    if (path === '/v5/position/list') {
      if (q.get('category') !== 'linear' || !(q.get('settleCoin') || q.get('symbol'))) return bad(10001, 'Missing some parameters that must be filled in, symbol or settleCoin')
      const list =
        q.get('settleCoin') === 'USDT'
          ? d.snapshot.positions.map((p) => ({
              positionIdx: 0,
              symbol: p.sym,
              side: p.side > 0 ? 'Buy' : 'Sell',
              size: String(p.qty),
              avgPrice: String(p.entry),
              positionValue: String(p.entry * p.qty),
              leverage: String(p.leverage ?? ''),
              markPrice: String(p.mark),
              unrealisedPnl: String(p.upnl),
              curRealisedPnl: '0',
              createdTime: String(started),
              updatedTime: String(started),
            }))
          : []
      return ok({ category: 'linear', list, nextPageCursor: '' })
    }
    if (path === '/v5/execution/list') {
      if (q.get('category') !== 'linear') return bad(10001, 'category is invalid')
      const from = Number(q.get('startTime') ?? serverNow() - WEEK)
      const to = Number(q.get('endTime') ?? from + WEEK)
      if (to - from > WEEK) return bad(10001, 'The time range between startTime and endTime cannot exceed 7 days.')
      const limit = Math.min(100, Number(q.get('limit') ?? 50))
      const floor = serverNow() - 730 * 86_400_000
      const rows = []
      for (const f of d.rows)
        rows.push({ t: f.t, row: { symbol: f.sym, orderId: `o-${f.id}`, orderLinkId: '', side: f.side > 0 ? 'Buy' : 'Sell', orderPrice: String(f.px), orderQty: String(f.qty), leavesQty: '0', orderType: 'Market', stopOrderType: 'UNKNOWN', execFee: f.fee.toFixed(8), execId: `e-${f.id}`, execPrice: String(f.px), execQty: String(f.qty), execType: 'Trade', execValue: String(f.px * f.qty), execTime: String(f.t), feeCurrency: '', isMaker: !!f.maker, feeRate: '0.0005', markPrice: String(f.px), closedSize: String(f.closed), seq: Number(f.id) } })
      d.funding.forEach((x, i) =>
        rows.push({ t: x.t, row: { symbol: x.sym, orderId: `fo-${i}`, orderLinkId: '', side: 'Buy', orderPrice: '0', orderQty: '0', leavesQty: '0', orderType: 'UNKNOWN', stopOrderType: 'UNKNOWN', execFee: (-x.amt).toFixed(8), execId: `fund-${i}`, execPrice: '0', execQty: '1', execType: 'Funding', execValue: '0', execTime: String(x.t), feeCurrency: '', isMaker: false, feeRate: '0.0001', markPrice: '0', closedSize: '', seq: 0 } }),
      )
      // новые — первыми
      const window = rows.filter((r) => r.t >= Math.max(from, floor) && r.t <= to).sort((a, b) => b.t - a.t)
      let offset = 0
      const cursor = q.get('cursor')
      if (cursor != null) {
        // метка страницы: «смещение:начало окна»; после разбора адреса должна прийти в исходном виде
        const m = /^(\d+):(\d+)$/.exec(cursor)
        if (!m || Number(m[2]) !== from) return bad(10001, 'cursor is invalid')
        offset = Number(m[1])
      }
      const page = window.slice(offset, offset + limit)
      const more = offset + limit < window.length
      return ok({ category: 'linear', list: page.map((r) => r.row), nextPageCursor: more ? encodeURIComponent(`${offset + limit}:${from}`) : '' })
    }
    return bad(10001, 'not found', 404)
  }

  /** Ответ на запрос: адрес вида <что угодно>/binance-f|binance-s|bybit/<путь биржи> */
  function handle(rawUrl, rawHeaders = {}) {
    const url = new URL(rawUrl, 'http://mock')
    const headers = Object.fromEntries(Object.entries(rawHeaders).map(([k, v]) => [k.toLowerCase(), String(v)]))
    // управление проверкой: /control/trade?account=demo-bybit добавляет сделку «только что»
    if (url.pathname === '/control/trade') {
      addTrade(url.searchParams.get('account') ?? 'demo-bybit')
      return json(200, { ok: true })
    }
    const m = /^\/(binance-f|binance-s|bybit)(\/.*)$/.exec(url.pathname)
    if (!m) return json(404, { error: 'unknown exchange' })
    calls[m[2]] = (calls[m[2]] ?? 0) + 1
    return m[1] === 'bybit' ? bybit(m[2], url, headers) : binance(m[2], url, headers)
  }

  /** Подмена fetch для тестов */
  const fetch = async (input, init = {}) => {
    const r = handle(String(input), init.headers ?? {})
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'content-type': 'application/json', ...r.headers } })
  }

  return { handle, fetch, calls, dataset, addTrade, started }
}
