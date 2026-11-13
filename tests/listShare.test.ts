import { describe, expect, it } from 'vitest'
import { nearestLevel, plainPrice, shareLine, type ShareCoin } from '../src/lib/listShare'
import { parseLines, parseSetup } from '../src/lib/setup'

const DEF = { exchange: 'binance', market: 'futures' } as const
const coin = (over: Partial<ShareCoin>): ShareCoin => ({ symbol: 'BNBUSDT', exchange: 'binance', market: 'futures', side: 'short', levels: [677.76], last: 670, precision: 2, ...over })

describe('поделиться списком', () => {
  it('выбирает уровень, ближайший к цене', () => {
    expect(nearestLevel([600, 677.76, 700], 670)).toBe(677.76)
    expect(nearestLevel([600, 677.76, 700], 690)).toBe(700)
    expect(nearestLevel([], 690)).toBeUndefined()
    expect(nearestLevel([600], undefined)).toBeUndefined()
  })

  it('пишет цену с запятой и без лишних нулей', () => {
    expect(plainPrice(677.76, 2)).toBe('677,76')
    expect(plainPrice(677.7, 2)).toBe('677,7')
    expect(plainPrice(100, 2)).toBe('100')
    expect(plainPrice(0.0053656, 7)).toBe('0,0053656')
    expect(plainPrice(0.00000123, 8)).toBe('0,00000123')
  })

  it('собирает строку: монета, направление, уровень', () => {
    expect(shareLine(coin({}), DEF)).toBe('#BNBUSDT Short 677,76')
    expect(shareLine(coin({ side: 'long', levels: [0.0053656], last: 0.0051, precision: 7, symbol: '1000PEPEUSDT' }), DEF)).toBe('#1000PEPEUSDT Long 0,0053656')
  })

  it('без направления или уровня строка короче', () => {
    expect(shareLine(coin({ side: null }), DEF)).toBe('#BNBUSDT 677,76')
    expect(shareLine(coin({ levels: [] }), DEF)).toBe('#BNBUSDT Short')
    expect(shareLine(coin({ last: undefined }), DEF)).toBe('#BNBUSDT Short')
    expect(shareLine(coin({ side: null, levels: [] }), DEF)).toBe('#BNBUSDT')
  })

  it('биржу и рынок называет, только если они не по умолчанию', () => {
    expect(shareLine(coin({ exchange: 'bybit' }), DEF)).toBe('bybit #BNBUSDT Short 677,76')
    expect(shareLine(coin({ market: 'spot' }), DEF)).toBe('spot #BNBUSDT Short 677,76')
  })

  it('строки читаются обратно вставкой сетапов', () => {
    expect(parseSetup(shareLine(coin({}), DEF))).toEqual({ symbol: 'BNBUSDT', side: 'short', level: 677.76 })
    expect(parseSetup(shareLine(coin({ exchange: 'bybit', market: 'spot' }), DEF))).toEqual({ symbol: 'BNBUSDT', side: 'short', level: 677.76, exchange: 'bybit', market: 'spot' })
    const text = [coin({}), coin({ symbol: 'TAOUSDT', side: 'long', levels: [263.4], last: 260 }), coin({ symbol: 'XRPUSDT', side: null, levels: [] })].map((c) => shareLine(c, DEF)).join('\n')
    expect(parseLines(text)?.list.map((s) => s.symbol)).toEqual(['BNBUSDT', 'TAOUSDT', 'XRPUSDT'])
  })
})
