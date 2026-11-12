import type { IChartApi, IPrimitivePaneRenderer, IPrimitivePaneView, ISeriesApi, ISeriesPrimitive, ISeriesPrimitiveAxisView, Logical, SeriesType, Time } from 'lightweight-charts'
import { computed, shallowRef } from 'vue'
import type { Bar } from '../types'
import { app } from '../stores/app'
import { checkpoint, clipboard, selection, setDefaultStyle, styleFor, visibleOn, type Dash, type Drawing, type DrawingType, type Pt, type Visibility } from '../stores/drawings'
import { formatSignal, type Signal } from '../lib/signal'
import { fmtPct, fmtPrice, fmtSpan } from '../lib/format'
import { withAlpha, type ChartColors } from './theme'
import { evaluatePosition, fmtR, movePositionHandle, riskReward, setPositionPrices } from './position'
import { STOP_PART, TAKE_RATIO } from '../lib/atr'

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
  symbol(): string
  /** дневной ATR инструмента, если уже известен */
  atr(): number | undefined
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

const SINGLE = new Set<DrawingType>(['hline', 'vline', 'hray', 'cross', 'text'])
const isSingle = (t: DrawingType) => SINGLE.has(t)
export const isPosition = (t: DrawingType) => t === 'long' || t === 'short'
/** Инструменты, у которых настраиваются цвет, толщина и вид линии */
export const hasLineStyle = (t: DrawingType) => !isPosition(t) && t !== 'measure' && t !== 'text'
export const TEXT_SIZES = [10, 12, 14, 18, 24]
export const hasText = (t: DrawingType) => t === 'hline' || t === 'hray' || t === 'trend' || t === 'ray' || t === 'rect'
const uid = () => Math.random().toString(36).slice(2, 10)

// Новая позиция: стоп — 10% дневного ATR, цель — вчетверо дальше (как в индикаторе, см. lib/atr.ts)
const STOP_ATR = STOP_PART
const DEFAULT_RR = TAKE_RATIO
const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']

/** Тёмный или светлый текст — что читается на фоне bg */
function contrast(bg: string): string {
  if (bg.length !== 7 || bg[0] !== '#') return '#fff'
  const n = parseInt(bg.slice(1), 16)
  return ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000 > 150 ? '#111' : '#fff'
}

