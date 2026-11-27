import { describe, expect, it } from 'vitest'
// @ts-expect-error учебная биржа — обычный скрипт без описания типов
import { MOCK_SECRET, createMock } from '../scripts/mock-exchange-core.mjs'
import { binance, BINANCE_DEPTH } from '../extension/src/exchanges/binance'
import { bybit } from '../extension/src/exchanges/bybit'
import { BridgeError, importSecret, query, signerOf, type Ctx } from '../extension/src/exchanges/http'
import { KeyRejected, type ExchangeClient } from '../extension/src/exchanges/types'
import { buildTrades } from '../journal/src/core/positions'
import { summarize } from '../journal/src/core/stats'
import type { Fill, Funding } from '../journal/src/core/types'
import type { PullCursor } from '../journal/src/core/protocol'

const NOW = Date.UTC(2026, 10, 27, 12)
const DAY = 86_400_000

async function ctxFor(apiKey: string, mock: any, clock = () => NOW): Promise<Ctx> {
  return { apiKey, sign: signerOf(await importSecret(MOCK_SECRET)), fetch: mock.fetch, now: clock, sleep: async () => {} }
}

async function pullAll(client: ExchangeClient, ctx: Ctx, since: number) {
  const fills: Fill[] = []
  const funding: Funding[] = []
  let cursor: PullCursor | null = null
  let calls = 0
  let last = 0
  do {
    const chunk = await client.pull(ctx, since, cursor)
    fills.push(...chunk.fills)
    funding.push(...chunk.funding)
    expect(chunk.progress).toBeGreaterThanOrEqual(0)
    expect(chunk.progress).toBeLessThanOrEqual(1)
    last = chunk.progress
    cursor = chunk.next
    if (++calls > 2000) throw new Error('загрузка не заканчивается')
  } while (cursor)
  expect(last).toBe(1)
  return { fills, funding, calls }
}

const uniq = <T extends { id: string }>(list: T[]) => [...new Map(list.map((x) => [x.id, x])).values()]

describe('подпись запросов', () => {
  it('HMAC-SHA256 совпадает с примером из документации Binance', async () => {
    const sign = signerOf(await importSecret('NhqPtmdSJYdKjVHjA7PZj4Mge3R5YNiP1e3UZjInClVN65XAbvqqM6A7H5fATj0j'))
    const qs = 'symbol=LTCBTC&side=BUY&type=LIMIT&timeInForce=GTC&quantity=1&price=0.1&recvWindow=5000&timestamp=1499827319559'
    expect(await sign(qs)).toBe('c8db56825ae71d6d79447849e617115f4a920fa2acdcab2b053c4b2838bd6b71')
  })

  it('ключ подписи нельзя извлечь обратно', async () => {
    const key = await importSecret('secret')
    expect(key.extractable).toBe(false)
    await expect(crypto.subtle.exportKey('raw', key)).rejects.toThrow()
  })

  it('строка запроса кодирует значения и пропускает пустые', () => {
    expect(query({ a: 1, b: undefined, c: 'x y' })).toBe('a=1&c=x%20y')
  })
})

describe('Binance: мост против учебной биржи', () => {
  it('принимает ключ только для чтения и отклоняет ключ с правом торговли', async () => {
    const mock = createMock({ now: () => NOW })
    const client = binance({ futures: 'http://m/binance-f', spot: 'http://m/binance-s' })
    await expect(client.verify(await ctxFor('mock-binance-read', mock))).resolves.toEqual({})
    const err = await client.verify(await ctxFor('mock-binance-trade', mock)).catch((e) => e)
    expect(err).toBeInstanceOf(KeyRejected)
    expect(err.flags).toEqual(['enableSpotAndMarginTrading', 'enableFutures'])
  })

  it('неизвестный ключ и неверный секрет — ошибка доступа', async () => {
    const mock = createMock({ now: () => NOW })
    const client = binance({ futures: 'http://m/binance-f', spot: 'http://m/binance-s' })
    await expect(client.verify(await ctxFor('nope', mock))).rejects.toMatchObject({ code: 'auth' })
    const wrong: Ctx = { ...(await ctxFor('mock-binance-read', mock)), sign: signerOf(await importSecret('other')) }
    await expect(client.verify(wrong)).rejects.toBeInstanceOf(BridgeError)
  })

  it('часы устройства отстают от биржи — запросы всё равно проходят', async () => {
    const mock = createMock({ now: () => NOW, skew: 45_000 })
    const client = binance({ futures: 'http://m/binance-f', spot: 'http://m/binance-s' })
    await expect(client.verify(await ctxFor('mock-binance-read', mock))).resolves.toEqual({})
  })

  it('загружает всю доступную историю по частям, без пропусков и лишнего', async () => {
    const mock = createMock({ now: () => NOW })
    // маленькая страница — чтобы постраничная загрузка точно сработала
    const client = binance({ futures: 'http://m/binance-f', spot: 'http://m/binance-s' }, { page: 50 })
    const { fills, funding, calls } = await pullAll(client, await ctxFor('mock-binance-read', mock), 0)
    const from = NOW - BINANCE_DEPTH
    const data = mock.dataset('demo-binance')
    const expected = data.rows.filter((f: Fill) => f.t >= from)
    expect(calls).toBeGreaterThan(3)
    expect(uniq(fills).map((f) => f.id).sort()).toEqual(expected.map((f: Fill) => `${f.sym}:${f.id}`).sort())
    expect(uniq(funding)).toHaveLength(data.funding.filter((f: Funding) => f.t >= from).length)
    const one = uniq(fills).find((f) => f.id.endsWith(':' + expected[0].id))!
    expect(one).toMatchObject({ t: expected[0].t, sym: expected[0].sym, side: expected[0].side, px: expected[0].px, qty: expected[0].qty })
    expect(one.fee).toBeCloseTo(expected[0].fee, 6)
    // сделки, собранные из загруженного, совпадают с собранными из исходных данных
    const got = summarize(buildTrades('a', uniq(fills), uniq(funding)))
    const want = summarize(buildTrades('a', expected, data.funding.filter((f: Funding) => f.t >= from)))
    expect(got.trades).toBe(want.trades)
    expect(got.net).toBeCloseTo(want.net, 2)
    expect(got.trades).toBeGreaterThan(100)
  })

  it('повторная загрузка с недавнего момента запрашивает только свежее', async () => {
    const mock = createMock({ now: () => NOW })
    const client = binance({ futures: 'http://m/binance-f', spot: 'http://m/binance-s' })
    const { fills } = await pullAll(client, await ctxFor('mock-binance-read', mock), NOW - 3 * DAY)
    expect(fills.every((f) => f.t >= NOW - 3 * DAY)).toBe(true)
    expect(mock.calls['/fapi/v1/userTrades'] ?? 0).toBeLessThan(40)
  })

  it('состояние счёта: баланс и открытые позиции', async () => {
    const mock = createMock({ now: () => NOW })
    const client = binance({ futures: 'http://m/binance-f', spot: 'http://m/binance-s' })
    const snap = await client.snapshot(await ctxFor('mock-binance-read', mock))
    expect(snap.wallet).toBe(12_500)
    expect(snap.positions).toHaveLength(1)
    expect(snap.positions[0]).toMatchObject({ sym: 'ETHUSDT', side: 1, qty: 1.2 })
    expect(snap.equity).toBeCloseTo(snap.wallet + snap.upnl, 4)
  })

  it('испорченная метка продолжения отклоняется', async () => {
    const mock = createMock({ now: () => NOW })
    const client = binance({ futures: 'http://m/binance-f', spot: 'http://m/binance-s' })
    const ctx = await ctxFor('mock-binance-read', mock)
    await expect(client.pull(ctx, 0, { v: 1, phase: 'trades', since: 0, until: 1, incomeFrom: 0, total: 1, tasks: [['../etc', 0]] })).rejects.toMatchObject({ code: 'bad-request' })
    await expect(client.pull(ctx, 0, { hello: 1 })).rejects.toMatchObject({ code: 'bad-request' })
  })
})

