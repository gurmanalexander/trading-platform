import { describe, expect, it } from 'vitest'
import { atr, bollinger, cumulativeDelta, ema, macd, oiCandles, rsi, sma, stochastic, vwap, wma } from '../src/lib/indicators'
import { fmtOffset, isTimeZone, tzOffsetSec } from '../src/lib/timezone'

const round = (a: ArrayLike<number>, d = 4) => Array.from(a, (v) => (Number.isNaN(v) ? null : +v.toFixed(d)))

describe('скользящие средние', () => {
  it('SMA: пусто до заполнения окна, дальше среднее окна', () => {
    expect(round(sma([1, 2, 3, 4, 5], 3))).toEqual([null, null, 2, 3, 4])
  })

  it('EMA: первое значение — SMA, затем сглаживание 2/(n+1)', () => {
    // alpha = 0.5: 2 -> 2 + 0.5*(4-2) = 3 -> 3 + 0.5*(5-3) = 4
    expect(round(ema([1, 2, 3, 4, 5], 3))).toEqual([null, null, 2, 3, 4])
    expect(round(ema([10, 10, 10, 20], 3))).toEqual([null, null, 10, 15])
  })

  it('EMA пропускает пустое начало ряда (нужно для сигнальной линии MACD)', () => {
    expect(round(ema([NaN, NaN, 1, 2, 3, 4], 2))).toEqual([null, null, null, 1.5, 2.5, 3.5])
  })

  it('WMA: последние значения весят больше', () => {
    // (1*1 + 2*2 + 3*3) / 6
    expect(round(wma([1, 2, 3], 3))).toEqual([null, null, 2.3333])
  })

  it('ряд короче периода — значений нет', () => {
    expect(round(sma([1, 2], 5))).toEqual([null, null])
    expect(round(ema([1, 2], 5))).toEqual([null, null])
  })
})

describe('RSI', () => {
  // классический пример Уайлдера (14 периодов)
  const closes = [44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28, 46.0, 46.03, 46.41, 46.22, 45.64]

  it('совпадает с эталонным расчётом', () => {
    const r = rsi(closes, 14)
    expect(r.slice(0, 14).every(Number.isNaN)).toBe(true)
    const expected = [70.46, 66.25, 66.48, 69.35, 66.29, 57.92]
    expected.forEach((v, i) => expect(Math.abs(r[14 + i] - v)).toBeLessThan(0.1))
  })

  it('только рост — 100', () => {
    const r = rsi([1, 2, 3, 4, 5, 6], 3)
    expect(r[5]).toBe(100)
  })
})

describe('остальные индикаторы', () => {
  it('Боллинджер: постоянная цена даёт нулевую ширину', () => {
    const b = bollinger([5, 5, 5, 5], 3, 2)
    expect(round(b.upper)).toEqual([null, null, 5, 5])
    expect(round(b.lower)).toEqual([null, null, 5, 5])
  })

  it('Боллинджер: отклонение по совокупности', () => {
    // окно [1,2,3]: среднее 2, sd = sqrt(2/3)
    const b = bollinger([1, 2, 3], 3, 2)
    expect(b.upper[2]).toBeCloseTo(2 + 2 * Math.sqrt(2 / 3), 10)
    expect(b.lower[2]).toBeCloseTo(2 - 2 * Math.sqrt(2 / 3), 10)
  })

  it('MACD: гистограмма = линия − сигнал', () => {
    const src = Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i / 5) * 10 + i * 0.3)
    const m = macd(src, 12, 26, 9)
    expect(Number.isNaN(m.line[24])).toBe(true)
    expect(Number.isNaN(m.line[25])).toBe(false)
    expect(Number.isNaN(m.signal[32])).toBe(true)
    expect(m.hist[40]).toBeCloseTo(m.line[40] - m.signal[40], 10)
  })

  it('Стохастик: закрытие на максимуме окна — 100, на минимуме — 0', () => {
    const high = [10, 11, 12, 13]
    const low = [9, 9, 9, 9]
    const s = stochastic(high, low, [9.5, 10, 12, 9], 3, 1, 2)
    expect(s.k[2]).toBe(100)
    expect(s.k[3]).toBe(0)
    expect(s.d[3]).toBe(50)
  })

  it('ATR учитывает разрыв с предыдущим закрытием', () => {
    // TR: 2, max(1, |12-10|, |11-10|) = 2, max(1, |20-11.5|, |19-11.5|) = 8.5
    const a = atr([11, 12, 20], [9, 11, 19], [10, 11.5, 19.5], 2)
    expect(a[1]).toBe(2)
    expect(a[2]).toBe(2 + (8.5 - 2) / 2)
  })

  it('VWAP обнуляется с началом новых суток (UTC)', () => {
    const day = 86400
    const time = [0, 3600, day, day + 3600]
    const v = vwap(time, [10, 20, 30, 40], [10, 20, 30, 40], [10, 20, 30, 40], [1, 3, 1, 1])
    expect(v[1]).toBe((10 * 1 + 20 * 3) / 4)
    expect(v[2]).toBe(30)
    expect(v[3]).toBe(35)
  })
})

