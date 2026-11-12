import type { IChartApi, IPrimitivePaneRenderer, IPrimitivePaneView, ISeriesApi, ISeriesPrimitive, Logical, SeriesType, Time } from 'lightweight-charts'
import { computed, shallowRef } from 'vue'
import type { Bar } from '../types'
import { app } from '../stores/app'
import { checkpoint, clipboard, selection, setDefaultStyle, styleFor, type Dash, type Drawing, type DrawingType, type Pt } from '../stores/drawings'
import { fmtPct, fmtPrice, fmtSpan } from '../lib/format'
import { withAlpha, type ChartColors } from './theme'
import { movePositionHandle, riskReward } from './position'

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

interface Geometry {
  /** экранные координаты точек рисунка */
  sp: XY[]
  /** маркеры, за которые рисунок можно тянуть */
  handles: XY[]
}

const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1]
const HANDLE = 4.5
const FONT = '11px -apple-system, "Segoe UI", Roboto, sans-serif'
const DASHES: Record<Dash, number[]> = { solid: [], dashed: [6, 4], dotted: [1.5, 3.5] }

const SINGLE = new Set<DrawingType>(['hline', 'vline', 'hray', 'cross'])
const isSingle = (t: DrawingType) => SINGLE.has(t)
export const isPosition = (t: DrawingType) => t === 'long' || t === 'short'
/** Инструменты, у которых настраиваются цвет, толщина и вид линии */
export const hasLineStyle = (t: DrawingType) => !isPosition(t) && t !== 'measure'
export const hasText = (t: DrawingType) => t === 'hline' || t === 'hray' || t === 'trend' || t === 'ray' || t === 'rect'
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
  /** прокрутка графика отключена на время жеста над рисунком */
  private scrollLocked = false
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
    // Библиотека переводит в координату только целый номер существующей свечи. Время рисунка
    // может попадать между свечами (другой интервал) или за край данных, поэтому берём
    // ближайшую свечу и сдвигаемся от неё на дробную часть шага.
    const ts = this.host.chart.timeScale()
    const base = Math.min(this.host.bars().length - 1, Math.max(0, Math.round(lg)))
    const x0 = ts.logicalToCoordinate(base as Logical)
    const y = this.host.series().priceToCoordinate(p.p)
    if (x0 == null || y == null) return null
    return { x: x0 + (lg - base) * ts.options().barSpacing, y }
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
    // цена — с шагом инструмента, без «хвоста» от пересчёта из пикселей
    return { t: this.host.logicalToTime(idx), p: +price.toFixed(this.host.precision()) }
  }

  private geometry(d: Drawing, w: number, h: number): Geometry | null {
    const s = d.pts.map((p) => this.toScreen(p))
    if (s.some((p) => !p)) return null
    const sp = s as XY[]
    switch (d.type) {
      case 'hline':
        return { sp, handles: [{ x: w / 2, y: sp[0].y }] }
      case 'vline':
        return { sp, handles: [{ x: sp[0].x, y: h / 2 }] }
      case 'long':
      case 'short':
        if (sp.length < 3) return null
        return {
          sp,
          handles: [
            { x: sp[0].x, y: sp[0].y },
            { x: sp[0].x, y: sp[1].y },
            { x: sp[0].x, y: sp[2].y },
            { x: sp[1].x, y: sp[0].y },
          ],
        }
      default:
        return { sp, handles: sp }
    }
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
        this.idleDown(p.x, p.y, e.pointerType === 'mouse' ? 6 : 14, e.shiftKey)
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

  private lockScroll(on: boolean) {
    if (this.scrollLocked === on) return
    this.scrollLocked = on
    this.host.chart.applyOptions({ handleScroll: !on, handleScale: !on })
  }

  private newDrawing(type: DrawingType, pts: Pt[]): Drawing {
    const st = styleFor(type)
    return { id: uid(), type, pts, color: st.color, width: st.width, dash: st.dash }
  }

  /** Позиция по умолчанию: цель на ~12% высоты экрана от входа, стоп вдвое ближе, ширина ~15% видимых свечей */
  private newPosition(type: 'long' | 'short', entry: Pt, x: number): Drawing {
    const sign = type === 'long' ? 1 : -1
    const size = this.host.chart.paneSize(0)
    const top = this.host.series().coordinateToPrice(0) as number | null
    const bottom = this.host.series().coordinateToPrice(size.height) as number | null
    const dist = top != null && bottom != null ? Math.abs(top - bottom) * 0.12 : entry.p * 0.01
    const right = this.toPoint(x + Math.max(60, size.width * 0.15), 0)
    const t2 = Math.max(right?.t ?? 0, entry.t + this.host.tfSec())
    return this.newDrawing(type, [entry, { t: t2, p: entry.p + sign * dist }, { t: entry.t, p: entry.p - (sign * dist) / 2 }])
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
    if (tool === 'long' || tool === 'short') this.draft = this.newPosition(tool, pt, x)
    else this.draft = this.newDrawing(tool, isSingle(tool) ? [pt] : [pt, { ...pt }])
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
    if (isPosition(d.type)) {
      // протяжка задаёт цель и правый край; стоп — вдвое ближе цели
      if (this.pressing && Math.hypot(x - this.downAt.x, y - this.downAt.y) > 8) {
        const sign = d.type === 'long' ? 1 : -1
        const dist = Math.max(Math.abs(pt.p - d.pts[0].p), 1 / 10 ** this.host.precision())
        d.pts[1] = { t: Math.max(pt.t, d.pts[0].t + this.host.tfSec()), p: d.pts[0].p + sign * dist }
        d.pts[2].p = d.pts[0].p - (sign * dist) / 2
      }
    } else if (isSingle(d.type)) {
      if (this.pressing) d.pts[0] = pt
    } else if (this.pressing || isMouse) {
      d.pts[1] = pt
    }
    this.redraw()
  }

  private toolUp(x: number, y: number) {
    this.lockScroll(false)
    if (!this.pressing) return
    this.pressing = false
    const d = this.draft
    if (!d) return
    // протянули — фигура готова; просто щёлкнули — ждём второй щелчок
    if (isSingle(d.type) || isPosition(d.type) || Math.hypot(x - this.downAt.x, y - this.downAt.y) > 8) this.commit()
  }

  private commit() {
    const d = this.draft
    this.draft = null
    this.pressing = false
    if (!d) return
    if (d.type === 'measure') {
      this.measure = d
    } else {
      checkpoint()
      this.list.push(d)
      selection.value = { pane: this.host.paneIndex, id: d.id }
    }
    app.tool = 'cursor'
    this.host.chart.clearCrosshairPosition()
    this.redraw()
  }

  cancelDraft() {
    this.lockScroll(false)
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

  private idleDown(x: number, y: number, tol: number, shift: boolean) {
    if (this.measure) {
      this.measure = null
      this.redraw()
    }
    const size = this.host.chart.paneSize(0)
    if (x > size.width || y > size.height) return
    if (shift) {
      // Shift+щелчок — линейка: первая точка здесь, вторая — следующим щелчком
      const pt = this.toPoint(x, y)
      if (!pt) return
      this.lockScroll(true)
      window.addEventListener('pointerup', () => this.lockScroll(false), { once: true })
      app.tool = 'measure'
      this.draft = this.newDrawing('measure', [pt, { ...pt }])
      this.redraw()
      return
    }
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
    this.lockScroll(true)
    this.redraw()
  }

  private dragMove(x: number, y: number) {
    const g = this.drag
    if (!g) return
    const dx = x - g.start.x
    const dy = y - g.start.y
    if (!g.moved) {
      if (Math.hypot(dx, dy) < 3) return
      g.moved = true
      checkpoint()
    }
    if (g.handle >= 0) {
      const pt = this.toPoint(x, y)
      if (pt) {
        if (isPosition(g.d.type)) movePositionHandle(g.d, g.handle, pt, 1 / 10 ** this.host.precision(), this.host.tfSec())
        else g.d.pts[g.handle] = pt
      }
    } else {
      g.orig.forEach((o, i) => {
        const pt = this.toPoint(o.x + dx, o.y + dy)
        if (pt) g.d.pts[i] = pt
      })
    }
    this.redraw()
  }

  private dragEnd() {
    if (!this.drag) return
    this.drag = null
    this.lockScroll(false)
  }

  // ---------- действия ----------

  selected(): Drawing | null {
    const id = this.selectedId.value
    return id ? (this.list.find((d) => d.id === id) ?? null) : null
  }

  setStyle(patch: Partial<Pick<Drawing, 'color' | 'width' | 'dash' | 'text'>>) {
    const d = this.selected()
    if (!d) return
    checkpoint()
    Object.assign(d, patch)
    if (!d.text) delete d.text
    this.redraw()
  }

  /** Запоминает стиль выбранного рисунка как стиль по умолчанию для этого инструмента */
  saveAsDefault() {
    const d = this.selected()
    if (d) setDefaultStyle(d.type, { color: d.color, width: d.width ?? 1, dash: d.dash ?? 'solid' })
  }

  removeSelected() {
    const id = this.selectedId.value
    if (!id) return
    const i = this.list.findIndex((d) => d.id === id)
    if (i >= 0) {
      checkpoint()
      this.list.splice(i, 1)
    }
    selection.value = null
    this.redraw()
  }

  copySelected(): boolean {
    const d = this.selected()
    if (!d) return false
    clipboard.item = JSON.parse(JSON.stringify(d))
    return true
  }

  /** Вставляет скопированный рисунок со сдвигом на несколько свечей вправо */
  paste(): boolean {
    const src = clipboard.item
    if (!src) return false
    const shift = this.host.tfSec() * 3
    const d: Drawing = { ...JSON.parse(JSON.stringify(src)), id: uid() }
    d.pts = d.pts.map((p) => ({ t: p.t + shift, p: p.p }))
    checkpoint()
    this.list.push(d)
    selection.value = { pane: this.host.paneIndex, id: d.id }
    this.redraw()
    return true
  }

  /** Горизонтальная линия на заданной цене (из контекстного меню) */
  addHLine(price: number) {
    const bars = this.host.bars()
    if (!bars.length) return
    checkpoint()
    this.list.push(this.newDrawing('hline', [{ t: bars[bars.length - 1].time, p: price }]))
    this.redraw()
  }

  // ---------- попадание ----------

  private hit(x: number, y: number, tol: number): { d: Drawing; handle: number } | null {
    if (app.drawingsHidden) return null
    const size = this.host.chart.paneSize(0)
    const sel = this.selectedId.value
    for (let i = this.list.length - 1; i >= 0; i--) {
      const d = this.list[i]
      const g = this.geometry(d, size.width, size.height)
      if (!g) continue
      const { sp, handles } = g
      if (d.id === sel && !isSingle(d.type)) {
        for (let k = 0; k < handles.length; k++) if (Math.hypot(x - handles[k].x, y - handles[k].y) <= tol + HANDLE) return { d, handle: k }
      }
      let ok = false
      switch (d.type) {
        case 'hline':
          ok = Math.abs(y - sp[0].y) <= tol
          break
        case 'vline':
          ok = Math.abs(x - sp[0].x) <= tol
          break
        case 'hray':
          ok = Math.abs(y - sp[0].y) <= tol && x >= sp[0].x - tol
          break
        case 'cross':
          ok = Math.abs(y - sp[0].y) <= tol || Math.abs(x - sp[0].x) <= tol
          break
        case 'trend':
          ok = distToSegment(x, y, sp[0], sp[1]) <= tol
          break
        case 'ray':
          ok = distToSegment(x, y, sp[0], rayEnd(sp[0], sp[1], size.width, size.height)) <= tol
          break
        case 'rect':
        case 'fib':
          ok = this.inBox(x, y, sp[0], sp[1], tol)
          break
        case 'long':
        case 'short':
          ok = this.inBox(x, y, { x: sp[0].x, y: sp[1].y }, { x: sp[1].x, y: sp[2].y }, tol)
          break
      }
      if (ok) return { d, handle: -1 }
    }
    return null
  }

  private inBox(x: number, y: number, a: XY, b: XY, tol: number): boolean {
    return x >= Math.min(a.x, b.x) - tol && x <= Math.max(a.x, b.x) + tol && y >= Math.min(a.y, b.y) - tol && y <= Math.max(a.y, b.y) + tol
  }

  // ---------- отрисовка ----------

  private render(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const sel = this.selectedId.value
    let anchor: XY | null = null
    ctx.save()
    ctx.font = FONT
    ctx.lineJoin = 'round'
    if (!app.drawingsHidden) {
      for (const d of this.list) {
        const pts = this.drawOne(ctx, d, w, h, d.id === this.hoverId, d.id === sel)
        if (d.id === sel && pts) anchor = { x: Math.min(...pts.map((p) => p.x)), y: Math.min(...pts.map((p) => p.y)) }
      }
    }
    if (this.draft) this.drawOne(ctx, this.draft, w, h, false, true)
    if (this.measure) this.drawOne(ctx, this.measure, w, h, false, false)
    ctx.restore()
    const prev = this.anchor.value
    if (anchor?.x !== prev?.x || anchor?.y !== prev?.y) {
      // панель действий — вне цикла отрисовки, чтобы не трогать DOM посреди кадра
      const next = anchor
      queueMicrotask(() => (this.anchor.value = next))
    }
  }

  /** Подпись в цветной плашке; x — центр плашки либо (left = true) её левый край, y — центр */
  private tag(ctx: CanvasRenderingContext2D, lines: string[], x: number, cy: number, bg: string, w: number, h: number, left = false) {
    const bw = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 14
    const bh = lines.length * 15 + 6
    const bx = Math.max(2, Math.min(w - bw - 2, left ? x : x - bw / 2))
    const by = Math.max(2, Math.min(h - bh - 2, cy - bh / 2))
    ctx.fillStyle = bg
    ctx.beginPath()
    ctx.roundRect(bx, by, bw, bh, 4)
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    lines.forEach((l, i) => ctx.fillText(l, bx + bw / 2, by + 11 + i * 15))
  }

  private drawOne(ctx: CanvasRenderingContext2D, d: Drawing, w: number, h: number, hover: boolean, handles: boolean): XY[] | null {
    const g = this.geometry(d, w, h)
    if (!g) return null
    const { sp } = g
    const c = this.host.colors()
    const prec = this.host.precision()
    const width = (d.width ?? 1) + (hover ? 1 : 0)
    const dash = DASHES[d.dash ?? 'solid']
    ctx.strokeStyle = d.color
    ctx.fillStyle = d.color
    ctx.lineWidth = width
    ctx.setLineDash(dash)
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
    // координата тонкой линии — на середине пикселя, иначе она размывается
    const crisp = (v: number) => (width % 2 ? Math.round(v) + 0.5 : Math.round(v))

    switch (d.type) {
      case 'trend':
        line(sp[0], sp[1])
        if (d.text) label(d.text, (sp[0].x + sp[1].x) / 2, (sp[0].y + sp[1].y) / 2 - 4, 'center')
        break
      case 'ray':
        line(sp[0], rayEnd(sp[0], sp[1], w, h))
        if (d.text) label(d.text, (sp[0].x + sp[1].x) / 2, (sp[0].y + sp[1].y) / 2 - 4, 'center')
        break
      case 'hline': {
        const y = crisp(sp[0].y)
        line({ x: 0, y }, { x: w, y })
        label(fmtPrice(d.pts[0].p, prec), w - 6, y - 3, 'right')
        if (d.text) label(d.text, 8, y - 3)
        break
      }
      case 'hray': {
        const y = crisp(sp[0].y)
        line({ x: sp[0].x, y }, { x: w, y })
        label(fmtPrice(d.pts[0].p, prec), w - 6, y - 3, 'right')
        if (d.text) label(d.text, Math.max(8, sp[0].x + 6), y - 3)
        break
      }
      case 'vline': {
        const x = crisp(sp[0].x)
        line({ x, y: 0 }, { x, y: h })
        break
      }
      case 'cross': {
        const x = crisp(sp[0].x)
        const y = crisp(sp[0].y)
        line({ x: 0, y }, { x: w, y })
        line({ x, y: 0 }, { x, y: h })
        label(fmtPrice(d.pts[0].p, prec), w - 6, y - 3, 'right')
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
        if (d.text) label(d.text, x + 4, y + 16)
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
        ctx.setLineDash(dash)
        ctx.strokeStyle = d.color
        ctx.lineWidth = width
        for (const lvl of FIB_LEVELS) {
          // уровень 0 — в конечной точке, 1 — в начальной
          const price = p1 + (p0 - p1) * lvl
          const yy = this.host.series().priceToCoordinate(price)
          if (yy == null) continue
          const y = crisp(yy)
          line({ x: x0, y }, { x: x1, y })
          label(`${lvl} (${fmtPrice(price, prec)})`, x0 + 2, y - 2)
        }
        break
      }
      case 'long':
      case 'short': {
        const x1 = sp[0].x
        const x2 = Math.max(sp[1].x, x1 + 8)
        const yE = sp[0].y
        const yT = sp[1].y
        const yS = sp[2].y
        const entry = d.pts[0].p
        const target = d.pts[1].p
        const stop = d.pts[2].p
        ctx.setLineDash([])
        ctx.fillStyle = withAlpha(c.up, hover || handles ? 0.26 : 0.18)
        ctx.fillRect(x1, Math.min(yE, yT), x2 - x1, Math.abs(yT - yE))
        ctx.fillStyle = withAlpha(c.down, hover || handles ? 0.26 : 0.18)
        ctx.fillRect(x1, Math.min(yE, yS), x2 - x1, Math.abs(yS - yE))
        ctx.strokeStyle = c.text
        ctx.lineWidth = 1
        line({ x: x1, y: Math.round(yE) + 0.5 }, { x: x2, y: Math.round(yE) + 0.5 })
        // на мелком масштабе (другой интервал) подписи слиплись бы — показываем их только у выбранной позиции
        if (!hover && !handles && (Math.abs(yT - yS) < 70 || x2 - x1 < 90)) break
        const pct = (v: number) => fmtPct(entry ? ((v - entry) / entry) * 100 : 0)
        const texts = [
          `Цель ${fmtPrice(target, prec)} (${pct(target)})`,
          `Стоп ${fmtPrice(stop, prec)} (${pct(stop)})`,
          `${d.type === 'long' ? 'Лонг' : 'Шорт'} ${fmtPrice(entry, prec)} · R/R ${riskReward(d).toFixed(2)}`,
        ]
        // узкая позиция: подписи не помещаются между маркерами — выносим их вправо от неё
        const outside = x2 - x1 < Math.max(...texts.map((t) => ctx.measureText(t).width)) + 40
        const x = outside ? x2 + 10 : (x1 + x2) / 2
        const up = d.type === 'long' ? -1 : 1
        this.tag(ctx, [texts[0]], x, yT + up * 13, c.up, w, h, outside)
        this.tag(ctx, [texts[1]], x, yS - up * 13, c.down, w, h, outside)
        this.tag(ctx, [texts[2]], x, yE, c.muted, w, h, outside)
        break
      }
      case 'measure': {
        const up = d.pts[1].p >= d.pts[0].p
        const col = up ? c.up : c.down
        const x = Math.min(sp[0].x, sp[1].x)
        const y = Math.min(sp[0].y, sp[1].y)
        const rw = Math.abs(sp[1].x - sp[0].x)
        const rh = Math.abs(sp[1].y - sp[0].y)
        ctx.setLineDash([])
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
        this.tag(ctx, [`${diff >= 0 ? '+' : ''}${fmtPrice(diff, prec)} (${fmtPct(pct)})`, `${nBars} бар., ${fmtSpan(dt)}`], mx, up ? y - 24 : y + rh + 24, col, w, h)
        return sp
      }
    }

    if (handles) {
      ctx.setLineDash([])
      ctx.lineWidth = 1.5
      for (const p of g.handles) {
        ctx.beginPath()
        ctx.arc(p.x, p.y, HANDLE, 0, Math.PI * 2)
        ctx.fillStyle = c.bg
        ctx.fill()
        ctx.strokeStyle = isPosition(d.type) ? c.text : d.color
        ctx.stroke()
      }
    }
    return g.handles
  }
}