const axisLabel = (coordinate: number, text: string, bg: string): ISeriesPrimitiveAxisView => ({
  coordinate: () => coordinate,
  text: () => text,
  textColor: () => contrast(bg),
  backColor: () => bg,
})

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
  private hoverCursor = ''
  private pressing = false
  private downAt: XY = { x: 0, y: 0 }
  private drag: { d: Drawing; handle: number; start: XY; orig: XY[]; moved: boolean; copy: boolean } | null = null
  /** где на экране нарисован каждый текст — чтобы попадать по нему указателем */
  private textBoxes = new Map<string, { x: number; y: number; w: number; h: number }>()
  private priceLabels: ISeriesPrimitiveAxisView[] = []
  private timeLabels: ISeriesPrimitiveAxisView[] = []
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
      updateAllViews: () => this.buildAxisLabels(),
      paneViews: () => views,
      priceAxisViews: () => this.priceLabels,
      timeAxisViews: () => this.timeLabels,
    }
  }

  attach(series: ISeriesApi<SeriesType>) {
    series.attachPrimitive(this.primitive)
  }

  setList(list: Drawing[]) {
    this.textBoxes.clear()
    this.list = list
    this.draft = null
    this.measure = null
    this.hoverId = null
    this.redraw()
  }

  redraw() {
    this.buildAxisLabels()
    this.requestUpdate?.()
  }

  private shown(d: Drawing): boolean {
    return visibleOn(d, this.host.tfSec())
  }

  /**
   * Метки на шкалах. Цена горизонтальных уровней, цель и стоп позиций видны на ценовой шкале всегда;
   * у выбранного рисунка на шкалы проецируются все его цены и моменты времени.
   */
  private buildAxisLabels() {
    const prices: ISeriesPrimitiveAxisView[] = []
    const times: ISeriesPrimitiveAxisView[] = []
    const c = this.host.colors()
    const prec = this.host.precision()
    const addPrice = (price: number, bg: string) => {
      const y = this.host.series().priceToCoordinate(price)
      if (y != null) prices.push(axisLabel(y, fmtPrice(price, prec), bg))
    }
    const addTime = (t: number) => {
      const x = this.xOf(t)
      if (x != null) times.push(axisLabel(x, this.timeText(t), c.accent))
    }
    const sel = this.selectedId.value
    const items = app.drawingsHidden ? [] : this.list.filter((d) => this.shown(d))
    if (this.draft) items.push(this.draft)
    for (const d of items) {
      const active = d.id === sel || d === this.draft
      if (d.type === 'hline' || d.type === 'hray' || d.type === 'cross') addPrice(d.pts[0].p, d.color)
      else if (isPosition(d.type) && d.pts.length >= 3) {
        // цель и стоп позиции видны на ценовой шкале всегда, вход — у выбранной
        addPrice(d.pts[1].p, c.up)
        addPrice(d.pts[2].p, c.down)
        if (active) addPrice(d.pts[0].p, c.crossLabel)
      } else if (active && d.type !== 'vline' && d.type !== 'text') d.pts.forEach((p) => addPrice(p.p, d.color))
      if (active && d.type !== 'hline' && d.type !== 'text') {
        addTime(d.pts[0].t)
        if (d.pts.length > 1 && d.pts[1].t !== d.pts[0].t) addTime(d.pts[1].t)
      }
    }
    this.priceLabels = prices
    this.timeLabels = times
  }

  /** Подпись времени на шкале — в том же часовом поясе, что и сама шкала */
  private timeText(t: number): string {
    const d = new Date((t + this.host.tz()) * 1000)
    const pad = (n: number) => String(n).padStart(2, '0')
    const date = `${pad(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} '${String(d.getUTCFullYear()).slice(2)}`
    return this.host.tfSec() >= 86400 ? date : `${date}  ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
  }

  // ---------- координаты ----------

  private xOf(t: number): number | null {
    const lg = this.host.timeToLogical(t)
    if (lg == null) return null
    // Библиотека переводит в координату только целый номер существующей свечи. Время рисунка
    // может попадать между свечами (другой интервал) или за край данных, поэтому берём
    // ближайшую свечу и сдвигаемся от неё на дробную часть шага.
    const ts = this.host.chart.timeScale()
    const base = Math.min(this.host.bars().length - 1, Math.max(0, Math.round(lg)))
    const x0 = ts.logicalToCoordinate(base as Logical)
    return x0 == null ? null : x0 + (lg - base) * ts.options().barSpacing
  }

  private toScreen(p: Pt): XY | null {
    const x = this.xOf(p.t)
    const y = this.host.series().priceToCoordinate(p.p)
    if (x == null || y == null) return null
    return { x, y }
  }

  /** magnet = false — для позиций: вход, стоп и цель ставятся точно, без притягивания к свече */
  private toPoint(x: number, y: number, magnet = app.magnet): Pt | null {
    const lg = this.host.chart.timeScale().coordinateToLogical(x)
    let price = this.host.series().coordinateToPrice(y) as number | null
    if (lg == null || price == null) return null
    const idx = Math.round(lg)
    if (magnet) {
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
    if (d.pin) {
      const at = { x: d.pin.x * w, y: d.pin.y * h }
      if (d.note) {
        // в окне поменьше легенда занимает больше строк — заметка чеклиста не должна под неё уходить
        const legend = this.host.el.parentElement?.querySelector<HTMLElement>('.legend')
        if (legend && at.x < legend.offsetWidth + 8) at.y = Math.max(at.y, legend.offsetHeight + 10)
      }
      return { sp: [at], handles: [at] }
    }
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
        this.idleDown(p.x, p.y, e.pointerType === 'mouse' ? 6 : 14, e.shiftKey, e.ctrlKey || e.metaKey)
      },
      { capture: true },
    )
    on(el, 'pointermove', (e) => {
      if (e.pointerType !== 'mouse' || app.tool !== 'cursor' || this.drag) return
      const p = rel(e)
      const hit = this.hit(p.x, p.y, 6)
      const id = hit?.d.id ?? null
      // над маркером выбранного рисунка курсор показывает, куда его можно тянуть
      const cur = hit && hit.handle >= 0 ? this.handleCursor(hit.d, hit.handle) : hit && hit.d.id === this.selectedId.value ? 'move' : ''
      if (cur !== this.hoverCursor) {
        this.hoverCursor = cur
        el.dataset.cursor = cur
      }
      if (id !== this.hoverId) {
        this.hoverId = id
        el.classList.toggle('over-drawing', !!id)
        this.redraw()
      }
    })
    on(el, 'dblclick', (e) => {
      if (app.tool !== 'cursor') return
      const r = el.getBoundingClientRect()
      const h = this.hit(e.clientX - r.left, e.clientY - r.top, 6)
      if (h?.d.type === 'text') this.editText(h.d)
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

  /**
   * Позиция по умолчанию: стоп — 10% дневного ATR, цель — вчетверо дальше, ширина ~15% видимых свечей.
   * Пока ATR неизвестен, цель ставится на ~12% высоты экрана от входа.
   */
  private newPosition(type: 'long' | 'short', entry: Pt, x: number): Drawing {
    const sign = type === 'long' ? 1 : -1
    const size = this.host.chart.paneSize(0)
    const atr = this.host.atr()
    let stopDist: number
    if (atr) stopDist = atr * STOP_ATR
    else {
      const top = this.host.series().coordinateToPrice(0) as number | null
      const bottom = this.host.series().coordinateToPrice(size.height) as number | null
      stopDist = (top != null && bottom != null ? Math.abs(top - bottom) * 0.12 : entry.p * 0.01) / DEFAULT_RR
    }
    const round = (v: number) => +v.toFixed(this.host.precision())
    const right = this.toPoint(x + Math.max(60, size.width * 0.15), 0, false)
    const t2 = Math.max(right?.t ?? 0, entry.t + this.host.tfSec())
    return this.newDrawing(type, [entry, { t: t2, p: round(entry.p + sign * stopDist * DEFAULT_RR) }, { t: entry.t, p: round(entry.p - sign * stopDist) }])
  }

  private toolDown(x: number, y: number) {
    const tool = app.tool
    if (tool === 'cursor') return
    const pt = this.toPoint(x, y, isPosition(tool) ? false : app.magnet)
    if (!pt) return
    this.measure = null
    if (this.draft) {
      // второй щелчок завершает фигуру
      this.draft.pts[1] = pt
      this.commit()
      return
    }
    if (tool === 'text') {
      // текст вводится в отдельном окне; рисунок появится после подтверждения
      app.tool = 'cursor'
      app.textEdit = { pane: this.host.paneIndex, id: null, pt, text: '' }
      return
    }
    if (tool === 'long' || tool === 'short') this.draft = this.newPosition(tool, pt, x)
    else this.draft = this.newDrawing(tool, isSingle(tool) ? [pt] : [pt, { ...pt }])
    this.downAt = { x, y }
    this.pressing = true
    this.redraw()
  }

  private toolMove(x: number, y: number, isMouse: boolean) {
    const pt = this.toPoint(x, y, this.draft && isPosition(this.draft.type) ? false : app.magnet)
    if (!pt) return
    if (isMouse) this.syncCrosshair(pt)
    const d = this.draft
    if (!d) return
    if (isPosition(d.type)) {
      // протяжка задаёт цель и правый край; стоп — вчетверо ближе цели
      if (this.pressing && Math.hypot(x - this.downAt.x, y - this.downAt.y) > 8) {
        const sign = d.type === 'long' ? 1 : -1
        const round = (v: number) => +v.toFixed(this.host.precision())
        const dist = Math.max(Math.abs(pt.p - d.pts[0].p), 1 / 10 ** this.host.precision())
        d.pts[1] = { t: Math.max(pt.t, d.pts[0].t + this.host.tfSec()), p: round(d.pts[0].p + sign * dist) }
        d.pts[2].p = round(d.pts[0].p - (sign * dist) / DEFAULT_RR)
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

  private idleDown(x: number, y: number, tol: number, shift: boolean, ctrl: boolean) {
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
    const orig = this.geometry(h.d, size.width, size.height)?.sp ?? h.d.pts.map(() => ({ x, y }))
    // с зажатым Ctrl тянется копия: оригинал остаётся на месте
    this.drag = { d: h.d, handle: ctrl ? -1 : h.handle, start: { x, y }, orig, moved: false, copy: ctrl }
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
      if (g.copy) {
        const clone: Drawing = { ...JSON.parse(JSON.stringify(g.d)), id: uid() }
        this.list.push(clone)
        g.d = this.list[this.list.length - 1]
        selection.value = { pane: this.host.paneIndex, id: clone.id }
      }
    }
    const magnet = isPosition(g.d.type) ? false : app.magnet
    if (g.d.pin) {
      // закреплённый текст двигается по экрану, а не по времени и цене
      const size = this.host.chart.paneSize(0)
      const clamp = (v: number) => Math.min(0.97, Math.max(0, v))
      g.d.pin = { x: clamp((g.orig[0].x + dx) / size.width), y: clamp((g.orig[0].y + dy) / size.height) }
    } else if (g.handle >= 0) {
      const pt = this.toPoint(x, y, magnet)
      if (pt) {
        if (isPosition(g.d.type)) movePositionHandle(g.d, g.handle, pt, 1 / 10 ** this.host.precision(), this.host.tfSec())
        else g.d.pts[g.handle] = pt
      }
    } else if (g.d.type === 'hline' || g.d.type === 'hray') {
      // уровень тянут за любое место: магнит ищет цены той свечи, что под курсором,
      // а не той, где когда-то поставили точку линии (она может быть далеко за экраном)
      const snap = this.toPoint(x, g.orig[0].y + dy, magnet)
      const own = g.d.type === 'hray' ? this.toPoint(g.orig[0].x + dx, g.orig[0].y + dy, false) : null
      if (snap) g.d.pts[0] = { t: own?.t ?? g.d.pts[0].t, p: snap.p }
    } else {
      g.orig.forEach((o, i) => {
        const pt = this.toPoint(o.x + dx, o.y + dy, magnet)
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

  setVisibility(vis: Visibility) {
    const d = this.selected()
    if (!d) return
    checkpoint()
    d.vis = vis
    this.redraw()
  }

  /** Курсор над маркером: у позиции стоп и цель двигаются по вертикали, правый край — по горизонтали */
  private handleCursor(d: Drawing, handle: number): string {
    if (isPosition(d.type)) return handle === 0 ? 'move' : handle === 3 ? 'ew-resize' : 'ns-resize'
    if (d.type === 'hline' || d.type === 'hray') return 'ns-resize'
    if (d.type === 'vline') return 'ew-resize'
    return 'grab'
  }

  /** Сдвиг выбранного рисунка клавишами: на свечи по времени и на шаги цены по вертикали */
  nudge(bars: number, ticks: number): boolean {
    const d = this.selected()
    if (!d) return false
    checkpoint()
    const prec = this.host.precision()
    const tick = 1 / 10 ** prec
    // по времени рисунок встаёт на границу свечи: сдвиг с 17:12 влево даёт 17:10, а не 17:07
    const tf = this.host.tfSec()
    const t0 = d.pts[0]?.t ?? 0
    const snapped = bars > 0 ? Math.floor(t0 / tf) * tf + bars * tf : bars < 0 ? Math.ceil(t0 / tf) * tf + bars * tf : t0
    const dt = snapped - t0
    if (d.pin) {
      // закреплённый текст сдвигается по экрану: шаг — 4 пикселя
      const size = this.host.chart.paneSize(0)
      d.pin = { x: d.pin.x + (bars * 4) / size.width, y: d.pin.y - (ticks * 4) / size.height }
    } else d.pts = d.pts.map((p) => ({ t: p.t + dt, p: +(p.p + ticks * tick).toFixed(prec) }))
    this.redraw()
    return true
  }

  /** Вход, стоп и цель выбранной позиции числами. false — значения несовместимы */
  setPosition(entry: number, stop: number, target: number): boolean {
    const d = this.selected()
    if (!d || !isPosition(d.type)) return false
    const copy: Drawing = JSON.parse(JSON.stringify(d))
    if (!setPositionPrices(copy, entry, stop, target)) return false
    checkpoint()
    setPositionPrices(d, entry, stop, target)
    this.redraw()
    return true
  }

  /** Раскладывает цены из текста сделки по выбранной позиции. Недостающие значения остаются прежними */
  applySignal(sig: Signal): boolean {
    const d = this.selected()
    if (!d || !isPosition(d.type)) return false
    return this.setPosition(sig.entry ?? d.pts[0].p, sig.stop ?? d.pts[2].p, sig.target ?? d.pts[1].p)
  }

  /** Текст для системного буфера при копировании: у позиции — её цены в формате сделки */
  copyText(): string {
    const d = this.selected()
    if (!d) return ''
    if (isPosition(d.type)) return formatSignal(this.host.symbol(), d.type as 'long' | 'short', d.pts[0].p, d.pts[2].p, d.pts[1].p, this.host.precision())
    return `tvx:${d.type}:${d.id}`
  }

  // ---------- текст ----------

  editText(d: Drawing) {
    app.textEdit = { pane: this.host.paneIndex, id: d.id, pt: null, text: d.text ?? '' }
  }

  /** Новый текст в точке графика */
  addText(pt: Pt, text: string): Drawing | null {
    if (!text.trim()) return null
    const d: Drawing = { ...this.newDrawing('text', [pt]), text, size: 12 }
    checkpoint()
    this.list.push(d)
    selection.value = { pane: this.host.paneIndex, id: d.id }
    this.redraw()
    return d
  }

  /** Меняет текст рисунка; пустой текст удаляет рисунок */
  setText(id: string, text: string) {
    const i = this.list.findIndex((d) => d.id === id)
    if (i < 0) return
    checkpoint()
    if (text.trim()) this.list[i].text = text
    else {
      this.list.splice(i, 1)
      if (this.selectedId.value === id) selection.value = null
    }
    this.redraw()
  }

  /** Закрепляет текст на экране или возвращает привязку к времени и цене — не сдвигая его с места */
  togglePin() {
    const d = this.selected()
    if (!d || d.type !== 'text') return
    const size = this.host.chart.paneSize(0)
    const at = this.geometry(d, size.width, size.height)?.sp[0]
    if (!at) return
    checkpoint()
    if (d.pin) {
      const pt = this.toPoint(at.x, at.y, false)
      if (pt) d.pts = [pt]
      delete d.pin
    } else d.pin = { x: at.x / size.width, y: at.y / size.height }
    this.redraw()
  }

  setTextStyle(patch: { size?: number; bg?: boolean; color?: string }) {
    const d = this.selected()
    if (!d) return
    checkpoint()
    Object.assign(d, patch)
    this.redraw()
  }

  /**
   * Заметка из чеклиста: одна на инструмент. Есть — обновляется на месте, нет — ставится
   * в левый верхний угол видимой части графика. Пустой текст убирает заметку.
   */
  upsertNote(text: string): boolean {
    const i = this.list.findIndex((d) => d.note)
    if (!text.trim()) {
      if (i < 0) return false
      checkpoint()
      this.list.splice(i, 1)
      this.redraw()
      return true
    }
    checkpoint()
    if (i >= 0) this.list[i].text = text
    else {
      // заметка закреплена в левом верхнем углу окна, под легендой
      const size = this.host.chart.paneSize(0)
      const legend = this.host.el.parentElement?.querySelector<HTMLElement>('.legend')
      const top = (legend?.offsetHeight ?? 56) + 14
      const pt = this.toPoint(14, top, false) ?? { t: 0, p: 0 }
      this.list.push({
        ...this.newDrawing('text', [pt]),
        text,
        size: 12,
        bg: true,
        note: true,
        vis: 'intraday',
        pin: { x: 14 / Math.max(size.width, 200), y: Math.min(0.6, top / Math.max(size.height, 200)) },
      })
    }
    this.redraw()
    return true
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
    clipboard.text = this.copyText()
    return true
  }

  /** Вставляет скопированный рисунок со сдвигом на несколько свечей вправо */
  paste(): boolean {
    const src = clipboard.item
    if (!src) return false
    const shift = this.host.tfSec() * 3
    const d: Drawing = { ...JSON.parse(JSON.stringify(src)), id: uid() }
    d.pts = d.pts.map((p) => ({ t: p.t + shift, p: p.p }))
    if (d.pin) d.pin = { x: d.pin.x + 0.02, y: d.pin.y + 0.04 }
    // копия заметки чеклиста — обычный текст: заметка у инструмента одна
    delete d.note
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
      if (!this.shown(d)) continue
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
        case 'text': {
          const b = this.textBoxes.get(d.id)
          ok = !!b && x >= b.x - tol && x <= b.x + b.w + tol && y >= b.y - tol && y <= b.y + b.h + tol
          break
        }
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
        if (!this.shown(d)) continue
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
        if (d.text) label(d.text, 8, y - 3)
        break
      }
      case 'hray': {
        const y = crisp(sp[0].y)
        line({ x: sp[0].x, y }, { x: w, y })
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
        break
      }
      case 'text': {
        // точка привязки — левый верхний угол текста
        const size = d.size ?? 12
        const lines = (d.text ?? '').split('\n')
        const lh = Math.round(size * 1.35)
        ctx.font = `${size}px -apple-system, "Segoe UI", Roboto, sans-serif`
        const tw = Math.max(...lines.map((l) => ctx.measureText(l).width), 8)
        const box = { x: sp[0].x - 5, y: sp[0].y - 4, w: tw + 10, h: lines.length * lh + 7 }
        this.textBoxes.set(d.id, box)
        ctx.setLineDash([])
        if (d.bg) {
          ctx.fillStyle = withAlpha(c.bg, 0.88)
          ctx.beginPath()
          ctx.roundRect(box.x, box.y, box.w, box.h, 4)
          ctx.fill()
          ctx.strokeStyle = withAlpha(d.color, 0.5)
          ctx.lineWidth = 1
          ctx.stroke()
        }
        if (hover || handles) {
          ctx.strokeStyle = d.color
          ctx.lineWidth = 1
          ctx.setLineDash([3, 3])
          ctx.strokeRect(box.x + 0.5, box.y + 0.5, box.w - 1, box.h - 1)
          ctx.setLineDash([])
        }
        ctx.fillStyle = d.color
        ctx.textAlign = 'left'
        ctx.textBaseline = 'top'
        lines.forEach((l, i) => ctx.fillText(l, sp[0].x, sp[0].y + i * lh))
        ctx.font = FONT
        // маркеры тексту не нужны: его рамка и так показывает выделение
        return [{ x: box.x, y: box.y }]
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
        // Ход сделки: яркая область от входа до текущей цены (или до закрытия по стопу/цели)
        // и пунктир от точки входа к этой цене — видно, где сделка сейчас и чем закончилась.
        const bars = this.host.bars()
        const st = evaluatePosition(d, bars)
        if (st.status !== 'pending') {
          const xe = this.xOf(st.exitTime)
          const ye = this.host.series().priceToCoordinate(st.exitPrice)
          if (xe != null && ye != null && xe > x1) {
            const col = (d.type === 'long' ? st.exitPrice >= entry : st.exitPrice <= entry) ? c.up : c.down
            ctx.fillStyle = withAlpha(col, 0.32)
            ctx.fillRect(x1, Math.min(yE, ye), xe - x1, Math.abs(ye - yE))
            ctx.strokeStyle = col
            ctx.lineWidth = 1
            ctx.setLineDash([4, 3])
            line({ x: x1, y: yE }, { x: xe, y: ye })
            ctx.setLineDash([])
          }
        }
        ctx.strokeStyle = c.text
        ctx.lineWidth = 1
        line({ x: x1, y: Math.round(yE) + 0.5 }, { x: x2, y: Math.round(yE) + 0.5 })
        // на мелком масштабе (другой интервал) подписи слиплись бы — показываем их только у выбранной позиции
        if (!hover && !handles && (Math.abs(yT - yS) < 70 || x2 - x1 < 90)) break
        const pct = (v: number) => fmtPct(entry ? ((v - entry) / entry) * 100 : 0)
        const result = st.status === 'open' ? ` · сейчас ${fmtR(st.r)}` : st.status === 'tp' ? ` · тейк ${fmtR(st.r)}` : st.status === 'sl' ? ' · стоп -1R' : ''
        const texts = [
          `Цель ${fmtPrice(target, prec)} (${pct(target)})`,
          `Стоп ${fmtPrice(stop, prec)} (${pct(stop)})`,
          `${d.type === 'long' ? 'Лонг' : 'Шорт'} ${fmtPrice(entry, prec)} · R/R ${riskReward(d).toFixed(2)}${result}`,
        ]
        // узкая позиция: подписи не помещаются между маркерами — выносим их вправо от неё
        const outside = x2 - x1 < Math.max(...texts.map((t) => ctx.measureText(t).width)) + 40
        const x = outside ? x2 + 10 : (x1 + x2) / 2
        const up = d.type === 'long' ? -1 : 1
        // позиция не в фокусе — подписи приглушены, чтобы не закрывать свечи
        ctx.globalAlpha = handles ? 1 : hover ? 0.9 : 0.65
        this.tag(ctx, [texts[0]], x, yT + up * 13, c.up, w, h, outside)
        this.tag(ctx, [texts[1]], x, yS - up * 13, c.down, w, h, outside)
        this.tag(ctx, [texts[2]], x, yE, c.muted, w, h, outside)
        ctx.globalAlpha = 1
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
