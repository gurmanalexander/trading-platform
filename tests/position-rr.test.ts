import { describe, expect, it } from 'vitest'
import { applyRR, movePositionHandle, riskReward, roundToStep } from '../src/chart/position'
import type { Drawing } from '../src/stores/drawings'

// позиция: [вход, {правый край, цель}, {время входа, стоп}]
const long = (): Drawing => ({ id: 'p', type: 'long', color: '', pts: [{ t: 1000, p: 100 }, { t: 9000, p: 110 }, { t: 1000, p: 98 }] })
const short = (): Drawing => ({ id: 's', type: 'short', color: '', pts: [{ t: 1000, p: 100 }, { t: 9000, p: 90 }, { t: 1000, p: 102 }] })

describe('привязка R/R', () => {
  it('applyRR: от стопа ставит цель, от цели — подтягивает стоп', () => {
    expect(applyRR(100, 98, 0, 'long', 5, 'stop', 0.01)).toEqual({ stop: 98, target: 110 })
    expect(applyRR(100, 0, 110, 'long', 5, 'target', 0.01)).toEqual({ target: 110, stop: 98 })
    expect(applyRR(100, 102, 0, 'short', 3, 'stop', 0.01)).toEqual({ stop: 102, target: 94 })
    expect(roundToStep(0.1 + 0.2, 0.1)).toBe(0.3)
  })

  it('тянешь стоп — цель следует, R/R прежний', () => {
    const d = long()
    movePositionHandle(d, 2, { t: 1000, p: 97 }, 0.01, 60, riskReward(d))
    expect(d.pts[2].p).toBe(97)
    expect(d.pts[1].p).toBe(115)
    expect(riskReward(d)).toBeCloseTo(5)
  })

  it('тянешь цель — стоп подтягивается; у шорта — в свою сторону', () => {
    const d = short()
    movePositionHandle(d, 1, { t: 9000, p: 80 }, 0.01, 60, 5)
    expect(d.pts[1].p).toBe(80)
    expect(d.pts[2].p).toBe(104)
  })

  it('тянешь вход — стоп на месте, цель держит R/R', () => {
    const d = long()
    movePositionHandle(d, 0, { t: 1000, p: 99 }, 0.01, 60, 5)
    expect(d.pts[0].p).toBe(99)
    expect(d.pts[2].p).toBe(98)
    expect(d.pts[1].p).toBe(104)
  })

  it('без привязки стоп и цель двигаются отдельно', () => {
    const d = long()
    movePositionHandle(d, 2, { t: 1000, p: 97 }, 0.01, 60, 0)
    expect(d.pts[1].p).toBe(110)
  })
})
