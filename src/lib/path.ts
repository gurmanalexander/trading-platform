// Геометрия ломаных на экране: попадание по отрезку и упрощение штриха карандаша

export interface XY {
  x: number
  y: number
}

/** Расстояние от точки до отрезка ab, px */
export function distToSegment(px: number, py: number, a: XY, b: XY): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  let t = len2 ? ((px - a.x) * dx + (py - a.y) * dy) / len2 : 0
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy))
}

/** Упрощение ломаной (Рамер — Дуглас — Пекер): номера точек, которые нужно оставить */
export function simplifyPath(pts: XY[], tol: number): number[] {
  if (pts.length < 3) return pts.map((_, i) => i)
  const keep = new Uint8Array(pts.length)
  keep[0] = keep[pts.length - 1] = 1
  const stack: [number, number][] = [[0, pts.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()!
    let best = -1
    let far = tol
    for (let i = a + 1; i < b; i++) {
      const d = distToSegment(pts[i].x, pts[i].y, pts[a], pts[b])
      if (d > far) {
        far = d
        best = i
      }
    }
    if (best < 0) continue
    keep[best] = 1
    stack.push([a, best], [best, b])
  }
  return pts.map((_, i) => i).filter((i) => keep[i])
}
