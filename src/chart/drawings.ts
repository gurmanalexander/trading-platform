import type { IChartApi, IPrimitivePaneRenderer, IPrimitivePaneView, ISeriesApi, ISeriesPrimitive, Logical, SeriesType, Time } from 'lightweight-charts'
import { computed, shallowRef } from 'vue'
import type { Bar } from '../types'
import { app } from '../stores/app'
import { selection, type Drawing, type DrawingType, type Pt } from '../stores/drawings'
import { fmtPct, fmtPrice, fmtSpan } from '../lib/format'
import { withAlpha, type ChartColors } from './theme'

/** Что слою рисунков нужно знать о графике */
export interface DrawHost {
  chart: IChartApi
  el: HTMLElement
  paneIndex: number
  series(): ISeriesApi<SeriesType>
  bars(): Bar[]
  tfSec(): number
  tz(): number
  precision(): number
  colors(): ChartColors
  timeToLogical(t: number): number | null
  logicalToTime(l: number): number
}

interface XY {
  x: number
  y: number
}

const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1]
const HANDLE = 4.5
const FONT = '11px -apple-system, "Segoe UI", Roboto, sans-serif'
let lastColor = '#4c8dff'

const isSingle = (t: DrawingType) => t === 'hline' || t === 'vline'
const uid = () => Math.random().toString(36).slice(2, 10)

function distToSegment(px: number, py: number, a: XY, b: XY): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  let t = len2 ? ((px - a.x) * dx + (py - a.y) * dy) / len2 : 0
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy))
}

/** Конец луча: продолжение a→b до границы области w×h */
function rayEnd(a: XY, b: XY, w: number, h: number): XY {
  const dx = b.x - a.x
  const dy = b.y - a.y
  if (!dx && !dy) return b
  let t = Infinity
  if (dx > 0) t = Math.min(t, (w - a.x) / dx)
  else if (dx < 0) t = Math.min(t, -a.x / dx)
  if (dy > 0) t = Math.min(t, (h - a.y) / dy)
  else if (dy < 0) t = Math.min(t, -a.y / dy)
  if (!isFinite(t) || t < 1) t = 1
  return { x: a.x + dx * t, y: a.y + dy * t }
}

export class DrawingsLayer {
  /** Рисунки текущего инструмента (реактивный массив из хранилища) */
  list: Drawing[] = []
  readonly selectedId = computed(() => (selection.value?.pane === this.host.paneIndex ? selection.value.id : null))
  /** Позиция выбранного рисунка на экране — для панели действий */
  readonly anchor = shallowRef<XY | null>(null)

  private draft: Drawing | null = null
  private measure: Drawing | null = null
  private hoverId: string | null = null
  private pressing = false
  private downAt: XY = { x: 0, y: 0 }
  private drag: { d: Drawing; handle: number; start: XY; orig: XY[]; moved: boolean } | null = null
  private requestUpdate: (() => void) | null = null
  private overlay: HTMLElement | null = null
  private offs: (() => void)[] = []

  private readonly primitive: ISeriesPrimitive<Time>

  constructor(private host: DrawHost) {
    const renderer: IPrimitivePaneRenderer = {
      draw: (target) =>
        target.useMediaCoordinateSpace((scope) => this.render(scope.context, scope.mediaSize.width, scope.mediaSize.height)),
    }
    const views: IPrimitivePaneView[] = [{ zOrder: () => 'top', renderer: () => renderer }]
    this.primitive = {
      attached: (p) => (this.requestUpdate = p.requestUpdate),
      detached: () => (this.requestUpdate = null),
      paneViews: () => views,
    }
  }

  attach(series: ISeriesApi<SeriesType>) {
    series.attachPrimitive(this.primitive)
  }

  setList(list: Drawing[]) {
    this.list = list
    this.draft = null
    this.measure = null
    this.hoverId = null
    this.redraw()
  }

  redraw() {
    this.requestUpdate?.()
  }

  // ---------- координаты ----------

