import type { PullCursor } from '../../../journal/src/core/protocol'
import type { Fill, Funding, OpenPosition, Snapshot } from '../../../journal/src/core/types'
import { BridgeError, WEEK, httpGet, num, query, readJson, type Ctx } from './http'
import { KeyRejected, type ExchangeClient } from './types'

/**
 * Bybit V5, только чтение: бессрочные контракты с расчётами в USDT и USDC (category=linear).
 *
 * История исполнений отдаётся окнами не длиннее 7 дней, по 100 записей на страницу, глубиной
 * до двух лет. Фандинг приходит в том же списке (execType=Funding).
 */
export const BYBIT_HOSTS = ['https://api.bybit.com', 'https://api.bytick.com']

export const BYBIT_DEPTH = 729 * 86_400_000
const RECV_WINDOW = 10_000
const PAGE_MAX = 100
const PAGES_PER_CALL = 10
const GAP_MS = 80

/** Виды исполнений, которые меняют позицию */
const TRADE_TYPES = new Set(['Trade', 'AdlTrade', 'BustTrade', 'Delivery', 'BlockTrade', 'MovePosition'])

interface Cursor {
  v: 1
  since: number
  until: number
  /** начало текущего окна */
  from: number
  /** страница внутри окна */
  page: string
}

/** page — размер страницы запросов; меняется только в тестах, чтобы проверить постраничную загрузку */
export function bybit(hosts: string[] = BYBIT_HOSTS, opts: { page?: number } = {}): ExchangeClient {
  const PAGE = opts.page ?? PAGE_MAX
  let offset = 0
  let synced = false
  /** какой из адресов ответил в прошлый раз */
  let preferred = 0

  async function get(ctx: Ctx, pathAndQuery: string, headers: Record<string, string>): Promise<Response> {
    let lastErr: unknown
    for (let i = 0; i < hosts.length; i++) {
      const idx = (preferred + i) % hosts.length
      try {
        const res = await httpGet(ctx, hosts[idx] + pathAndQuery, headers)
        preferred = idx
        return res
      } catch (e) {
        lastErr = e
      }
    }
    throw lastErr
  }

  async function syncTime(ctx: Ctx) {
    const res = await get(ctx, '/v5/market/time', {})
    const body = await readJson(res)
    if (!res.ok) fail(res, body)
    if (body && typeof body.time === 'number') offset = body.time - ctx.now()
    synced = true
  }

  function fail(res: Response, body: any): never {
    const msg = typeof body?.retMsg === 'string' && body.retMsg ? body.retMsg : `HTTP ${res.status}`
    const code = body?.retCode
    if (res.status === 401 || code === 10003 || code === 10004 || code === 10005 || code === 10010 || code === 33004) throw new BridgeError('auth', msg)
    if (res.status === 429 || code === 10006 || code === 10018) throw new BridgeError('rate', msg)
    if (res.status === 403 || res.status === 451) throw new BridgeError('geo', msg)
    throw new BridgeError('exchange', msg)
  }

  async function signedGet(ctx: Ctx, path: string, params: Record<string, string | number | undefined> = {}, rawCursor = ''): Promise<any> {
    if (!synced) await syncTime(ctx)
    for (let attempt = 0; ; attempt++) {
      let qs = query(params)
      // метка страницы приходит от биржи уже закодированной для адреса — приводим к одному виду
      if (rawCursor) qs += (qs ? '&' : '') + 'cursor=' + recode(rawCursor)
      const ts = String(ctx.now() + offset)
      const sign = await ctx.sign(ts + ctx.apiKey + RECV_WINDOW + qs)
      const res = await get(ctx, path + (qs ? '?' + qs : ''), {
        'X-BAPI-API-KEY': ctx.apiKey,
        'X-BAPI-TIMESTAMP': ts,
        'X-BAPI-RECV-WINDOW': String(RECV_WINDOW),
        'X-BAPI-SIGN': sign,
      })
      const body = await readJson(res)
      if (body?.retCode === 10002 && attempt === 0) {
        await syncTime(ctx)
        continue
      }
      if (!res.ok || !body || body.retCode !== 0) fail(res, body)
      return body.result ?? {}
    }
  }

  return {
    async verify(ctx) {
      const r = await signedGet(ctx, '/v5/user/query-api')
      if (r.readOnly !== 1) {
        const perms = r.permissions && typeof r.permissions === 'object' ? Object.values(r.permissions).flat().filter((x): x is string => typeof x === 'string') : []
        throw new KeyRejected(perms.length ? perms : ['ReadWrite'])
      }
      const exp = typeof r.expiredAt === 'string' ? Date.parse(r.expiredAt) : NaN
      // ключи с привязкой к IP бессрочные: биржа отдаёт для них дату из прошлого или пустую
      return isFinite(exp) && exp > ctx.now() ? { expiresAt: exp } : {}
    },

    async pull(ctx, since, cursor) {
      const now = ctx.now()
      const start = Math.max(since, now - BYBIT_DEPTH)
      const c = parseCursor(cursor) ?? { v: 1 as const, since: start, until: now, from: start, page: '' }
      const fills: Fill[] = []
      const funding: Funding[] = []
      const end = Math.min(c.from + WEEK - 1, c.until)
      let page = c.page
      let more = false
      for (let n = 0; n < PAGES_PER_CALL; n++) {
        const r = await signedGet(ctx, '/v5/execution/list', { category: 'linear', startTime: c.from, endTime: end, limit: PAGE }, page)
        for (const x of Array.isArray(r.list) ? r.list : []) {
          const sym = String(x.symbol ?? '')
          const t = num(x.execTime)
          if (!sym || !x.execId) continue
          if (x.execType === 'Funding') {
            // у фандинга execFee положителен, когда платим мы
            funding.push({ id: String(x.execId), t, sym, amt: -num(x.execFee) })
          } else if (TRADE_TYPES.has(x.execType)) {
            const fill: Fill = { id: String(x.execId), t, sym, side: x.side === 'Buy' ? 1 : -1, px: num(x.execPrice), qty: num(x.execQty), fee: num(x.execFee), maker: !!x.isMaker }
            if (typeof x.closedSize === 'string' && x.closedSize !== '') fill.closed = num(x.closedSize)
            fills.push(fill)
          }
        }
        page = typeof r.nextPageCursor === 'string' ? r.nextPageCursor : ''
        more = !!page && Array.isArray(r.list) && r.list.length > 0
        if (!more) break
        await ctx.sleep(GAP_MS)
      }
      let next: Cursor | null
      if (more) next = { ...c, page }
      else if (c.from + WEEK <= c.until) next = { ...c, from: c.from + WEEK, page: '' }
      else next = null
      const span = Math.max(1, c.until - c.since)
      return { fills, funding, next: next as PullCursor | null, progress: next ? Math.min(0.99, (next.from - c.since) / span) : 1 }
    },

    async snapshot(ctx): Promise<Snapshot> {
      let wallet = 0
      let equity = 0
      let upnl = 0
      try {
        const r = await signedGet(ctx, '/v5/account/wallet-balance', { accountType: 'UNIFIED' })
        const a = Array.isArray(r.list) ? r.list[0] : null
        wallet = num(a?.totalWalletBalance)
        equity = num(a?.totalEquity)
        upnl = num(a?.totalPerpUPL)
      } catch (e) {
        // у счёта старого типа единого баланса нет — показываем позиции без него
        if (!(e instanceof BridgeError) || e.code !== 'exchange') throw e
      }
      const positions: OpenPosition[] = []
      for (const settleCoin of ['USDT', 'USDC']) {
        const r = await signedGet(ctx, '/v5/position/list', { category: 'linear', settleCoin, limit: 200 })
        for (const p of Array.isArray(r.list) ? r.list : []) {
          const qty = num(p.size)
          if (!qty || (p.side !== 'Buy' && p.side !== 'Sell')) continue
          const pos: OpenPosition = { sym: String(p.symbol), side: p.side === 'Buy' ? 1 : -1, qty, entry: num(p.avgPrice), mark: num(p.markPrice), upnl: num(p.unrealisedPnl) }
          if (num(p.leverage)) pos.leverage = num(p.leverage)
          positions.push(pos)
        }
      }
      if (!equity && !wallet) upnl = positions.reduce((s, p) => s + p.upnl, 0)
      return { at: ctx.now(), wallet, equity, upnl, positions }
    },
  }
}

/** Метка страницы в виде, годном для адреса, — вне зависимости от того, закодирована ли она уже */
function recode(cursor: string): string {
  try {
    return encodeURIComponent(decodeURIComponent(cursor))
  } catch {
    return encodeURIComponent(cursor)
  }
}

function parseCursor(raw: PullCursor | null): Cursor | null {
  if (!raw) return null
  const c = raw as Partial<Cursor>
  const okNum = (v: unknown): v is number => typeof v === 'number' && isFinite(v) && v >= 0
  if (c.v !== 1 || !okNum(c.since) || !okNum(c.until) || !okNum(c.from) || typeof c.page !== 'string' || c.page.length > 2000) throw new BridgeError('bad-request')
  return c as Cursor
}
