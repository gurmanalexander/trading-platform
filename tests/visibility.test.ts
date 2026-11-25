import { describe, expect, it } from 'vitest'
import { ALL_TFS, setVisibleTfs, visChoice, visibleOn, visibleTfs } from '../src/lib/visibility'
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

  it('несколько интервалов: текст виден на 5м и 1ч, но не на 4ч', () => {
    const d = text()
    setVisibleTfs(d, [H1, M5])
    expect(d.tfs).toEqual([M5, H1])
    expect(visibleTfs(d)).toEqual([M5, H1])
    expect(visibleOn(d, H4)).toBe(false)
  })

  it('набор, совпавший с группой, хранится группой', () => {
    const d = text()
    setVisibleTfs(d, ALL_TFS.filter((s) => s < D1))
    expect(d).toMatchObject({ vis: 'intraday' })
    expect(d.tfs).toBeUndefined()
    setVisibleTfs(d, ALL_TFS)
    expect(d.vis).toBeUndefined()
    // у позиции «все интервалы» — не её обычная видимость, поэтому записывается явно
    const pos: Drawing = { id: 'p', type: 'short', color: '', pts: [] }
    setVisibleTfs(pos, ALL_TFS)
    expect(pos.vis).toBe('all')
    expect(visibleOn(pos, D1)).toBe(true)
  })
})