  private toScreen(p: Pt): XY | null {
    const lg = this.host.timeToLogical(p.t)
    if (lg == null) return null
    const x = this.host.chart.timeScale().logicalToCoordinate(lg as Logical)
    const y = this.host.series().priceToCoordinate(p.p)
    if (x == null || y == null) return null
    return { x, y }
  }

  private toPoint(x: number, y: number): Pt | null {
    const lg = this.host.chart.timeScale().coordinateToLogical(x)
    let price = this.host.series().coordinateToPrice(y) as number | null
    if (lg == null || price == null) return null
    const idx = Math.round(lg)
    if (app.magnet) {
      const bar = this.host.bars()[idx]
      if (bar) {
        let best = 14
        for (const v of [bar.open, bar.high, bar.low, bar.close]) {
          const vy = this.host.series().priceToCoordinate(v)
          if (vy != null && Math.abs(vy - y) < best) {
            best = Math.abs(vy - y)
            price = v
          }
        }
      }
    }
    return { t: this.host.logicalToTime(idx), p: price }
  }

  // ---------- события ----------

  /** overlay — прозрачный слой над областью цены; активен, пока выбран инструмент рисования */
  bind(overlay: HTMLElement) {
    this.overlay = overlay
    const el = this.host.el
    const rel = (e: PointerEvent): XY => {
      const r = el.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }
    const on = <K extends keyof HTMLElementEventMap>(
      target: HTMLElement | Window,
      type: K,
      fn: (e: HTMLElementEventMap[K]) => void,
      opts?: AddEventListenerOptions,
    ) => {
      target.addEventListener(type, fn as EventListener, opts)
      this.offs.push(() => target.removeEventListener(type, fn as EventListener, opts))
    }

    // режим рисования
    on(overlay, 'pointerdown', (e) => {
      if (e.button > 0) return
      overlay.setPointerCapture(e.pointerId)
      const p = rel(e)
      this.toolDown(p.x, p.y)
    })
    on(overlay, 'pointermove', (e) => {
      const p = rel(e)
      this.toolMove(p.x, p.y, e.pointerType === 'mouse')
    })
    on(overlay, 'pointerup', (e) => {
      const p = rel(e)
      this.toolUp(p.x, p.y)
    })
    on(overlay, 'pointercancel', () => this.cancelDraft())
    on(overlay, 'pointerleave', () => this.host.chart.clearCrosshairPosition())

    // обычный режим: выбор и перетаскивание готовых рисунков.
    // capture — чтобы успеть отключить прокрутку графика до того, как он сам обработает нажатие
    on(
      el,
      'pointerdown',
      (e) => {
        if (app.tool !== 'cursor' || e.button > 0) return
        const p = rel(e)
        this.idleDown(p.x, p.y, e.pointerType === 'mouse' ? 6 : 14)
      },
      { capture: true },
    )
    on(el, 'pointermove', (e) => {
      if (e.pointerType !== 'mouse' || app.tool !== 'cursor' || this.drag) return
      const p = rel(e)
      const id = this.hit(p.x, p.y, 6)?.d.id ?? null
      if (id !== this.hoverId) {
        this.hoverId = id
        el.classList.toggle('over-drawing', !!id)
        this.redraw()
      }
    })
    on(window, 'pointermove', (e) => {
      if (!this.drag) return
      const p = rel(e as PointerEvent)
      this.dragMove(p.x, p.y)
    })
    const end = () => this.dragEnd()
    on(window, 'pointerup', end)
    on(window, 'pointercancel', end)
  }

  /** Подгоняет слой рисования под область цены (без шкал и панелей индикаторов) */
  layoutOverlay() {
    if (!this.overlay) return
    const size = this.host.chart.paneSize(0)
    this.overlay.style.width = size.width + 'px'
    this.overlay.style.height = size.height + 'px'
  }

  destroy() {
    this.offs.forEach((off) => off())
    this.offs = []
  }

  private toolDown(x: number, y: number) {
    const tool = app.tool
    if (tool === 'cursor') return
    const pt = this.toPoint(x, y)
    if (!pt) return
    this.measure = null
    if (this.draft) {
      // второй щелчок завершает фигуру
      this.draft.pts[1] = pt
      this.commit()
      return
    }
    this.draft = { id: uid(), type: tool, pts: isSingle(tool) ? [pt] : [pt, { ...pt }], color: lastColor }
    this.downAt = { x, y }
    this.pressing = true
    this.redraw()
  }