describe('Bybit: мост против учебной биржи', () => {
  it('принимает ключ только для чтения, сообщает срок действия; ключ с записью отклоняет', async () => {
    const mock = createMock({ now: () => NOW })
    const client = bybit(['http://m/bybit'])
    const ok = await client.verify(await ctxFor('mock-bybit-read', mock))
    expect(ok.expiresAt).toBe(NOW + 60 * DAY)
    const err = await client.verify(await ctxFor('mock-bybit-trade', mock)).catch((e) => e)
    expect(err).toBeInstanceOf(KeyRejected)
    expect(err.flags).toContain('Order')
    await expect(client.verify(await ctxFor('nope', mock))).rejects.toMatchObject({ code: 'auth' })
  })

  it('загружает историю недельными окнами и страницами', async () => {
    const mock = createMock({ now: () => NOW })
    const client = bybit(['http://m/bybit'], { page: 7 })
    const since = NOW - 120 * DAY
    const { fills, funding } = await pullAll(client, await ctxFor('mock-bybit-read', mock), since)
    const data = mock.dataset('demo-bybit')
    const expected = data.rows.filter((f: Fill) => f.t >= since)
    expect(fills).toHaveLength(uniq(fills).length) // окна не пересекаются — повторов нет
    expect(fills.map((f) => f.id).sort()).toEqual(expected.map((f: Fill) => `e-${f.id}`).sort())
    expect(funding).toHaveLength(data.funding.filter((f: Funding) => f.t >= since).length)
    // знак фандинга: у биржи execFee > 0 — платим мы, в журнале это отрицательная сумма
    const f0 = data.funding.find((f: Funding) => f.t >= since)
    expect(funding.find((f) => f.t === f0.t && f.sym === f0.sym)!.amt).toBeCloseTo(f0.amt, 6)
    const got = summarize(buildTrades('a', fills, funding))
    const want = summarize(buildTrades('a', expected, data.funding.filter((f: Funding) => f.t >= since)))
    expect(got.trades).toBe(want.trades)
    expect(got.net).toBeCloseTo(want.net, 2)
    expect(got.trades).toBeGreaterThan(50)
  })

  it('запасной адрес используется, когда основной не отвечает', async () => {
    const mock = createMock({ now: () => NOW })
    const ctx = await ctxFor('mock-bybit-read', mock)
    const flaky: Ctx = { ...ctx, fetch: ((url: string, init: RequestInit) => (String(url).startsWith('http://down') ? Promise.reject(new Error('offline')) : mock.fetch(url, init))) as typeof fetch }
    const client = bybit(['http://down/bybit', 'http://m/bybit'])
    await expect(client.verify(flaky)).resolves.toMatchObject({ expiresAt: NOW + 60 * DAY })
  })

  it('состояние счёта', async () => {
    const mock = createMock({ now: () => NOW })
    const snap = await bybit(['http://m/bybit']).snapshot(await ctxFor('mock-bybit-read', mock))
    expect(snap.wallet).toBe(4200)
    expect(snap.positions[0]).toMatchObject({ sym: 'SOLUSDT', side: -1, leverage: 10 })
  })
})
