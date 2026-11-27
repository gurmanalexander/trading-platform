import type { PullChunk, PullCursor } from '../../../journal/src/core/protocol'
import type { Fill, Funding, OpenPosition, Snapshot } from '../../../journal/src/core/types'
import { BridgeError, WEEK, httpGet, num, query, readJson, type Ctx } from './http'
import { KeyRejected, type ExchangeClient } from './types'

/**
 * Binance USDⓈ-M Futures, только чтение.
 *
 * История сделок отдаётся лишь по одному инструменту за запрос, окнами не длиннее 7 дней и не
 * глубже 3 месяцев. Поэтому загрузка идёт в два шага: сначала история доходов (она без
 * инструмента) — из неё берём фандинг и узнаём, какими инструментами и когда торговали; затем
 * сделки только по этим инструментам и только за недели, где была активность.
 */
export interface BinanceHosts {
  futures: string
  spot: string
}
export const BINANCE_HOSTS: BinanceHosts = { futures: 'https://fapi.binance.com', spot: 'https://api.binance.com' }

/** Глубина истории, которую отдаёт биржа: 3 месяца; берём с запасом */
export const BINANCE_DEPTH = 88 * 86_400_000
const RECV_WINDOW = 10_000
const PAGE_MAX = 1000
/** сколько запросов делаем за одно обращение сайта */
const INCOME_PAGES = 4
const TASKS_PER_CALL = 8
/** пауза между запросами сделок: вес запроса 5, лимит 2400 в минуту */
const GAP_MS = 250

/** Права ключа, с которыми мост его не принимает */
const RISKY = [
  'enableWithdrawals',
  'enableInternalTransfer',
  'permitsUniversalTransfer',
  'enableSpotAndMarginTrading',
  'enableMargin',
  'enableFutures',
  'enableVanillaOptions',
  'enablePortfolioMarginTrading',
  'enableFixApiTrade',
]

/** Валюты, которые считаем долларом как есть */
const USD = new Set(['USDT', 'USDC', 'BUSD', 'FDUSD', 'BFUSD', 'USD'])

interface Cursor {
  v: 1
  since: number
  until: number
  phase: 'income' | 'trades'
  incomeFrom: number
  /** [инструмент, номер недели от since] — что осталось загрузить */
  tasks: [string, number][]
  total: number
}