describe('CDV и открытый интерес', () => {
  const src = (bars: [number, number, number, number, number][]) => {
    const n = bars.length
    const f = (k: number) => Float64Array.from(bars, (b) => b[k])
    return { time: new Float64Array(n), open: f(0), high: f(1), low: f(2), close: f(3), volume: f(4) }
  }

  it('CDV: объём делится по телу и теням, дельта копится; открытие — прошлое значение', () => {
    // растущая свеча без теней: вся дельта — покупки; падающая без теней — продажи
    const s = src([
      [10, 12, 10, 12, 100],
      [12, 12, 11, 11, 40],
      // доджи с тенями: пополам — 0.5 × 50 со знаком «вверх» (close >= open)
      [11, 12, 10, 11, 50],
    ])
    const [c, o, h, l] = cumulativeDelta(s, false)
    expect(Array.from(c)).toEqual([100, 60, 85])
    expect(Array.from(o)).toEqual([0, 100, 60])
    expect(Array.from(h)).toEqual([100, 100, 85])
    expect(Array.from(l)).toEqual([0, 60, 60])
  })

  it('CDV: свеча с тенями — доля покупок 0.5·(тени + 2·тело) / диапазон', () => {
    const [c] = cumulativeDelta(src([[10, 13, 9, 12, 100]]), false)
    // тени 1 + 1, тело 2: 0.5 * (2 + 4) / 4 = 0.75
    expect(c[0]).toBeCloseTo(75)
  })

  it('OI: свечи по значениям на закрытии, открытие — прошлое закрытие', () => {
    const s = { ...src([[1, 1, 1, 1, 0], [1, 1, 1, 1, 0], [1, 1, 1, 1, 0]]), oi: { close: Float64Array.from([NaN, 10, 12]), high: Float64Array.from([NaN, 11, 15]), low: Float64Array.from([NaN, 9, 12]) } }
    const [c, o, h, l] = oiCandles(s)
    expect(round(c)).toEqual([null, 10, 12])
    expect(round(o)).toEqual([null, 10, 10])
    expect(round(h)).toEqual([null, 11, 15])
    expect(round(l)).toEqual([null, 9, 10])
  })
})

describe('часовые пояса', () => {
  it('сдвиг пояса считается на нужную дату с учётом летнего времени', () => {
    expect(tzOffsetSec('UTC')).toBe(0)
    expect(tzOffsetSec('Europe/Moscow', Date.UTC(2026, 0, 15))).toBe(3 * 3600)
    expect(tzOffsetSec('America/New_York', Date.UTC(2026, 0, 15))).toBe(-5 * 3600)
    expect(tzOffsetSec('America/New_York', Date.UTC(2026, 6, 15))).toBe(-4 * 3600)
    expect(tzOffsetSec('Asia/Kolkata', Date.UTC(2026, 0, 15))).toBe(5.5 * 3600)
    expect(fmtOffset(5.5 * 3600)).toBe('UTC+5:30')
    expect(fmtOffset(-5 * 3600)).toBe('UTC−5')
    expect(isTimeZone('Mars/Base')).toBe(false)
  })
})

describe('цвет текста на плашке', () => {
  it('на светлом фоне — тёмный текст, на тёмном и насыщенном — белый', async () => {
    const { textOn } = await import('../src/lib/color')
    expect(textOn('#ffffff')).not.toBe('#fff')
    expect(textOn('#fff')).not.toBe('#fff')
    expect(textOn('#d6dbe4')).not.toBe('#fff')
    expect(textOn('rgb(240, 240, 240)')).not.toBe('#fff')
    expect(textOn('#131722')).toBe('#fff')
    expect(textOn('#f0566b')).toBe('#fff')
    expect(textOn('#1fb28a')).toBe('#fff')
    expect(textOn('#4c8dff')).toBe('#fff')
  })
})