  private toolMove(x: number, y: number, isMouse: boolean) {
    const pt = this.toPoint(x, y)
    if (!pt) return
    if (isMouse) this.syncCrosshair(pt)
    const d = this.draft
    if (!d) return
    if (isSingle(d.type)) {
      if (this.pressing) d.pts[0] = pt
    } else if (this.pressing || isMouse) {
      d.pts[1] = pt
    }
    this.redraw()
  }

  private toolUp(x: number, y: number) {
    if (!this.pressing) return
    this.pressing = false
    const d = this.draft
    if (!d) return
    // протянули — фигура готова; просто щёлкнули — ждём второй щелчок
    if (isSingle(d.type) || Math.hypot(x - this.downAt.x, y - this.downAt.y) > 8) this.commit()
  }

  private commit() {
    const d = this.draft
    this.draft = null
    this.pressing = false
    if (!d) return
    if (d.type === 'measure') {
      this.measure = d
    } else {
      this.list.push(d)
      selection.value = { pane: this.host.paneIndex, id: d.id }
    }
    app.tool = 'cursor'
    this.host.chart.clearCrosshairPosition()
    this.redraw()
  }

  cancelDraft() {
    if (!this.draft && !this.pressing) return
    this.draft = null
    this.pressing = false
    this.redraw()
  }

  private syncCrosshair(pt: Pt) {
    const bars = this.host.bars()
    const n = bars.length
    if (!n || pt.t < bars[0].time || pt.t > bars[n - 1].time) {
      this.host.chart.clearCrosshairPosition()
      return
    }
    this.host.chart.setCrosshairPosition(pt.p, (pt.t + this.host.tz()) as Time, this.host.series())
  }

  private idleDown(x: number, y: number, tol: number) {
    if (this.measure) {
      this.measure = null
      this.redraw()
    }
    const size = this.host.chart.paneSize(0)
    if (x > size.width || y > size.height) return
    const h = this.hit(x, y, tol)
    if (!h) {
      if (this.selectedId.value) {
        selection.value = null
        this.redraw()
      }
      return
    }
    selection.value = { pane: this.host.paneIndex, id: h.d.id }
    const orig = h.d.pts.map((p) => this.toScreen(p) ?? { x, y })
    this.drag = { d: h.d, handle: h.handle, start: { x, y }, orig, moved: false }
    this.host.chart.applyOptions({ handleScroll: false, handleScale: false })
    this.redraw()
  }

  private dragMove(x: number, y: number) {
    const g = this.drag
    if (!g) return
    const dx = x - g.start.x
    const dy = y - g.start.y
    if (!g.moved && Math.hypot(dx, dy) < 3) return
    g.moved = true
    g.orig.forEach((o, i) => {
      if (g.handle >= 0 && g.handle !== i) return
      const pt = g.handle >= 0 ? this.toPoint(x, y) : this.toPoint(o.x + dx, o.y + dy)
      if (pt) g.d.pts[i] = pt
    })
    this.redraw()
  }

  private dragEnd() {
    if (!this.drag) return
    this.drag = null
    this.host.chart.applyOptions({ handleScroll: true, handleScale: true })
  }

  // ---------- действия ----------

  selected(): Drawing | null {
    const id = this.selectedId.value
    return id ? (this.list.find((d) => d.id === id) ?? null) : null
  }

  setColor(color: string) {
    const d = this.selected()
    if (!d) return
    d.color = color
    lastColor = color
    this.redraw()
  }

  removeSelected() {
    const id = this.selectedId.value
    if (!id) return
    const i = this.list.findIndex((d) => d.id === id)
    if (i >= 0) this.list.splice(i, 1)
    selection.value = null
    this.redraw()
  }

  /** Горизонтальная линия на заданной цене (из контекстного меню) */
  addHLine(price: number) {
    const bars = this.host.bars()
    if (!bars.length) return
    this.list.push({ id: uid(), type: 'hline', pts: [{ t: bars[bars.length - 1].time, p: price }], color: lastColor })
    this.redraw()
  }

