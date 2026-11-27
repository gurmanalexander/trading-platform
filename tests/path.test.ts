import { describe, expect, it } from 'vitest'
import { distToSegment, simplifyPath } from '../src/lib/path'

describe('штрих карандаша', () => {
  it('расстояние до отрезка: до середины и до конца', () => {
    expect(distToSegment(5, 3, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(3)
    expect(distToSegment(13, 4, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(5)
  })

  it('прямой участок сводится к концам, изгиб остаётся', () => {
    const line = Array.from({ length: 20 }, (_, i) => ({ x: i * 3, y: 0.1 * (i % 2) }))
    expect(simplifyPath(line, 0.6)).toEqual([0, 19])
    const corner = [...Array.from({ length: 10 }, (_, i) => ({ x: i * 3, y: 0 })), ...Array.from({ length: 10 }, (_, i) => ({ x: 27, y: (i + 1) * 3 }))]
    expect(simplifyPath(corner, 0.6)).toEqual([0, 9, 19])
    expect(simplifyPath([{ x: 0, y: 0 }, { x: 1, y: 1 }], 0.6)).toEqual([0, 1])
  })
})
