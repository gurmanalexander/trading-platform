import { describe, expect, it, vi } from 'vitest'

// хранилища обращаются к окну браузера при загрузке модуля
vi.stubGlobal('window', {
  innerWidth: 1280,
  innerHeight: 800,
  addEventListener: () => {},
  matchMedia: () => ({ matches: true, addEventListener: () => {} }),
  setTimeout,
  setInterval,
})
vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {} })

const { screen } = await import('../src/stores/screener')
const { withUsdVolume } = await import('../src/exchanges')
const { sanitizeLayout, makeLayout, layoutCount } = await import('../src/stores/app')
type Settings = import('../src/stores/screener').ScreenerSettings

const row = (symbol: string, last: number, changePct: number, quoteVolume: number) => ({
  exchange: 'binance' as const,
  market: 'futures' as const,
  symbol,
  last,
  changePct,
  quoteVolume,
})
const base: Settings = { exchange: 'binance', market: 'futures', minVolume: 30, minChange: 0, quote: 'USDT', sort: 'volume', dir: 'desc' }

describe('отбор', () => {
  const list = withUsdVolume([row('BTCUSDT', 70000, -1, 9e9), row('ETHUSDT', 2000, 2.5, 4e9), row('DOGEUSDT', 0.1, -6, 5e7), row('TINYUSDT', 1, 12, 2e7), row('BTCUSDC', 70000, -1, 8e8)])

  it('по умолчанию: объём от 30 млн, только USDT, по убыванию объёма', () => {
    expect(screen(list, base).map((r) => r.symbol)).toEqual(['BTCUSDT', 'ETHUSDT', 'DOGEUSDT'])
  })

  it('порог объёма и валюта котировки настраиваются', () => {
    expect(screen(list, { ...base, minVolume: 0, quote: 'all' })).toHaveLength(5)
    expect(screen(list, { ...base, minVolume: 1000 }).map((r) => r.symbol)).toEqual(['BTCUSDT', 'ETHUSDT'])
  })

  it('фильтр по изменению берёт модуль', () => {
    expect(screen(list, { ...base, minChange: 2 }).map((r) => r.symbol)).toEqual(['ETHUSDT', 'DOGEUSDT'])
  })

  it('сортировки', () => {
    expect(screen(list, { ...base, sort: 'change', dir: 'desc' }).map((r) => r.symbol)).toEqual(['ETHUSDT', 'BTCUSDT', 'DOGEUSDT'])
    expect(screen(list, { ...base, sort: 'price', dir: 'asc' }).map((r) => r.symbol)).toEqual(['DOGEUSDT', 'ETHUSDT', 'BTCUSDT'])
    expect(screen(list, { ...base, sort: 'symbol', dir: 'asc' }).map((r) => r.symbol)).toEqual(['BTCUSDT', 'DOGEUSDT', 'ETHUSDT'])
  })
})

describe('оборот в долларах', () => {
  it('пары к стейблкоинам — как есть, остальные — через курс валюты котировки', () => {
    const list = withUsdVolume([row('BTCUSDT', 70000, 0, 1e9), row('ETHBTC', 0.03, 0, 100), row('USDTTRY', 40, 0, 4e8), row('XTRY', 5, 0, 4e6), row('ODDPAIRXYZ', 1, 0, 5e6)])
    const usd = Object.fromEntries(list.map((r) => [r.symbol, r.usdVolume]))
    expect(usd.BTCUSDT).toBe(1e9)
    expect(usd.ETHBTC).toBe(100 * 70000)
    expect(usd.XTRY).toBe(4e6 / 40)
    // валюта котировки неизвестна — оборот не оцениваем
    expect(usd.ODDPAIRXYZ).toBe(0)
  })
})

describe('раскладка', () => {
  it('считает окна', () => {
    expect(layoutCount({ dir: 'rows', groups: [1, 2] })).toBe(3)
    expect(makeLayout({ dir: 'cols', groups: [2, 1] }).cellSizes).toEqual([[1, 1], [1]])
  })

  it('битые сохранённые данные заменяются раскладкой по умолчанию', () => {
    const def = { dir: 'rows', groups: [1, 2] }
    expect(sanitizeLayout(undefined)).toMatchObject(def)
    expect(sanitizeLayout({ dir: 'rows', groups: [9] })).toMatchObject(def)
    expect(sanitizeLayout({ dir: 'rows', groups: [4, 4, 4] })).toMatchObject(def)
  })

  it('сохранённые доли восстанавливаются, неподходящие — сбрасываются', () => {
    const ok = sanitizeLayout({ dir: 'rows', groups: [1, 2], groupSizes: [2, 1], cellSizes: [[1], [3, 1]] })
    expect(ok.groupSizes).toEqual([2, 1])
    expect(ok.cellSizes).toEqual([[1], [3, 1]])
    const bad = sanitizeLayout({ dir: 'rows', groups: [1, 2], groupSizes: [0, 1], cellSizes: [[1], [1]] })
    expect(bad.groupSizes).toEqual([1, 1])
    expect(bad.cellSizes).toEqual([[1], [1, 1]])
  })
})