  // ---------- попадание ----------

  private hit(x: number, y: number, tol: number): { d: Drawing; handle: number } | null {
    const size = this.host.chart.paneSize(0)
    const sel = this.selectedId.value
    for (let i = this.list.length - 1; i >= 0; i--) {
      const d = this.list[i]
      const s = d.pts.map((p) => this.toScreen(p))
      if (s.some((p) => !p)) continue
      const sp = s as XY[]
      if (d.id === sel && !isSingle(d.type)) {
        for (let k = 0; k < sp.length; k++) if (Math.hypot(x - sp[k].x, y - sp[k].y) <= tol + HANDLE) return { d, handle: k }
      }
      let ok = false
      switch (d.type) {
        case 'hline':
          ok = Math.abs(y - sp[0].y) <= tol
          break
        case 'vline':
          ok = Math.abs(x - sp[0].x) <= tol
          break
        case 'trend':
          ok = distToSegment(x, y, sp[0], sp[1]) <= tol
          break
        case 'ray':
          ok = distToSegment(x, y, sp[0], rayEnd(sp[0], sp[1], size.width, size.height)) <= tol
          break
        case 'rect':
        case 'fib': {
          const x0 = Math.min(sp[0].x, sp[1].x) - tol
          const x1 = Math.max(sp[0].x, sp[1].x) + tol
          const y0 = Math.min(sp[0].y, sp[1].y) - tol
          const y1 = Math.max(sp[0].y, sp[1].y) + tol
          ok = x >= x0 && x <= x1 && y >= y0 && y <= y1
          break
        }
      }
      if (ok) return { d, handle: -1 }
    }
    return null
  }

  // ---------- отрисовка ----------

  private render(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const sel = this.selectedId.value
    let anchor: XY | null = null
    ctx.save()
    ctx.font = FONT
    ctx.lineJoin = 'round'
    for (const d of this.list) {
      const active = d.id === sel || d.id === this.hoverId
      const sp = this.drawOne(ctx, d, w, h, active, d.id === sel)
      if (d.id === sel && sp) anchor = { x: Math.min(...sp.map((p) => p.x)), y: Math.min(...sp.map((p) => p.y)) }
    }
    if (this.draft) this.drawOne(ctx, this.draft, w, h, true, true)
    if (this.measure) this.drawOne(ctx, this.measure, w, h, false, false)
    ctx.restore()
    const prev = this.anchor.value
    if (anchor?.x !== prev?.x || anchor?.y !== prev?.y) {
      // панель действий — вне цикла отрисовки, чтобы не трогать DOM посреди кадра
      const next = anchor
      queueMicrotask(() => (this.anchor.value = next))
    }
  }