/** page — размер страницы запросов; меняется только в тестах, чтобы проверить постраничную загрузку */
export function binance(hosts: BinanceHosts = BINANCE_HOSTS, opts: { page?: number } = {}): ExchangeClient {
  const PAGE = opts.page ?? PAGE_MAX
  /** разница между часами биржи и устройства, мс */
  let offset = 0
  let synced = false

  async function syncTime(ctx: Ctx) {
    const res = await httpGet(ctx, hosts.futures + '/fapi/v1/time', {})
    const body = await readJson(res)
    check(res, body)
    if (body && typeof body.serverTime === 'number') offset = body.serverTime - ctx.now()
    synced = true
  }

  function check(res: Response, body: any) {
    if (res.ok) return
    const code = body?.code
    const msg = typeof body?.msg === 'string' ? body.msg : `HTTP ${res.status}`
    if (res.status === 451 || res.status === 403) throw new BridgeError('geo', msg)
    if (res.status === 429 || res.status === 418) throw new BridgeError('rate', msg)
    if (res.status === 401 || code === -2014 || code === -2015 || code === -2008 || code === -1022) throw new BridgeError('auth', msg)
    throw new BridgeError('exchange', msg)
  }

  async function signedGet(ctx: Ctx, base: keyof BinanceHosts, path: string, params: Record<string, string | number | undefined> = {}): Promise<any> {
    if (!synced) await syncTime(ctx)
    for (let attempt = 0; ; attempt++) {
      const qs = query({ ...params, recvWindow: RECV_WINDOW, timestamp: ctx.now() + offset })
      const url = `${hosts[base]}${path}?${qs}&signature=${await ctx.sign(qs)}`
      const res = await httpGet(ctx, url, { 'X-MBX-APIKEY': ctx.apiKey })
      const body = await readJson(res)
      // часы разошлись с биржей — сверяем и повторяем один раз
      if (!res.ok && body?.code === -1021 && attempt === 0) {
        await syncTime(ctx)
        continue
      }
      check(res, body)
      // близко к лимиту запросов — притормаживаем, пока минутное окно не сдвинется
      const used = Number(res.headers.get('x-mbx-used-weight-1m'))
      if (used > 1800) await ctx.sleep(8000)
      else if (used > 1200) await ctx.sleep(1500)
      return body
    }
  }

  /** Дневные цены закрытия актива в долларах — чтобы пересчитать комиссию, уплаченную не в долларах (например, в BNB) */
  async function dailyPrices(ctx: Ctx, asset: string, from: number, to: number): Promise<Map<number, number>> {
    const out = new Map<number, number>()
    try {
      const qs = query({ symbol: asset + 'USDT', interval: '1d', startTime: from - 86_400_000, endTime: to, limit: 20 })
      const res = await httpGet(ctx, `${hosts.futures}/fapi/v1/klines?${qs}`, {})
      const rows = res.ok ? await readJson(res) : null
      if (Array.isArray(rows)) for (const r of rows) out.set(Math.floor(num(r[0]) / 86_400_000), num(r[4]))
    } catch {
      /* цены нет — комиссия в этой валюте останется неучтённой */
    }
    return out
  }

  async function pullIncome(ctx: Ctx, c: Cursor): Promise<PullChunk> {
    const funding: Funding[] = []
    const tasks = new Set(c.tasks.map(([s, i]) => `${s}|${i}`))
    let from = c.incomeFrom
    let done = false
    for (let page = 0; page < INCOME_PAGES && !done; page++) {
      const rows = await signedGet(ctx, 'futures', '/fapi/v1/income', { startTime: from, endTime: c.until, limit: PAGE })
      if (!Array.isArray(rows)) throw new BridgeError('exchange', 'income')
      let last = from
      for (const r of rows) {
        const t = num(r.time)
        last = Math.max(last, t)
        const sym = typeof r.symbol === 'string' ? r.symbol : ''
        if (!sym) continue
        if (r.incomeType === 'FUNDING_FEE') {
          if (USD.has(r.asset)) funding.push({ id: `F${r.tranId}`, t, sym, amt: num(r.income) })
        } else if (r.incomeType === 'REALIZED_PNL' || r.incomeType === 'COMMISSION') {
          const week = Math.floor((t - c.since) / WEEK)
          tasks.add(`${sym}|${week}`)
          // вход мог быть неделей раньше и без комиссии (акции с нулевой комиссией) — заглянем и туда
          if (week > 0) tasks.add(`${sym}|${week - 1}`)
        }
      }
      if (rows.length < PAGE) done = true
      // следующая страница — с последнего времени включительно; повторы отсекаются по идентификатору
      else from = last > from ? last : from + 1
    }
    const list = [...tasks].map((k) => k.split('|')).map(([s, i]) => [s, Number(i)] as [string, number])
    list.sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1))
    const next: Cursor = done ? { ...c, phase: 'trades', tasks: list, total: list.length } : { ...c, incomeFrom: from, tasks: list }
    const finished = done && !list.length
    return { fills: [], funding, next: finished ? null : (next as unknown as PullCursor), progress: finished ? 1 : 0.05 }
  }

  async function pullTrades(ctx: Ctx, c: Cursor): Promise<PullChunk> {
    const fills: Fill[] = []
    const tasks = c.tasks.slice()
    const prices = new Map<string, Map<number, number>>()
    for (let n = 0; n < TASKS_PER_CALL && tasks.length; n++) {
      const [sym, week] = tasks.shift()!
      const start = c.since + week * WEEK
      const end = Math.min(start + WEEK - 1, c.until)
      const seen = new Set<string>()
      let from = start
      for (;;) {
        const rows = await signedGet(ctx, 'futures', '/fapi/v1/userTrades', { symbol: sym, startTime: from, endTime: end, limit: PAGE })
        if (!Array.isArray(rows)) throw new BridgeError('exchange', 'userTrades')
        let fresh = 0
        let last = from
        for (const r of rows) {
          const id = `${sym}:${r.id}`
          if (seen.has(id)) continue
          seen.add(id)
          fresh++
          const t = num(r.time)
          last = Math.max(last, t)
          let fee = num(r.commission)
          const asset = String(r.commissionAsset ?? '')
          if (fee && asset && !USD.has(asset)) {
            let map = prices.get(asset)
            if (!map) prices.set(asset, (map = await dailyPrices(ctx, asset, start, end)))
            fee *= map.get(Math.floor(t / 86_400_000)) ?? 0
          }
          const fill: Fill = { id, t, sym, side: r.side === 'BUY' ? 1 : -1, px: num(r.price), qty: num(r.qty), fee, pnl: num(r.realizedPnl), maker: !!r.maker }
          if (r.positionSide === 'LONG') fill.ps = 'L'
          else if (r.positionSide === 'SHORT') fill.ps = 'S'
          fills.push(fill)
        }
        if (rows.length < PAGE || !fresh) break
        from = last
        await ctx.sleep(GAP_MS)
      }
      await ctx.sleep(GAP_MS)
    }
    const done = c.total - tasks.length
    return {
      fills,
      funding: [],
      next: tasks.length ? ({ ...c, tasks } as unknown as PullCursor) : null,
      progress: tasks.length ? 0.05 + 0.95 * (done / Math.max(1, c.total)) : 1,
    }
  }

  return {
    async verify(ctx) {
      const r = await signedGet(ctx, 'spot', '/sapi/v1/account/apiRestrictions')
      const risky = RISKY.filter((k) => r?.[k] === true)
      if (risky.length) throw new KeyRejected(risky)
      // ключ только для чтения — убеждаемся, что фьючерсный счёт им читается
      await signedGet(ctx, 'futures', '/fapi/v3/account')
      return {}
    },

    async pull(ctx, since, cursor) {
      const now = ctx.now()
      const c = parseCursor(cursor) ?? {
        v: 1 as const,
        since: Math.max(since, now - BINANCE_DEPTH),
        until: now,
        phase: 'income' as const,
        incomeFrom: Math.max(since, now - BINANCE_DEPTH),
        tasks: [],
        total: 0,
      }
      return c.phase === 'income' ? pullIncome(ctx, c) : pullTrades(ctx, c)
    },

    async snapshot(ctx): Promise<Snapshot> {
      const acc = await signedGet(ctx, 'futures', '/fapi/v3/account')
      const rows = await signedGet(ctx, 'futures', '/fapi/v3/positionRisk')
      const positions: OpenPosition[] = []
      for (const r of Array.isArray(rows) ? rows : []) {
        const amt = num(r.positionAmt)
        if (!amt) continue
        positions.push({ sym: String(r.symbol), side: amt > 0 ? 1 : -1, qty: Math.abs(amt), entry: num(r.entryPrice), mark: num(r.markPrice), upnl: num(r.unRealizedProfit) })
      }
      return {
        at: ctx.now(),
        wallet: num(acc?.totalWalletBalance),
        upnl: num(acc?.totalUnrealizedProfit),
        equity: num(acc?.totalMarginBalance),
        positions,
      }
    },
  }
}

/** Курсор приходит от страницы — проверяем его форму, прежде чем верить */
function parseCursor(raw: PullCursor | null): Cursor | null {
  if (!raw) return null
  const c = raw as Partial<Cursor>
  const okNum = (v: unknown): v is number => typeof v === 'number' && isFinite(v) && v >= 0
  if (c.v !== 1 || !okNum(c.since) || !okNum(c.until) || !okNum(c.incomeFrom) || !okNum(c.total)) throw new BridgeError('bad-request')
  if (c.phase !== 'income' && c.phase !== 'trades') throw new BridgeError('bad-request')
  if (!Array.isArray(c.tasks) || c.tasks.length > 20_000) throw new BridgeError('bad-request')
  for (const t of c.tasks) {
    if (!Array.isArray(t) || typeof t[0] !== 'string' || !/^[A-Z0-9_]{2,40}$/.test(t[0]) || !okNum(t[1])) throw new BridgeError('bad-request')
  }
  return c as Cursor
}
