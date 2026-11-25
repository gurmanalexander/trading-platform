import { describe, expect, it } from 'vitest'
import { visChoice, visibleOn } from '../src/lib/visibility'
import type { Drawing } from '../src/stores/drawings'

const M5 = 300
const H1 = 3600
const H4 = 14400
const D1 = 86400
const text = (extra: Partial<Drawing> = {}): Drawing => ({ id: 't', type: 'text', color: '', pts: [{ t: 0, p: 1 }], text: 'x', ...extra })

describe('видимость рисунков по интервалам', () => {
  it('по умолчанию рисунок виден на всех интервалах, позиция — только внутри дня', () => {
    expect([M5, H1, H4, D1].every((tf) => visibleOn(text(), tf))).toBe(true)
    const pos: Drawing = { id: 'p', type: 'long', color: '', pts: [] }
    expect(visibleOn(pos, H1)).toBe(true)
    expect(visibleOn(pos, D1)).toBe(false)
  })

  it('«только этот интервал»: текст с 5 минут не виден на часе и четырёх часах', () => {
    const d = text({ tfs: [M5] })
    expect(visibleOn(d, M5)).toBe(true)
    expect(visibleOn(d, H1)).toBe(false)
    expect(visibleOn(d, H4)).toBe(false)
    expect(visChoice(d)).toBe('tf')
  })

  it('список интервалов важнее группы vis', () => {
    const d = text({ vis: 'daily', tfs: [H1] })
    expect(visibleOn(d, H1)).toBe(true)
    expect(visibleOn(d, D1)).toBe(false)
    expect(visChoice(text({ vis: 'intraday' }))).toBe('intraday')
  })
})
