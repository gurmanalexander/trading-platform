import {
  AreaSeries,
  BarSeries,
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  PriceScaleMode,
  createChart,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type MouseEventParams,
  type SeriesType,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts'
import { reactive, shallowRef } from 'vue'
import { EXCHANGE_NAMES, symbolKey, type Bar, type SymbolRef } from '../types'
import { adapters } from '../exchanges'
import { getTf, type Timeframe } from '../lib/timeframes'
import { setPrecision } from '../lib/format'
import { indicatorDef, resolveParams, toSource, type IndicatorDef, type IndicatorInstance } from '../lib/indicators'
import { app, paneCount, theme, type ChartType, type PaneState } from '../stores/app'
import { crosshairBus, dateFocus, timeBus } from '../stores/sync'
import { focusFraction } from '../lib/setup'
import { dayStats } from '../stores/atr'
import { clearView, getView, setView, viewKey, type ChartView } from '../stores/views'
import { chartColors, withAlpha, type ChartColors } from './theme'
import { DrawingsLayer } from './drawings'
import { heikinAshi, heikinBar, lowerBound } from './bars'

export interface Legend {
  o: number
  h: number
  l: number
  c: number
  v: number
  chg: number
  chgPct: number
  up: boolean
  /** значения индикаторов по id экземпляра */
  ind: Record<string, number[]>
}

interface IndRuntime {
  inst: IndicatorInstance
  def: IndicatorDef
  params: Record<string, number>
  colors: string[]
  series: ISeriesApi<SeriesType>[]
  out: Float64Array[]
}

const INITIAL_BARS = 1000
const MAX_BARS = 30_000
const LOCAL_TZ_SEC = -new Date().getTimezoneOffset() * 60
const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif'

const isOhlc = (t: ChartType) => t !== 'line' && t !== 'area'

/** Сохраняет холст как PNG с отметкой времени в имени файла */
/** Имя файла снимка: «HANAUSDT.P_2026-11-12_09-41-03» — тикер (у бессрочных фьючерсов с «.P»), дата и местное время */
export function snapshotName(ref: SymbolRef, at = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const date = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`
  const time = `${pad(at.getHours())}-${pad(at.getMinutes())}-${pad(at.getSeconds())}`
  return `${ref.symbol}${ref.market === 'futures' ? '.P' : ''}_${date}_${time}`
}

export function downloadCanvas(canvas: HTMLCanvasElement, name: string) {
  canvas.toBlob((blob) => {
    if (!blob) return
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${name}.png`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 5000)
  })
}

export class ChartController {
  readonly chart: IChartApi
  readonly ui = reactive({
    loading: false,
    error: '',
    scrolledBack: false,
    lastTime: 0,
    precision: 2,
    /** верхняя граница каждой панели графика, px — чтобы подписи индикаторов стояли в своих панелях */
    paneTops: [0] as number[],
    /** id индикатора -> номер его панели (только для индикаторов в отдельных панелях) */
    indPane: {} as Record<string, number>,
  })
  readonly legend = shallowRef<Legend | null>(null)
  readonly draw: DrawingsLayer

  bars: Bar[] = []
  precision = 2
  tf: Timeframe

  private main!: ISeriesApi<SeriesType>
  /** То, что показывает основная серия: сами свечи либо Хейкен Аши */
  private shown: Bar[] = []
  private tz = 0
  private inds: IndRuntime[] = []
  private token = 0
  private offLive: (() => void) | null = null
  private loadingMore = false
  private refreshing = false
  private noMore = false
  private hoverIdx = -1
  private legendRaf = 0
  private colors: ChartColors
  private alertLines: IPriceLine[] = []
  private alertPrices: number[] = []
  private hiddenAt = 0
  private disposed = false
  private resizeObs: ResizeObserver
  /** указатель пользователя сейчас над этой панелью — она источник синхронизации */
  private pointerInside = false
  /** индекс свечи, на которой стоит перекрестие, пришедшее из другой панели; -1 — нет */
  private syncIdx = -1
  /** время, к которому панель привязана синхронизацией, пока догружается история */
  private pendingSyncTime: number | null = null
  /** номер последней выполненной просьбы «показать дату» */
  private focusDone = 0
  /** инструмент, чьи свечи сейчас загружены (в настройках окна он может быть уже другим) */
  private loadedKey = ''
  /** вид графика в момент нажатия — чтобы понять, двигал ли его пользователь */
  private viewAtPress = ''
  private saveViewTimer = 0

