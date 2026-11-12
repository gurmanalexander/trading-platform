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
import { symbolKey, type Bar } from '../types'
import { adapters } from '../exchanges'
import { getTf, type Timeframe } from '../lib/timeframes'
import { setPrecision } from '../lib/format'
import { indicatorDef, resolveParams, toSource, type IndicatorDef, type IndicatorInstance } from '../lib/indicators'
import { app, type ChartType, type PaneState } from '../stores/app'
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

  constructor(
    el: HTMLElement,
    private pane: PaneState,
    paneIndex: number,
  ) {
    this.tf = getTf(pane.tf)
    this.colors = chartColors(app.theme)
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
    this.shown = []
    this.noMore = false
    this.loadingMore = false
    this.hoverIdx = -1
    this.setAll()
    this.ui.loading = true
    this.ui.error = ''
    const adapter = adapters[symbol.exchange]
    try {
      const res = await adapter.fetchKlines(symbol.market, symbol.symbol, this.tf, INITIAL_BARS)
      if (token !== this.token) return
      if (!res.bars.length) throw new Error('Нет данных по инструменту')
      this.bars = res.bars
      this.setPrecision(res.precision)
      this.rebuildShown()
      this.setAll()
      this.chart.priceScale('right').applyOptions({ autoScale: true })
      this.chart.timeScale().scrollToPosition(6, false)
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
  private async loadMore() {
    if (this.loadingMore || this.noMore || this.ui.loading || !this.bars.length) return
    if (this.bars.length >= MAX_BARS) {
      this.noMore = true
      return
    }
    this.loadingMore = true
    const token = this.token
    const { symbol } = this.pane
    try {
      const first = this.bars[0].time
      const res = await adapters[symbol.exchange].fetchKlines(symbol.market, symbol.symbol, this.tf, 1000, first * 1000)
      if (token !== this.token) return
      const older = res.bars.filter((b) => b.time < first)
      if (!older.length) {
        this.noMore = true
        return
      }
      this.bars = older.concat(this.bars)
      if (res.precision > this.precision) this.setPrecision(res.precision)
      this.rebuildShown()
      this.setAll()
    } catch {
      /* повторим при следующей прокрутке */
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
    this.draw.layoutOverlay()
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
    this.chart.priceScale('right').applyOptions({ mode })
  }

  resetView() {
    this.chart.priceScale('right').applyOptions({ autoScale: true })
    this.chart.timeScale().applyOptions({ barSpacing: 8 })
    this.chart.timeScale().scrollToPosition(6, false)
  }

  goRealtime() {
    this.chart.timeScale().scrollToRealTime()
  }

  applyTheme() {
    this.colors = chartColors(app.theme)
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
        title: '🔔',
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
