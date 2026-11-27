import { describe, expect, it } from 'vitest'
import { buildTrades } from '../journal/src/core/positions'
import { applyFilter, byDay, byHold, byHour, bySide, bySymbol, byWeekday, dayIndex, equityCurve, summarize } from '../journal/src/core/stats'
import { netOf, type Fill, type Funding, type Trade } from '../journal/src/core/types'
import { demoData } from '../journal/src/core/demo'

let seq = 0
const fill = (t: number, side: 1 | -1, px: number, qty: number, extra: Partial<Fill> = {}): Fill => ({
  id: String(++seq),
  t,
  sym: 'BTCUSDT',
  side,
  px,
  qty,
  fee: 0,
  ...extra,
})

describe('сборка сделок из исполнений', () => {
  it('лонг: вход, добор, частичное и полное закрытие — одна сделка', () => {
    const trades = buildTrades('a', [
      fill(1000, 1, 100, 1, { fee: 0.05 }),
      fill(2000, 1, 110, 1, { fee: 0.055 }),
      fill(3000, -1, 120, 1, { fee: 0.06 }),
      fill(4000, -1, 90, 1, { fee: 0.045 }),
    ])
    expect(trades).toHaveLength(1)
    const t = trades[0]
    expect(t.side).toBe(1)
    expect(t.open).toBe(1000)
    expect(t.close).toBe(4000)
    expect(t.entry).toBeCloseTo(105)
    expect(t.exit).toBeCloseTo(105)
    expect(t.qty).toBe(2)
    expect(t.fills).toBe(4)
    expect(t.vol).toBeCloseTo(420)
    // (120 − 105) + (90 − 105) = 0
    expect(t.gross).toBeCloseTo(0)
    expect(t.fee).toBeCloseTo(0.21)
    expect(netOf(t)).toBeCloseTo(-0.21)
    expect(t.partial).toBeUndefined()
  })

  it('шорт считает результат в обратную сторону', () => {
    const [t] = buildTrades('a', [fill(1, -1, 200, 3), fill(2, 1, 180, 3)])
    expect(t.side).toBe(-1)
    expect(t.gross).toBeCloseTo(60)
  })

  it('переворот одним ордером даёт две сделки, комиссия делится по объёму', () => {
    const trades = buildTrades('a', [fill(1, 1, 100, 1), fill(2, -1, 110, 3, { fee: 0.3 }), fill(3, 1, 105, 2)])
    expect(trades).toHaveLength(2)
    expect(trades[0]).toMatchObject({ side: 1, close: 2 })
    expect(trades[0].gross).toBeCloseTo(10)
    expect(trades[0].fee).toBeCloseTo(0.1)
    expect(trades[1]).toMatchObject({ side: -1, open: 2, close: 3, qty: 2 })
    expect(trades[1].entry).toBeCloseTo(110)
    expect(trades[1].gross).toBeCloseTo(10)
    expect(trades[1].fee).toBeCloseTo(0.2)
  })

  it('незакрытая позиция остаётся открытой сделкой', () => {
    const [t] = buildTrades('a', [fill(1, 1, 100, 2), fill(2, -1, 105, 0.5)])
    expect(t.close).toBe(0)
    expect(t.gross).toBeCloseTo(2.5)
    expect(t.exit).toBeCloseTo(105)
  })

  it('дробные объёмы закрываются в ноль без «хвостов»', () => {
    const trades = buildTrades('a', [fill(1, 1, 100, 0.1), fill(2, 1, 100, 0.2), fill(3, -1, 101, 0.3), fill(4, 1, 100, 0.1)])
    expect(trades).toHaveLength(2)
    expect(trades[0].close).toBe(3)
    expect(trades[1]).toMatchObject({ open: 4, close: 0 })
  })

  it('закрытие позиции, открытой до начала истории, — неполная сделка', () => {
    const trades = buildTrades('a', [fill(1, -1, 100, 1, { pnl: 7 }), fill(2, 1, 100, 1), fill(3, -1, 110, 1)])
    expect(trades).toHaveLength(2)
    expect(trades[0]).toMatchObject({ partial: true, side: 1, close: 1, gross: 7 })
    expect(trades[1].partial).toBeUndefined()
    expect(trades[1].gross).toBeCloseTo(10)
    // неполные сделки в статистику не идут
    expect(summarize(trades).trades).toBe(1)
  })

  it('результат биржи (Binance) важнее расчётного', () => {
    const [t] = buildTrades('a', [fill(1, 1, 100, 1), fill(2, -1, 110, 1, { pnl: 9.99 })])
    expect(t.gross).toBeCloseTo(9.99)
  })

  it('режим хеджирования Binance: лонг и шорт по одному инструменту ведутся отдельно', () => {
    const trades = buildTrades('a', [
      fill(1, 1, 100, 1, { ps: 'L' }),
      fill(2, -1, 102, 1, { ps: 'S' }),
      fill(3, -1, 104, 1, { ps: 'L' }),
      fill(4, 1, 101, 1, { ps: 'S' }),
    ])
    expect(trades).toHaveLength(2)
    expect(trades[0]).toMatchObject({ side: 1, open: 1, close: 3 })
    expect(trades[0].gross).toBeCloseTo(4)
    expect(trades[1]).toMatchObject({ side: -1, open: 2, close: 4 })
    expect(trades[1].gross).toBeCloseTo(1)
  })

  it('режим хеджирования Bybit: сторону определяет закрытый объём', () => {
    const trades = buildTrades('a', [
      fill(1, 1, 100, 1, { closed: 0 }),
      fill(2, -1, 102, 1, { closed: 0 }), // открытие шорта при открытом лонге
      fill(3, -1, 104, 1, { closed: 1 }), // закрытие лонга
      fill(4, 1, 101, 1, { closed: 1 }), // закрытие шорта
    ])
    expect(trades.map((t) => [t.side, t.open, t.close])).toEqual([
      [1, 1, 3],
      [-1, 2, 4],
    ])
  })

  it('фандинг относится к сделке, открытой в момент начисления', () => {
    const funding: Funding[] = [
      { id: 'f1', t: 1500, sym: 'BTCUSDT', amt: -0.4 },
      { id: 'f2', t: 9000, sym: 'BTCUSDT', amt: -1 }, // позиции уже нет
      { id: 'f3', t: 1500, sym: 'ETHUSDT', amt: -1 }, // другой инструмент
    ]
    const [t] = buildTrades('a', [fill(1000, 1, 100, 1), fill(2000, -1, 101, 1)], funding)
    expect(t.funding).toBeCloseTo(-0.4)
    expect(netOf(t)).toBeCloseTo(0.6)
  })

  it('повторы исполнений не удваивают сделку, порядок входных данных не важен', () => {
    const a = fill(1, 1, 100, 1)
    const b = fill(2, -1, 105, 1)
    const trades = buildTrades('a', [b, a, { ...b }, { ...a }])
    expect(trades).toHaveLength(1)
    expect(trades[0].gross).toBeCloseTo(5)
  })

  it('идентификатор сделки не меняется при догрузке новых исполнений', () => {
    const first = [fill(1, 1, 100, 1), fill(2, -1, 105, 1)]
    const id = buildTrades('acc', first)[0].id
    expect(buildTrades('acc', [...first, fill(3, 1, 100, 1)])[0].id).toBe(id)
    expect(id.startsWith('acc:BTCUSDT:L:')).toBe(true)
  })
})