  private drawOne(ctx: CanvasRenderingContext2D, d: Drawing, w: number, h: number, active: boolean, handles: boolean): XY[] | null {
    const s = d.pts.map((p) => this.toScreen(p))
    if (s.some((p) => !p)) return null
    const sp = s as XY[]
    const c = this.host.colors()
    const prec = this.host.precision()
    ctx.strokeStyle = d.color
    ctx.fillStyle = d.color
    ctx.lineWidth = active ? 2 : 1.5
    ctx.setLineDash([])
    const line = (a: XY, b: XY) => {
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.stroke()
    }
    const label = (text: string, x: number, y: number, align: CanvasTextAlign = 'left') => {
      ctx.textAlign = align
      ctx.textBaseline = 'bottom'
      ctx.fillStyle = d.color
      ctx.fillText(text, x, y)
    }
    let handlePts = sp

    switch (d.type) {
      case 'trend':
        line(sp[0], sp[1])
        break
      case 'ray':
        line(sp[0], rayEnd(sp[0], sp[1], w, h))
        break
      case 'hline': {
        const y = Math.round(sp[0].y) + 0.5
        line({ x: 0, y }, { x: w, y })
        label(fmtPrice(d.pts[0].p, prec), w - 6, y - 3, 'right')
        handlePts = [{ x: w / 2, y }]
        break
      }
      case 'vline': {
        const x = Math.round(sp[0].x) + 0.5
        line({ x, y: 0 }, { x, y: h })
        handlePts = [{ x, y: h / 2 }]
        break
      }
      case 'rect': {
        const x = Math.min(sp[0].x, sp[1].x)
        const y = Math.min(sp[0].y, sp[1].y)
        const rw = Math.abs(sp[1].x - sp[0].x)
        const rh = Math.abs(sp[1].y - sp[0].y)
        ctx.fillStyle = withAlpha(d.color, 0.12)
        ctx.fillRect(x, y, rw, rh)
        ctx.strokeRect(x, y, rw, rh)
        break
      }
      case 'fib': {
        const x0 = Math.min(sp[0].x, sp[1].x)
        const x1 = Math.max(sp[0].x, sp[1].x, x0 + 60)
        const p0 = d.pts[0].p
        const p1 = d.pts[1].p
        ctx.setLineDash([4, 4])
        ctx.lineWidth = 1
        ctx.strokeStyle = withAlpha(d.color, 0.6)
        line(sp[0], sp[1])
        ctx.setLineDash([])
        ctx.strokeStyle = d.color
        ctx.lineWidth = active ? 1.5 : 1
        for (const lvl of FIB_LEVELS) {
          // уровень 0 — в конечной точке, 1 — в начальной
          const price = p1 + (p0 - p1) * lvl
          const yy = this.host.series().priceToCoordinate(price)
          if (yy == null) continue
          const y = Math.round(yy) + 0.5
          line({ x: x0, y }, { x: x1, y })
          label(`${lvl} (${fmtPrice(price, prec)})`, x0 + 2, y - 2)
        }
        break
      }
      case 'measure': {
        const up = d.pts[1].p >= d.pts[0].p
        const col = up ? c.up : c.down
        const x = Math.min(sp[0].x, sp[1].x)
        const y = Math.min(sp[0].y, sp[1].y)
        const rw = Math.abs(sp[1].x - sp[0].x)
        const rh = Math.abs(sp[1].y - sp[0].y)
        ctx.fillStyle = withAlpha(col, 0.14)
        ctx.fillRect(x, y, rw, rh)
        ctx.strokeStyle = col
        ctx.lineWidth = 1
        const mx = x + rw / 2
        const my = y + rh / 2
        line({ x: mx, y: sp[0].y }, { x: mx, y: sp[1].y })
        line({ x: sp[0].x, y: my }, { x: sp[1].x, y: my })
        const diff = d.pts[1].p - d.pts[0].p
        const pct = d.pts[0].p ? (diff / d.pts[0].p) * 100 : 0
        const dt = d.pts[1].t - d.pts[0].t
        const nBars = Math.round(dt / this.host.tfSec())
        const l1 = `${diff >= 0 ? '+' : ''}${fmtPrice(diff, prec)} (${fmtPct(pct)})`
        const l2 = `${nBars} бар., ${fmtSpan(dt)}`
        const bw = Math.max(ctx.measureText(l1).width, ctx.measureText(l2).width) + 16
        const bh = 36
        let bx = mx - bw / 2
        let by = up ? y - bh - 6 : y + rh + 6
        bx = Math.max(2, Math.min(w - bw - 2, bx))
        by = Math.max(2, Math.min(h - bh - 2, by))
        ctx.fillStyle = col
        ctx.beginPath()
        ctx.roundRect(bx, by, bw, bh, 4)
        ctx.fill()
        ctx.fillStyle = '#fff'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(l1, bx + bw / 2, by + 11)
        ctx.fillText(l2, bx + bw / 2, by + 26)
        return sp
      }
    }

    if (handles) {
      ctx.setLineDash([])
      ctx.lineWidth = 1.5
      for (const p of handlePts) {
        ctx.beginPath()
        ctx.arc(p.x, p.y, HANDLE, 0, Math.PI * 2)
        ctx.fillStyle = c.bg
        ctx.fill()
        ctx.strokeStyle = d.color
        ctx.stroke()
      }
    }
    return handlePts
  }
}