  constructor(
    private host: HTMLElement,
    private pane: PaneState,
    private paneIndex: number,
  ) {
    const el = host
    this.tf = getTf(pane.tf)
    this.colors = chartColors(theme.value)
    const c = this.colors
    this.chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: c.bg },
        textColor: c.text,
        fontSize: 11,
        fontFamily: FONT,
        panes: { separatorColor: c.border, separatorHoverColor: withAlpha(c.accent, 0.25), enableResize: true },
      },
      grid: { vertLines: { color: c.grid }, horzLines: { color: c.grid } },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: c.cross, labelBackgroundColor: c.crossLabel, style: LineStyle.Dashed, width: 1 },
        horzLine: { color: c.cross, labelBackgroundColor: c.crossLabel, style: LineStyle.Dashed, width: 1 },
      },
      rightPriceScale: { borderColor: c.border },
      timeScale: { borderColor: c.border, timeVisible: true, secondsVisible: false, rightOffset: 6, barSpacing: 8, minBarSpacing: 0.8 },
      localization: { locale: 'ru-RU' },
      kineticScroll: { touch: true, mouse: false },
    })

    this.draw = new DrawingsLayer({
      chart: this.chart,
      el,
      paneIndex,
      series: () => this.main,
      bars: () => this.bars,
      tfSec: () => this.tf.sec,
      tz: () => this.tz,
      precision: () => this.precision,
      symbol: () => this.pane.symbol.symbol,
      atr: () => dayStats[symbolKey(this.pane.symbol)]?.atr,
      colors: () => this.colors,
      timeToLogical: (t) => this.timeToLogical(t),
      logicalToTime: (l) => this.logicalToTime(l),
    })

    this.createMain()
    this.applyScale()
    this.syncIndicators()

    this.chart.subscribeCrosshairMove(this.onCrosshair)
    this.chart.timeScale().subscribeVisibleLogicalRangeChange(this.onRange)
    document.addEventListener('visibilitychange', this.onVisibility)
    this.resizeObs = new ResizeObserver(() => requestAnimationFrame(() => this.onResize()))
    this.resizeObs.observe(el)
    // capture: колесо над ценовой шкалой перехватываем раньше, чем библиотека начнёт масштабировать время
    el.addEventListener('wheel', this.onWheel, { capture: true, passive: false })
    el.addEventListener('pointerenter', this.onPointerIn)
    el.addEventListener('pointerdown', this.onPointerIn)
    el.addEventListener('pointerleave', this.onPointerOut)
    el.addEventListener('pointerdown', this.onPress)
    window.addEventListener('pointerup', this.onRelease)
  }

  // ---------- запоминание вида ----------

  private viewSignature(): string {
    const r = this.chart.timeScale().getVisibleLogicalRange()
    const scale = this.chart.priceScale('right', 0)
    const p = scale.options().autoScale ? null : scale.getVisibleRange()
    return JSON.stringify([r && [Math.round(r.from * 10), Math.round(r.to * 10)], p && [p.from, p.to]])
  }

  private onPress = () => {
    this.viewAtPress = this.viewSignature()
  }

  private onRelease = () => {
    if (!this.viewAtPress) return
    const before = this.viewAtPress
    this.viewAtPress = ''
    // после отпускания график ещё доезжает по инерции — сравниваем чуть позже
    setTimeout(() => {
      if (!this.disposed && this.viewSignature() !== before) this.scheduleSaveView()
    }, 60)
  }

  /** Вид меняли руками (мышь, палец, колесо, клавиши) — запоминаем его для этой монеты и интервала */
  private scheduleSaveView() {
    clearTimeout(this.saveViewTimer)
    const token = this.token
    this.saveViewTimer = window.setTimeout(() => {
      this.saveViewTimer = 0
      if (this.disposed || token !== this.token || !this.bars.length || this.ui.loading) return
      const ts = this.chart.timeScale()
      const r = ts.getVisibleLogicalRange()
      if (!r) return
      const scale = this.chart.priceScale('right', 0)
      const range = scale.options().autoScale ? null : scale.getVisibleRange()
      const offset = ts.scrollPosition()
      setView(viewKey(symbolKey(this.pane.symbol), this.tf.id), {
        spacing: ts.options().barSpacing,
        realtime: offset > -3,
        offset,
        center: this.logicalToTime((r.from + r.to) / 2),
        price: range ? { from: range.from, to: range.to } : null,
        at: Date.now(),
      })
    }, 500)
  }

  private async restoreView(v: ChartView) {
    const token = this.token
    const ts = this.chart.timeScale()
    ts.applyOptions({ barSpacing: v.spacing })
    if (v.realtime) ts.scrollToPosition(v.offset, false)
    else await this.goToTime(v.center, v.spacing)
    if (token !== this.token || !v.price) return
    // если цена с тех пор ушла за сохранённый диапазон, оставляем автомасштаб — иначе её не будет видно
    const last = this.bars[this.bars.length - 1]?.close
    if (v.realtime && last !== undefined && (last < v.price.from || last > v.price.to)) return
    requestAnimationFrame(() => {
      if (token !== this.token) return
      const scale = this.chart.priceScale('right', 0)
      scale.setAutoScale(false)
      scale.setVisibleRange(v.price!)
    })
  }

  private onPointerIn = () => {
    this.pointerInside = true
    this.pendingSyncTime = null
  }

  private onPointerOut = () => {
    this.pointerInside = false
    if (crosshairBus.value?.pane === this.paneIndex) crosshairBus.value = null
  }

  /** Колесо мыши над ценовой шкалой сжимает и растягивает график по вертикали */
  private onWheel = (e: WheelEvent) => {
    const r = this.host.getBoundingClientRect()
    const x = e.clientX - r.left
    const y = e.clientY - r.top
    if (x <= this.chart.paneSize(0).width) {
      // над графиком колесо масштабирует время — это делает сама библиотека, нам остаётся запомнить вид
      this.scheduleSaveView()
      return
    }
    const tops = this.ui.paneTops
    let idx = -1
    for (let i = 0; i < tops.length; i++) if (y >= tops[i] && y < tops[i] + this.chart.paneSize(i).height) idx = i
    if (idx < 0) return
    e.preventDefault()
    e.stopPropagation()
    const scale = this.chart.priceScale('right', idx)
    const range = scale.getVisibleRange()
    if (!range || !(range.to > range.from)) return
    const k = Math.exp(Math.sign(e.deltaY) * Math.min(Math.abs(e.deltaY), 120) * 0.0018)
    let from: number
    let to: number
    if (idx === 0 && this.pane.scale === 'log' && range.from > 0) {
      const a = Math.log(range.from)
      const b = Math.log(range.to)
      from = Math.exp((a + b) / 2 - ((b - a) / 2) * k)
      to = Math.exp((a + b) / 2 + ((b - a) / 2) * k)
    } else {
      const c = (range.from + range.to) / 2
      const h = ((range.to - range.from) / 2) * k
      from = c - h
      to = c + h
    }
    scale.setAutoScale(false)
    scale.setVisibleRange({ from, to })
    if (idx === 0) this.scheduleSaveView()
  }

  private onResize() {
    if (this.disposed) return
    this.measurePanes()
    this.draw.layoutOverlay()
  }

  private measurePanes() {
    const n = this.chart.panes().length
    const tops: number[] = []
    let top = 0
    for (let i = 0; i < n; i++) {
      tops.push(top)
      top += this.chart.paneSize(i).height + 1
    }
    const cur = this.ui.paneTops
    if (cur.length !== n || tops.some((t, i) => t !== cur[i])) this.ui.paneTops = tops
  }

  destroy() {
    this.disposed = true
    this.resizeObs.disconnect()
    this.host.removeEventListener('wheel', this.onWheel, { capture: true })
    this.host.removeEventListener('pointerenter', this.onPointerIn)
    this.host.removeEventListener('pointerdown', this.onPointerIn)
    this.host.removeEventListener('pointerleave', this.onPointerOut)
    this.host.removeEventListener('pointerdown', this.onPress)
    window.removeEventListener('pointerup', this.onRelease)
    clearTimeout(this.saveViewTimer)
    if (crosshairBus.value?.pane === this.paneIndex) crosshairBus.value = null
    this.token++
    this.stopLive()
    cancelAnimationFrame(this.legendRaf)
    document.removeEventListener('visibilitychange', this.onVisibility)
    this.draw.destroy()
    this.chart.remove()
  }

  // ---------- данные ----------

  async load() {
    const token = ++this.token
    this.stopLive()
    const { symbol } = this.pane
    this.tf = getTf(this.pane.tf)
    // Внутридневные свечи показываем в местном времени; дневные и старше — по датам биржи (UTC)
    this.tz = this.tf.sec >= 86400 ? 0 : LOCAL_TZ_SEC
    this.bars = []
    this.loadedKey = ''
    this.shown = []
    this.noMore = false
    this.loadingMore = false
    this.hoverIdx = -1
    this.syncIdx = -1
    this.pendingSyncTime = null
    this.setAll()
    this.ui.loading = true
    this.ui.error = ''
    const adapter = adapters[symbol.exchange]
    try {
      const res = await adapter.fetchKlines(symbol.market, symbol.symbol, this.tf, INITIAL_BARS)
      if (token !== this.token) return
      if (!res.bars.length) throw new Error('Нет данных по инструменту')
      this.bars = res.bars
      this.loadedKey = symbolKey(symbol)
      this.setPrecision(res.precision)
      this.rebuildShown()
      this.setAll()
      this.chart.priceScale('right').applyOptions({ autoScale: true })
      this.chart.timeScale().scrollToPosition(6, false)
      this.ui.loading = false
      // просьба показать дату важнее запомненного вида
      const saved = getView(viewKey(symbolKey(symbol), this.tf.id))
      if (!this.applyDateFocus() && saved) this.restoreView(saved)
      this.offLive = adapter.subscribeKline(
        symbol.market,
        symbol.symbol,
        this.tf,
        (bar) => token === this.token && this.onBar(bar),
        () => token === this.token && this.refreshTail(),
      )
    } catch (e) {
      if (token === this.token) this.ui.error = e instanceof Error ? e.message : 'Не удалось загрузить данные'
    } finally {
      if (token === this.token) this.ui.loading = false
    }
  }

  private stopLive() {
    this.offLive?.()
    this.offLive = null
  }

  private setPrecision(p: number) {
    p = Math.min(12, Math.max(0, p))
    if (p === this.precision && this.bars.length) {
      setPrecision(symbolKey(this.pane.symbol), p)
      return
    }
    this.precision = p
    this.ui.precision = p
    setPrecision(symbolKey(this.pane.symbol), p)
    this.main.applyOptions({ priceFormat: { type: 'price', precision: p, minMove: 1 / 10 ** p } })
  }

  private rebuildShown() {
    this.shown = this.pane.chartType === 'heikin' ? heikinAshi(this.bars) : this.bars
  }

  private point(b: Bar) {
    const time = (b.time + this.tz) as UTCTimestamp
    return isOhlc(this.pane.chartType)
      ? { time, open: b.open, high: b.high, low: b.low, close: b.close }
      : { time, value: b.close }
  }

  /** Полная перезаливка данных во все серии */
  private setAll() {
    this.main.setData(this.shown.map((b) => this.point(b)))
    this.computeIndicators(true)
    const n = this.bars.length
    this.ui.lastTime = n ? this.bars[n - 1].time : 0
    this.updateLegend()
    this.draw.redraw()
  }

  private onBar(bar: Bar) {
    const bars = this.bars
    const n = bars.length
    if (!n) return
    const last = bars[n - 1]
    if (bar.time < last.time) return
    const isNew = bar.time > last.time
    if (isNew && bar.time - last.time > this.tf.sec * 1.5 && this.tf.id !== '1M') {
      // пропущены свечи (соединение рвалось) — дозагружаем хвост целиком
      this.refreshTail()
      return
    }
    if (isNew) bars.push(bar)
    else bars[n - 1] = bar
    if (this.pane.chartType === 'heikin') {
      const m = bars.length
      const ha = heikinBar(bar, m > 1 ? this.shown[m - 2] : null)
      if (isNew) this.shown.push(ha)
      else this.shown[m - 1] = ha
    }
    this.main.update(this.point(this.shown[this.shown.length - 1]))
    this.computeIndicators(false)
    if (isNew) this.ui.lastTime = bar.time
    if (this.hoverIdx < 0 || this.hoverIdx >= bars.length - 1) this.scheduleLegend()
  }

  /** Подтягивает последнюю цену из тикера: он обновляется чаще, чем поток свечей */
  patchLast(price: number) {
    const n = this.bars.length
    if (!n || this.ui.loading || !(price > 0)) return
    const last = this.bars[n - 1]
    if (price === last.close) return
    // тикер уже относится к следующей свече — её пришлёт поток свечей
    if (this.tf.id === '1M' || Date.now() / 1000 >= last.time + this.tf.sec) return
    this.onBar({ ...last, close: price, high: Math.max(last.high, price), low: Math.min(last.low, price) })
  }

  /** Перечитывает последние свечи и сшивает с уже загруженными (после обрыва связи или сна вкладки) */
  private async refreshTail() {
    if (this.refreshing || !this.bars.length || this.ui.loading) return
    this.refreshing = true
    const token = this.token
    const { symbol } = this.pane
    try {
      const res = await adapters[symbol.exchange].fetchKlines(symbol.market, symbol.symbol, this.tf, 500)
      if (token !== this.token || !res.bars.length) return
      const fresh = res.bars
      const old = this.bars
      if (fresh[0].time > old[old.length - 1].time + this.tf.sec) {
        // разрыв больше загруженного окна — начинаем историю заново
        this.bars = fresh
        this.noMore = false
      } else {
        this.bars = old.slice(0, lowerBound(old, fresh[0].time)).concat(fresh)
      }
      this.rebuildShown()
      this.setAll()
    } catch {
      /* попробуем при следующем событии */
    } finally {
      this.refreshing = false
    }
  }

  /** Догружает более старую историю, когда пользователь докрутил до левого края */
  private async loadMore(): Promise<boolean> {
    if (this.loadingMore || this.noMore || this.ui.loading || !this.bars.length) return false
    if (this.bars.length >= MAX_BARS) {
      this.noMore = true
      return false
    }
    this.loadingMore = true
    const token = this.token
    const { symbol } = this.pane
    try {
      const first = this.bars[0].time
      const res = await adapters[symbol.exchange].fetchKlines(symbol.market, symbol.symbol, this.tf, 1000, first * 1000)
      if (token !== this.token) return false
      const older = res.bars.filter((b) => b.time < first)
      if (!older.length) {
        this.noMore = true
        return false
      }
      this.bars = older.concat(this.bars)
      if (res.precision > this.precision) this.setPrecision(res.precision)
      this.rebuildShown()
      this.setAll()
      // синхронизация времени просила момент, которого ещё не было в загруженной истории
      if (this.pendingSyncTime !== null) this.centerOn(this.pendingSyncTime)
      return true
    } catch {
      /* повторим при следующей прокрутке */
      return false
    } finally {
      if (token === this.token) {
        this.loadingMore = false
        // если после догрузки левый край всё ещё на экране (сильно отдалили) — грузим дальше
        const r = this.chart.timeScale().getVisibleLogicalRange()
        if (r && r.from < 10 && !this.noMore) setTimeout(() => this.loadMore(), 150)
      }
    }
  }

  private onRange = () => {
    const ts = this.chart.timeScale()
    const r = ts.getVisibleLogicalRange()
    if (r && r.from < 20) this.loadMore()
    const back = ts.scrollPosition() < -3
    if (back !== this.ui.scrolledBack) this.ui.scrolledBack = back
    // график ещё доезжает по инерции после жеста — запомним вид, когда он остановится
    if (this.saveViewTimer && this.pointerInside) this.scheduleSaveView()
    this.draw.layoutOverlay()
    if (r && this.pointerInside && app.sync.time && paneCount.value > 1 && this.bars.length) {
      timeBus.value = { pane: this.paneIndex, time: this.logicalToTime((r.from + r.to) / 2), realtime: !back }
    }
  }

  private onVisibility = () => {
    if (document.visibilityState === 'hidden') {
      this.hiddenAt = Date.now()
    } else if (this.hiddenAt && Date.now() - this.hiddenAt > 20_000) {
      // вкладка спала — за это время могли пропустить свечи
      this.refreshTail()
    }
  }

  // ---------- время <-> индекс ----------

  timeToLogical(t: number): number | null {
    const b = this.bars
    const n = b.length
    if (!n) return null
    const sec = this.tf.sec
    if (t >= b[n - 1].time) return n - 1 + (t - b[n - 1].time) / sec
    if (t <= b[0].time) return (t - b[0].time) / sec
    const i = lowerBound(b, t)
    if (b[i].time === t) return i
    const t0 = b[i - 1].time
    return i - 1 + (t - t0) / (b[i].time - t0)
  }

  logicalToTime(l: number): number {
    const b = this.bars
    const n = b.length
    if (!n) return 0
    const i = Math.round(l)
    if (i >= n) return b[n - 1].time + (i - (n - 1)) * this.tf.sec
    if (i < 0) return b[0].time + i * this.tf.sec
    return b[i].time
  }

  /** Вертикальная координата цены в области графика; null — цена за пределами данных */
  yOf(price: number): number | null {
    return this.main.priceToCoordinate(price) as number | null
  }

  /** Цена под вертикальной координатой области цены */
  priceAt(y: number): number | null {
    if (y > this.chart.paneSize(0).height) return null
    return this.main.coordinateToPrice(y) as number | null
  }

  // ---------- основная серия ----------

  private createMain() {
    const c = this.colors
    const type = this.pane.chartType
    const common = {
      priceFormat: { type: 'price' as const, precision: this.precision, minMove: 1 / 10 ** this.precision },
      priceLineColor: c.muted,
    }
    let s: ISeriesApi<SeriesType>
    if (type === 'line') {
      s = this.chart.addSeries(LineSeries, { ...common, color: c.line, lineWidth: 2 }, 0)
    } else if (type === 'area') {
      s = this.chart.addSeries(
        AreaSeries,
        { ...common, lineColor: c.line, lineWidth: 2, topColor: withAlpha(c.line, 0.35), bottomColor: withAlpha(c.line, 0.02) },
        0,
      )
    } else if (type === 'bars') {
      s = this.chart.addSeries(BarSeries, { ...common, upColor: c.up, downColor: c.down, thinBars: false }, 0)
    } else {
      s = this.chart.addSeries(
        CandlestickSeries,
        {
          ...common,
          upColor: type === 'hollow' ? 'rgba(0,0,0,0)' : c.up,
          downColor: c.down,
          borderVisible: type === 'hollow',
          borderUpColor: c.up,
          borderDownColor: c.down,
          wickUpColor: c.up,
          wickDownColor: c.down,
        },
        0,
      )
    }
    this.main = s
    this.draw.attach(s)
    this.alertLines = []
    this.setAlertLines(this.alertPrices)
  }

  /** Смена вида графика: основная серия создаётся заново, индикаторы — поверх неё */
  setChartType() {
    this.removeIndicatorSeries()
    this.chart.removeSeries(this.main)
    this.createMain()
    this.rebuildShown()
    this.main.setData(this.shown.map((b) => this.point(b)))
    this.syncIndicators()
  }

  applyScale() {
    const mode =
      this.pane.scale === 'log' ? PriceScaleMode.Logarithmic : this.pane.scale === 'percent' ? PriceScaleMode.Percentage : PriceScaleMode.Normal
    this.chart.priceScale('right').applyOptions({ mode, invertScale: this.pane.invert })
  }

  /** Сдвиг графика на n свечей (отрицательное — в прошлое) */
  scrollBars(n: number) {
    const ts = this.chart.timeScale()
    ts.scrollToPosition(ts.scrollPosition() + n, false)
    this.scheduleSaveView()
  }

  zoomBy(factor: number) {
    const ts = this.chart.timeScale()
    ts.applyOptions({ barSpacing: Math.min(60, Math.max(0.8, ts.options().barSpacing * factor)) })
    this.scheduleSaveView()
  }

  /**
   * Ставит момент t в центр экрана, не меняя масштаб. spacing — ширина свечи, если её только что
   * задали: на свежесозданном графике библиотека сообщает новое значение не сразу.
   * frac — где на экране окажется момент t: 0 — левый край, 0.5 — середина, 1 — правый край.
   */
  private centerOn(t: number, spacing?: number, frac = 0.5) {
    const ts = this.chart.timeScale()
    const l = this.timeToLogical(t)
    if (l == null) return
    // позиция прокрутки — на сколько свечей правый край экрана правее последней свечи
    const visibleBars = ts.width() / (spacing ?? ts.options().barSpacing)
    ts.scrollToPosition(l + visibleBars * (1 - frac) - (this.bars.length - 1), false)
  }

  /**
   * Показывает дату из вставленного сетапа или ссылки. Место даты на экране зависит от интервала:
   * на дневке — в правой трети, на часовике — посередине, на младших — в левой трети.
   */
  private applyDateFocus() {
    const f = dateFocus.value
    if (!f || f.id === this.focusDone || Date.now() - f.at > 120_000) return false
    // данные должны быть именно этой монеты: при смене инструмента старые свечи ещё на месте
    if (f.key !== this.loadedKey || !this.bars.length || this.ui.loading) return false
    this.focusDone = f.id
    // дневные свечи идут по датам биржи (UTC), внутридневные показаны в местном времени
    const t = this.tf.sec >= 86400 ? Date.UTC(f.y, f.m - 1, f.d) / 1000 : new Date(f.y, f.m - 1, f.d).getTime() / 1000
    this.chart.priceScale('right').applyOptions({ autoScale: true })
    this.goToTime(t, undefined, focusFraction(this.tf.sec)).then(() => this.scheduleSaveView())
    return true
  }

  /** Вызывается, когда появилась новая просьба показать дату */
  onDateFocus() {
    this.applyDateFocus()
  }

  /** Показывает момент t (сек UTC) в центре графика, при необходимости догружая историю */
  async goToTime(t: number, spacing?: number, frac = 0.5) {
    const token = this.token
    for (let i = 0; i < 40 && this.bars.length && this.bars[0].time > t && !this.noMore; i++) {
      if (!(await this.loadMore()) || token !== this.token) break
    }
    if (token === this.token) this.centerOn(t, spacing, frac)
  }

  /** Момент в центре экрана, если график отмотан в прошлое; null — график у текущей цены */
  viewedTime(): number | null {
    const ts = this.chart.timeScale()
    const r = ts.getVisibleLogicalRange()
    if (!r || !this.bars.length || ts.scrollPosition() > -3) return null
    return this.logicalToTime((r.from + r.to) / 2)
  }

  /** Синхронизация времени: другая панель показывает момент t */
  syncToTime(t: number, realtime: boolean) {
    if (this.pointerInside || !this.bars.length) return
    if (realtime) {
      this.pendingSyncTime = null
      this.chart.timeScale().scrollToRealTime()
      return
    }
    this.pendingSyncTime = t < this.bars[0].time && !this.noMore ? t : null
    this.centerOn(t)
  }

  /** Перекрестие, пришедшее из другой панели. price = NaN — показать только момент времени */
  showSyncCrosshair(t: number, price: number) {
    const b = this.bars
    const n = b.length
    if (!n || this.pointerInside) return
    const i = lowerBound(b, t + 1) - 1
    if (i < 0 || t >= b[n - 1].time + this.tf.sec) {
      this.clearSyncCrosshair()
      return
    }
    this.syncIdx = i
    this.chart.setCrosshairPosition(price === price ? price : b[i].close, (b[i].time + this.tz) as UTCTimestamp, this.main)
    if (this.hoverIdx !== i) {
      this.hoverIdx = i
      this.scheduleLegend()
    }
  }

  clearSyncCrosshair() {
    if (this.syncIdx < 0) return
    this.syncIdx = -1
    this.chart.clearCrosshairPosition()
    this.hoverIdx = -1
    this.scheduleLegend()
  }

  /** Элемент окна графика — по нему общий снимок узнаёт, где окно стоит на экране */
  get element(): HTMLElement {
    return this.host
  }

  /** Картинка графика с подписью «монета · интервал · биржа» */
  capture(): HTMLCanvasElement | null {
    const src = this.chart.takeScreenshot(true)
    const out = document.createElement('canvas')
    out.width = src.width
    out.height = src.height
    const ctx = out.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(src, 0, 0)
    const k = src.width / Math.max(1, this.host.clientWidth)
    const s = this.pane.symbol
    ctx.font = `600 ${13 * k}px ${FONT}`
    ctx.fillStyle = this.colors.text
    ctx.textBaseline = 'top'
    ctx.fillText(`${s.symbol} · ${this.tf.label} · ${EXCHANGE_NAMES[s.exchange]}`, 8 * k, 8 * k)
    return out
  }

  /** Сохраняет снимок графика в PNG */
  screenshot() {
    const canvas = this.capture()
    if (canvas) downloadCanvas(canvas, snapshotName(this.pane.symbol))
  }

  /** Возврат к виду по умолчанию; запомненный для монеты вид забывается */
  resetView() {
    clearTimeout(this.saveViewTimer)
    clearView(viewKey(symbolKey(this.pane.symbol), this.tf.id))
    this.chart.priceScale('right').applyOptions({ autoScale: true })
    this.chart.timeScale().applyOptions({ barSpacing: 8 })
    this.chart.timeScale().scrollToPosition(6, false)
  }

  goRealtime() {
    this.chart.timeScale().scrollToRealTime()
    this.scheduleSaveView()
  }

  applyTheme() {
    this.colors = chartColors(theme.value)
    const c = this.colors
    this.chart.applyOptions({
      layout: {
        background: { type: ColorType.Solid, color: c.bg },
        textColor: c.text,
        panes: { separatorColor: c.border, separatorHoverColor: withAlpha(c.accent, 0.25) },
      },
      grid: { vertLines: { color: c.grid }, horzLines: { color: c.grid } },
      crosshair: {
        vertLine: { color: c.cross, labelBackgroundColor: c.crossLabel },
        horzLine: { color: c.cross, labelBackgroundColor: c.crossLabel },
      },
      rightPriceScale: { borderColor: c.border },
      timeScale: { borderColor: c.border },
    })
    this.setChartType()
  }

  setAlertLines(prices: number[]) {
    this.alertPrices = prices
    for (const l of this.alertLines) this.main.removePriceLine(l)
    this.alertLines = prices.map((price) =>
      this.main.createPriceLine({
        price,
        color: this.colors.alert,
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: '🔔 ⇅',
      }),
    )
  }

  // ---------- индикаторы ----------

  private removeIndicatorSeries() {
    for (const r of this.inds) for (const s of r.series) this.chart.removeSeries(s)
    this.inds = []
  }

  /** Пересобирает серии индикаторов по описанию в состоянии панели */
  syncIndicators() {
    this.removeIndicatorSeries()
    const c = this.colors
    let nextPane = 1
    let hasVolume = false
    const indPane: Record<string, number> = {}
    for (const inst of this.pane.indicators) {
      const def = indicatorDef(inst.type)
      if (!def || !inst.visible) continue
      const colors = def.plots.map((p, i) => inst.colors?.[i] ?? p.color)
      const series: ISeriesApi<SeriesType>[] = []
      if (def.type === 'vol') {
        hasVolume = true
        series.push(
          this.chart.addSeries(
            HistogramSeries,
            { priceScaleId: 'vol', priceFormat: { type: 'volume' }, lastValueVisible: false, priceLineVisible: false },
            0,
          ),
        )
        this.chart.priceScale('vol', 0).applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } })
      } else {
        const paneIdx = def.overlay ? 0 : nextPane++
        if (paneIdx) indPane[inst.id] = paneIdx
        const p = def.precision ?? this.precision
        const priceFormat = { type: 'price' as const, precision: p, minMove: 1 / 10 ** p }
        def.plots.forEach((plot, i) => {
          const base = { priceFormat, priceLineVisible: false, lastValueVisible: !def.overlay }
          series.push(
            plot.kind === 'hist'
              ? this.chart.addSeries(HistogramSeries, { ...base, lastValueVisible: false }, paneIdx)
              : this.chart.addSeries(LineSeries, { ...base, color: colors[i], lineWidth: 1, crosshairMarkerVisible: false }, paneIdx),
          )
        })
        const host = series[series.length - 1]
        for (const level of def.levels ?? []) {
          host.createPriceLine({ price: level, color: c.muted, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false })
        }
      }
      this.inds.push({ inst, def, params: resolveParams(def, inst), colors, series, out: [] })
    }
    this.chart.priceScale('right', 0).applyOptions({ scaleMargins: { top: 0.08, bottom: hasVolume ? 0.2 : 0.08 } })
    const panes = this.chart.panes()
    panes.forEach((p, i) => p.setStretchFactor(i === 0 ? Math.max(3, 5 - panes.length * 0.5) : 1))
    this.ui.indPane = indPane
    this.computeIndicators(true)
    this.updateLegend()
    // размеры панелей библиотека пересчитывает к следующему кадру
    requestAnimationFrame(() => this.onResize())
  }

  private computeIndicators(full: boolean) {
    if (!this.inds.length) return
    const bars = this.bars
    const n = bars.length
    const src = toSource(bars)
    const c = this.colors
    const upDim = withAlpha(c.up, 0.45)
    const downDim = withAlpha(c.down, 0.45)
    for (const r of this.inds) {
      r.out = r.def.calc(src, r.params)
      const isVol = r.def.type === 'vol'
      r.series.forEach((s, k) => {
        const arr = r.out[k]
        const hist = r.def.plots[k].kind === 'hist'
        const pt = (j: number) => {
          const time = (bars[j].time + this.tz) as UTCTimestamp
          if (!hist) return { time, value: arr[j] }
          const up = isVol ? bars[j].close >= bars[j].open : arr[j] >= 0
          return { time, value: arr[j], color: up ? upDim : downDim }
        }
        if (full) {
          const data = []
          for (let j = 0; j < n; j++) if (arr[j] === arr[j]) data.push(pt(j))
          s.setData(data)
        } else if (n && arr[n - 1] === arr[n - 1]) {
          s.update(pt(n - 1))
        }
      })
    }
  }

  // ---------- легенда ----------

  private onCrosshair = (param: MouseEventParams<Time>) => {
    // событие вызвано перекрестием из другой панели — оно уже учтено
    if (!this.pointerInside && this.syncIdx >= 0) return
    this.syncIdx = -1
    if (this.pointerInside && app.sync.crosshair && paneCount.value > 1) {
      if (param.time !== undefined && param.point) {
        const price = (param.paneIndex ?? 0) === 0 ? (this.main.coordinateToPrice(param.point.y) as number | null) : null
        crosshairBus.value = { pane: this.paneIndex, key: symbolKey(this.pane.symbol), time: (param.time as number) - this.tz, price: price ?? NaN }
      } else if (crosshairBus.value?.pane === this.paneIndex) {
        crosshairBus.value = null
      }
    }
    let idx = -1
    if (param.time !== undefined && param.point) {
      const t = (param.time as number) - this.tz
      const i = lowerBound(this.bars, t)
      if (i < this.bars.length && this.bars[i].time === t) idx = i
    }
    if (idx !== this.hoverIdx) {
      this.hoverIdx = idx
      this.scheduleLegend()
    }
    // границу панелей могли перетащить мышью — события об этом нет, сверяемся при движении курсора
    if (this.ui.paneTops.length > 1) this.measurePanes()
  }

  private scheduleLegend() {
    if (this.legendRaf || this.disposed) return
    this.legendRaf = requestAnimationFrame(() => {
      this.legendRaf = 0
      this.updateLegend()
    })
  }

  private updateLegend() {
    const n = this.bars.length
    if (!n) {
      this.legend.value = null
      return
    }
    const i = this.hoverIdx >= 0 && this.hoverIdx < n ? this.hoverIdx : n - 1
    const b = this.bars[i]
    const base = i > 0 ? this.bars[i - 1].close : b.open
    const chg = b.close - base
    const ind: Record<string, number[]> = {}
    for (const r of this.inds) ind[r.inst.id] = r.out.map((a) => a[i])
    this.legend.value = {
      o: b.open,
      h: b.high,
      l: b.low,
      c: b.close,
      v: b.volume,
      chg,
      chgPct: base ? (chg / base) * 100 : 0,
      up: b.close >= b.open,
      ind,
    }
  }
}
