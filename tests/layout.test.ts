import { describe, expect, it } from 'vitest'
import { parseTf } from '../src/lib/timeframes'
import { movePositionHandle, riskReward } from '../src/chart/position'
import type { Drawing } from '../src/stores/drawings'

describe('интервал с клавиатуры', () => {
  const id = (s: string) => parseTf(s)?.id ?? null

  it('число без единиц — минуты', () => {
    expect(id('5')).toBe('5m')
    expect(id('15')).toBe('15m')
    expect(id('60')).toBe('1h')
    expect(id('240')).toBe('4h')
  })

  it('единицы на латинице и кириллице', () => {
    expect(id('1h')).toBe('1h')
    expect(id('4H')).toBe('4h')
    expect(id('4ч')).toBe('4h')
    expect(id('D')).toBe('1d')
    expect(id('1д')).toBe('1d')
    expect(id('w')).toBe('1w')
    expect(id('н')).toBe('1w')
  })

  it('m — минуты, M — месяц', () => {
    expect(id('3m')).toBe('3m')
    expect(id('M')).toBe('1M')
    expect(id('1M')).toBe('1M')
    expect(id('мес')).toBe('1M')
  })

  it('несуществующие интервалы отклоняются', () => {
    expect(id('7')).toBeNull()
    expect(id('2M')).toBeNull()
    expect(id('')).toBeNull()
    expect(id('abc')).toBeNull()
    expect(id('5x')).toBeNull()
  })
})

describe('позиция лонг/шорт', () => {
  const long = (): Drawing => ({
    id: 'a',
    type: 'long',
    color: '#000',
    pts: [
      { t: 1000, p: 100 },
      { t: 2000, p: 110 },
      { t: 1000, p: 95 },
    ],
  })
  const short = (): Drawing => ({
    id: 'b',
    type: 'short',
    color: '#000',
    pts: [
      { t: 1000, p: 100 },
      { t: 2000, p: 90 },
      { t: 1000, p: 105 },
    ],
  })

  it('прибыль к риску', () => {
    expect(riskReward(long())).toBe(2)
    expect(riskReward(short())).toBe(2)
  })

  it('цель лонга нельзя опустить ниже входа, стоп — поднять выше', () => {
    const d = long()
    movePositionHandle(d, 1, { t: 0, p: 90 }, 0.01, 60)
    expect(d.pts[1].p).toBe(100.01)
    movePositionHandle(d, 2, { t: 0, p: 120 }, 0.01, 60)
    expect(d.pts[2].p).toBe(99.99)
  })

  it('у шорта порядок уровней обратный', () => {
    const d = short()
    movePositionHandle(d, 1, { t: 0, p: 80 }, 0.01, 60)
    expect(d.pts[1].p).toBe(80)
    movePositionHandle(d, 1, { t: 0, p: 130 }, 0.01, 60)
    expect(d.pts[1].p).toBe(99.99)
    movePositionHandle(d, 2, { t: 0, p: 50 }, 0.01, 60)
    expect(d.pts[2].p).toBe(100.01)
  })

  it('вход двигается только между стопом и целью и тянет за собой начало стопа', () => {
    const d = long()
    movePositionHandle(d, 0, { t: 1500, p: 200 }, 0.01, 60)
    expect(d.pts[0]).toEqual({ t: 1500, p: 109.99 })
    expect(d.pts[2].t).toBe(1500)
    movePositionHandle(d, 0, { t: 5000, p: 100 }, 0.01, 60)
    // левый край не заходит за правый
    expect(d.pts[0].t).toBe(1940)
  })

  it('правый край не левее входа', () => {
    const d = long()
    movePositionHandle(d, 3, { t: 10, p: 0 }, 0.01, 60)
    expect(d.pts[1]).toEqual({ t: 1060, p: 110 })
  })
})
