import { describe, expect, it } from 'vitest'
import { focusFraction, formatSetup, fromRuLayout, parseSetup } from '../src/lib/setup'

describe('сетап одной строкой', () => {
  it('полная строка из примера (с табуляцией и запятой в цене)', () => {
    expect(parseSetup('10.11.2026\t#1000PEPEUSDT Long 0,0053656')).toEqual({
      date: { y: 2026, m: 11, d: 10 },
      symbol: '1000PEPEUSDT',
      side: 'long',
      level: 0.0053656,
    })
  })

  it('любая часть может отсутствовать', () => {
    expect(parseSetup('#1000PEPEUSDT')).toEqual({ symbol: '1000PEPEUSDT' })
    expect(parseSetup('1000PEPEUSDT')).toEqual({ symbol: '1000PEPEUSDT' })
    expect(parseSetup('BTCUSDT short')).toEqual({ symbol: 'BTCUSDT', side: 'short' })
    expect(parseSetup('10.11.2026 ETHUSDT')).toEqual({ date: { y: 2026, m: 11, d: 10 }, symbol: 'ETHUSDT' })
    expect(parseSetup('ETHUSDT 2040,5')).toEqual({ symbol: 'ETHUSDT', level: 2040.5 })
  })

  it('порядок частей не важен, дата понимается в разных записях', () => {
    expect(parseSetup('Шорт 0.15 #ARB 2026-11-10')).toEqual({ side: 'short', level: 0.15, symbol: 'ARBUSDT', date: { y: 2026, m: 11, d: 10 } })
    expect(parseSetup('5.1.26 #SOL')?.date).toEqual({ y: 2026, m: 1, d: 5 })
  })

  it('монета без валюты котировки дополняется USDT; биржа и рынок задаются словами', () => {
    expect(parseSetup('#PEPE')?.symbol).toBe('PEPEUSDT')
    expect(parseSetup('PEPE long')?.symbol).toBe('PEPEUSDT')
    expect(parseSetup('SOL/USDT')?.symbol).toBe('SOLUSDT')
    expect(parseSetup('bybit spot #SOL')).toEqual({ exchange: 'bybit', market: 'spot', symbol: 'SOLUSDT' })
  })

  it('обычный текст сетапом не считается', () => {
    expect(parseSetup('привет')).toBeNull()
    expect(parseSetup('HELLO')).toBeNull() // одно слово без # и без USDT
    expect(parseSetup('BTCUSDT выглядит сильным')).toBeNull()
    expect(parseSetup('12345')).toBeNull()
    expect(parseSetup('31.02.2026 BTCUSDT')).toBeNull() // такой даты нет
    expect(parseSetup('BTCUSDT ETHUSDT')).toBeNull()
    expect(parseSetup('')).toBeNull()
  })

  it('форматирование обратно разбору', () => {
    const s = { date: { y: 2026, m: 11, d: 10 }, symbol: '1000PEPEUSDT', side: 'long' as const, level: 0.0053656 }
    expect(formatSetup(s)).toBe('10.11.2026 #1000PEPEUSDT Long 0.0053656')
    expect(parseSetup(formatSetup(s))).toEqual(s)
    expect(parseSetup(formatSetup({ exchange: 'bybit', market: 'spot', symbol: 'SOLUSDT' }))).toEqual({ exchange: 'bybit', market: 'spot', symbol: 'SOLUSDT' })
  })

  it('место даты на экране зависит от интервала', () => {
    expect(focusFraction(86400)).toBeGreaterThan(2 / 3) // дневка — правая треть
    expect(focusFraction(3600)).toBe(0.5) // час — середина
    expect(focusFraction(300)).toBeLessThan(1 / 3) // 5 минут — левая треть
  })

  it('русская раскладка переводится в латинскую по клавишам', () => {
    expect(fromRuLayout('иес')).toBe('btc')
    expect(fromRuLayout('ЗУЗУ')).toBe('pepe')
    expect(fromRuLayout('1000pepe')).toBe('1000pepe')
  })
})