const DAY = 86_400_000
const trade = (close: number, net: number, extra: Partial<Trade> = {}): Trade => ({
  id: 't' + close,
  acct: 'a',
  sym: 'BTCUSDT',
  side: 1,
  open: close - 600_000,
  close,
  entry: 100,
  exit: 101,
  qty: 1,
  vol: 200,
  gross: net,
  fee: 0,
  funding: 0,
  fills: 2,
  ...extra,
})

describe('статистика', () => {
  const list = [trade(1 * DAY, 100), trade(2 * DAY, -50), trade(3 * DAY, -30), trade(4 * DAY, 60), trade(5 * DAY, 20), trade(6 * DAY, 0)]

  it('сводка: итог, винрейт, профит-фактор, просадка, серии', () => {
    const s = summarize(list)
    expect(s.trades).toBe(6)
    expect(s.net).toBe(100)
    expect(s.wins).toBe(3)
    expect(s.losses).toBe(2)
    expect(s.winRate).toBeCloseTo(0.6) // сделка «в ноль» не считается ни прибыльной, ни убыточной
    expect(s.profitFactor).toBeCloseTo(180 / 80)
    expect(s.avgWin).toBeCloseTo(60)
    expect(s.avgLoss).toBeCloseTo(40)
    expect(s.payoff).toBeCloseTo(1.5)
    expect(s.expectancy).toBeCloseTo(100 / 6)
    expect(s.maxDrawdown).toBe(80) // 100 → 20
    expect(s.winStreak).toBe(2)
    expect(s.lossStreak).toBe(2)
    expect(s.best?.gross).toBe(100)
    expect(s.worst?.gross).toBe(-50)
    expect(s.avgHold).toBe(600)
  })

  it('без убытков профит-фактор бесконечен, без сделок — нули', () => {
    expect(summarize([trade(DAY, 5)]).profitFactor).toBe(Infinity)
    const empty = summarize([])
    expect(empty).toMatchObject({ trades: 0, net: 0, winRate: 0, profitFactor: 0, maxDrawdown: 0 })
  })

  it('открытые и неполные сделки в статистику не идут', () => {
    const s = summarize([...list, trade(0, 999, { close: 0 }), trade(7 * DAY, 999, { partial: true })])
    expect(s.trades).toBe(6)
    expect(s.net).toBe(100)
  })

  it('кривая накопленного итога начинается с нуля', () => {
    const curve = equityCurve(list)
    expect(curve.map((p) => p.v)).toEqual([0, 100, 50, 20, 80, 100, 100])
  })

  it('дни считаются в выбранном часовом поясе', () => {
    // 23:30 UTC — в Москве (UTC+3) уже следующий день
    const t = trade(10 * DAY + 23.5 * 3_600_000, 10)
    expect(byDay([t], 0)[0].day).toBe(10)
    expect(byDay([t], 180)[0].day).toBe(11)
    expect(dayIndex(0, 0)).toBe(0)
  })

  it('разрезы: день недели, час, сторона, инструмент, удержание', () => {
    // 5 января 1970 — понедельник (день 4)
    const mon = trade(4 * DAY + 3_600_000, 10)
    const sun = trade(10 * DAY + 3_600_000, -4, { side: -1, sym: 'ETHUSDT', open: 10 * DAY })
    const wd = byWeekday([mon, sun], 0)
    expect(wd).toHaveLength(7)
    expect(wd[0]).toMatchObject({ trades: 1, net: 10 })
    expect(wd[6]).toMatchObject({ trades: 1, net: -4 })
    const hours = byHour([mon, sun], 0)
    expect(hours).toHaveLength(24)
    expect(hours[0].trades).toBe(2) // обе открыты в первом часу суток
    expect(byHour([mon], 180)[3].trades).toBe(1)
    expect(bySide([mon, sun]).map((g) => [g.key, g.net])).toEqual([
      ['long', 10],
      ['short', -4],
    ])
    expect(bySymbol([mon, sun]).map((g) => g.key)).toEqual(['BTCUSDT', 'ETHUSDT'])
    const hold = byHold([mon, sun])
    expect(hold[1].trades).toBe(1) // 10 минут
    expect(hold[3].trades).toBe(1) // ровно час — уже корзина «до 4 часов"
  })

  it('отбор по счёту, периоду, инструменту, стороне и метке', () => {
    const a = trade(1 * DAY, 1, { id: 'x1' })
    const b = trade(2 * DAY, 1, { id: 'x2', acct: 'b', sym: 'ETHUSDT', side: -1 })
    const tags = (id: string) => (id === 'x2' ? ['пробой'] : undefined)
    expect(applyFilter([a, b], { accounts: ['b'] })).toEqual([b])
    expect(applyFilter([a, b], { from: 2 * DAY })).toEqual([b])
    expect(applyFilter([a, b], { to: 1 * DAY })).toEqual([a])
    expect(applyFilter([a, b], { sym: 'BTCUSDT' })).toEqual([a])
    expect(applyFilter([a, b], { side: -1 })).toEqual([b])
    expect(applyFilter([a, b], { tag: 'пробой' }, tags)).toEqual([b])
    expect(applyFilter([a, b], {})).toHaveLength(2)
  })
})

describe('демо-данные', () => {
  it('детерминированы и дают осмысленную историю', () => {
    const now = Date.UTC(2026, 10, 27, 12)
    const a = demoData('demo-binance', now)
    const b = demoData('demo-binance', now)
    expect(a.fills).toEqual(b.fills)
    const trades = buildTrades('demo-binance', a.fills, a.funding)
    const s = summarize(trades)
    expect(s.trades).toBeGreaterThan(150)
    expect(s.winRate).toBeGreaterThan(0.3)
    expect(s.winRate).toBeLessThan(0.7)
    expect(trades.filter((t) => t.partial)).toHaveLength(0)
    expect(trades.filter((t) => !t.close)).toHaveLength(1)
    expect(trades.every((t) => t.close === 0 || t.close >= t.open)).toBe(true)
  })
})
