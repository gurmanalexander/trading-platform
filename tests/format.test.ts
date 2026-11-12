import { describe, expect, it } from 'vitest'
import { autoPrecision, decimalsOf, fmtCompact, fmtDuration, fmtPct, fmtSpan, observePrecision, precisionOf } from '../src/lib/format'
import { heikinAshi, lowerBound } from '../src/chart/bars'

describe('точность цены', () => {
  it('считает значимые знаки, отбрасывая хвостовые нули', () => {
    expect(decimalsOf('73701.51000000')).toBe(2)
    expect(decimalsOf('0.00001230')).toBe(7)
    expect(decimalsOf('83.10')).toBe(1)
    expect(decimalsOf('100.00000000')).toBe(0)
    expect(decimalsOf('100')).toBe(0)
  })

  it('наблюдаемая точность только растёт', () => {
    expect(observePrecision('t:a', ['2050.4'])).toBe(1)
    expect(observePrecision('t:a', ['2050.41', undefined])).toBe(2)
    expect(observePrecision('t:a', ['2050'])).toBe(2)
    expect(precisionOf('t:a', 2050)).toBe(2)
  })

  it('без наблюдений точность подбирается по порядку цены', () => {
    expect(precisionOf('t:unknown', 73000)).toBe(2)
    expect(autoPrecision(1.5)).toBe(4)
    expect(autoPrecision(0.00001234)).toBe(9)
    expect(autoPrecision(0)).toBe(2)
  })
})

describe('форматирование', () => {
  it('сокращает большие числа', () => {
    expect(fmtCompact(1_234_567_890)).toBe('1.23B')
    expect(fmtCompact(373_640_000)).toBe('373.64M')
    expect(fmtCompact(1500)).toBe('1.50K')
    expect(fmtCompact(12.345)).toBe('12.35')
    expect(fmtCompact(NaN)).toBe('—')
  })

  it('проценты со знаком', () => {
    expect(fmtPct(1.234)).toBe('+1.23%')
    expect(fmtPct(-0.5)).toBe('-0.50%')
    expect(fmtPct(undefined)).toBe('—')
  })

  it('длительности', () => {
    expect(fmtDuration(65)).toBe('01:05')
    expect(fmtDuration(3725)).toBe('1:02:05')
    expect(fmtDuration(90000)).toBe('1д 1ч')
    expect(fmtSpan(5400)).toBe('1ч 30м')
    expect(fmtSpan(-86400 * 2)).toBe('2д')
  })
})

describe('свечи', () => {
  const bar = (time: number, open: number, high: number, low: number, close: number) => ({ time, open, high, low, close, volume: 1 })

  it('Хейкен Аши', () => {
    const ha = heikinAshi([bar(0, 10, 14, 8, 12), bar(60, 12, 16, 11, 15)])
    expect(ha[0]).toMatchObject({ open: 11, close: 11, high: 14, low: 8 })
    // open = (11 + 11) / 2, close = (12 + 16 + 11 + 15) / 4
    expect(ha[1]).toMatchObject({ open: 11, close: 13.5, high: 16, low: 11 })
  })

  it('поиск свечи по времени', () => {
    const bars = [bar(0, 1, 1, 1, 1), bar(60, 1, 1, 1, 1), bar(120, 1, 1, 1, 1)]
    expect(lowerBound(bars, 60)).toBe(1)
    expect(lowerBound(bars, 61)).toBe(2)
    expect(lowerBound(bars, 999)).toBe(3)
    expect(lowerBound([], 5)).toBe(0)
  })
})

describe('короткие форматы для списков', () => {
  it('оборот — три значащие цифры', async () => {
    const { fmtVolume } = await import('../src/lib/format')
    expect(fmtVolume(1.214e9)).toBe('1.21B')
    expect(fmtVolume(57.42e6)).toBe('57.4M')
    expect(fmtVolume(361.5e6)).toBe('362M')
    expect(fmtVolume(999.9e6)).toBe('1.00B')
    expect(fmtVolume(950)).toBe('950')
    expect(fmtVolume(0)).toBe('—')
  })

  it('цена без хвостовых нулей и без потери малых значений', async () => {
    const { fmtPriceShort } = await import('../src/lib/format')
    expect(fmtPriceShort(73503.741)).toBe('73503.74')
    expect(fmtPriceShort(987.94)).toBe('987.94')
    expect(fmtPriceShort(1.001)).toBe('1.001')
    expect(fmtPriceShort(0.06701)).toBe('0.06701')
    expect(fmtPriceShort(0.00000446)).toBe('0.00000446')
  })
})
