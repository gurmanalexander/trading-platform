import { reactive, computed } from 'vue'
import type { SymbolRef } from '../types'
import { load, persist } from '../lib/storage'
import { newIndicator, indicatorDef, type IndicatorInstance } from '../lib/indicators'
import { getTf } from '../lib/timeframes'

export type ChartType = 'candles' | 'hollow' | 'bars' | 'heikin' | 'line' | 'area'
export type ScaleMode = 'normal' | 'log' | 'percent'
export type Layout = '1' | '2h' | '2v' | '4'
export type PanelId = 'watchlist' | 'book' | 'alerts'
export type MobileTab = 'chart' | PanelId
export type Tool = 'cursor' | 'trend' | 'ray' | 'hline' | 'vline' | 'rect' | 'fib' | 'measure'
export type Theme = 'dark' | 'light'

export interface PaneState {
  symbol: SymbolRef
  tf: string
  chartType: ChartType
  scale: ScaleMode
  indicators: IndicatorInstance[]
}

export const CHART_TYPES: { id: ChartType; label: string; icon: string }[] = [
  { id: 'candles', label: 'Свечи', icon: 'candles' },
  { id: 'hollow', label: 'Пустые свечи', icon: 'hollow' },
  { id: 'bars', label: 'Бары', icon: 'bars' },
  { id: 'heikin', label: 'Хейкен Аши', icon: 'candles' },
  { id: 'line', label: 'Линия', icon: 'line' },
  { id: 'area', label: 'Область', icon: 'area' },
]

export const LAYOUTS: { id: Layout; label: string; count: number }[] = [
  { id: '1', label: 'Один график', count: 1 },
  { id: '2h', label: 'Два рядом', count: 2 },
  { id: '2v', label: 'Два друг под другом', count: 2 },
  { id: '4', label: 'Четыре', count: 4 },
]

const DEFAULT_SYMBOLS: SymbolRef[] = [
  { exchange: 'binance', market: 'spot', symbol: 'BTCUSDT' },
  { exchange: 'bybit', market: 'futures', symbol: 'BTCUSDT' },
  { exchange: 'binance', market: 'spot', symbol: 'ETHUSDT' },
  { exchange: 'bybit', market: 'spot', symbol: 'SOLUSDT' },
]

function defaultPane(i: number): PaneState {
  return {
    symbol: { ...DEFAULT_SYMBOLS[i % DEFAULT_SYMBOLS.length] },
    tf: '1h',
    chartType: 'candles',
    scale: 'normal',
    indicators: [newIndicator('vol')!],
  }
}

/** Приводит сохранённую панель к актуальной схеме (на случай старых/битых данных) */
function sanitizePane(raw: Partial<PaneState> | undefined, i: number): PaneState {
  const d = defaultPane(i)
  if (!raw || typeof raw !== 'object') return d
  const s = raw.symbol
  const okSymbol =
    s &&
    (s.exchange === 'binance' || s.exchange === 'bybit') &&
    (s.market === 'spot' || s.market === 'futures') &&
    typeof s.symbol === 'string' &&
    s.symbol
  return {
    symbol: okSymbol ? { exchange: s.exchange, market: s.market, symbol: s.symbol } : d.symbol,
    tf: getTf(raw.tf ?? '').id,
    chartType: CHART_TYPES.some((t) => t.id === raw.chartType) ? raw.chartType! : d.chartType,
    scale: raw.scale === 'log' || raw.scale === 'percent' ? raw.scale : 'normal',
    indicators: Array.isArray(raw.indicators)
      ? raw.indicators
          .filter((x) => x && indicatorDef(x.type))
          .map((x) => ({
            id: String(x.id),
            type: x.type,
            params: { ...x.params },
            visible: x.visible !== false,
            ...(Array.isArray(x.colors) ? { colors: x.colors.slice() } : {}),
          }))
      : d.indicators,
  }
}

interface Saved {
  theme?: Theme
  layout?: Layout
  panes?: Partial<PaneState>[]
  active?: number
  panel?: PanelId
  panelOpen?: boolean
  magnet?: boolean
}

const saved = load<Saved>('app', {})

export const app = reactive({
  theme: (saved.theme === 'light' ? 'light' : 'dark') as Theme,
  layout: (LAYOUTS.some((l) => l.id === saved.layout) ? saved.layout : '1') as Layout,
  panes: [0, 1, 2, 3].map((i) => sanitizePane(saved.panes?.[i], i)),
  active: Math.min(3, Math.max(0, saved.active ?? 0)),
  panel: (saved.panel ?? 'watchlist') as PanelId,
  panelOpen: saved.panelOpen ?? true,
  magnet: saved.magnet ?? false,

  // не сохраняется
  tool: 'cursor' as Tool,
  mobileTab: 'chart' as MobileTab,
  drawBarOpen: false,
  search: null as null | { query: string },
  indicatorsOpen: false,
  indSettings: null as null | { pane: number; id: string },
})

persist(
  'app',
  () => [app.theme, app.layout, app.panes, app.active, app.panel, app.panelOpen, app.magnet],
  () => ({
    theme: app.theme,
    layout: app.layout,
    panes: app.panes,
    active: app.active,
    panel: app.panel,
    panelOpen: app.panelOpen,
    magnet: app.magnet,
  }),
)

// ---------- размеры экрана ----------

export const viewport = reactive({ w: window.innerWidth, h: window.innerHeight })
window.addEventListener('resize', () => {
  viewport.w = window.innerWidth
  viewport.h = window.innerHeight
})

/** Телефон: одна колонка, нижняя навигация, панели на весь экран */
export const isPhone = computed(() => viewport.w < 720)

export const paneCount = computed(() =>
  isPhone.value ? 1 : (LAYOUTS.find((l) => l.id === app.layout)?.count ?? 1),
)

export const activeIndex = computed(() => Math.min(app.active, paneCount.value - 1))
export const activePane = computed(() => app.panes[activeIndex.value])

export function setSymbol(ref: SymbolRef) {
  activePane.value.symbol = { exchange: ref.exchange, market: ref.market, symbol: ref.symbol }
  if (isPhone.value) app.mobileTab = 'chart'
}

export function openSearch(query = '') {
  app.search = { query }
}

export function togglePanel(id: PanelId) {
  if (app.panelOpen && app.panel === id) app.panelOpen = false
  else {
    app.panel = id
    app.panelOpen = true
  }
}

// ---------- всплывающие сообщения ----------

export interface Toast {
  id: number
  text: string
  kind: 'info' | 'alert' | 'error'
}
export const toasts = reactive<Toast[]>([])
let toastId = 1
export function toast(text: string, kind: Toast['kind'] = 'info', ms = 4000) {
  const id = toastId++
  toasts.push({ id, text, kind })
  if (ms > 0) setTimeout(() => dismissToast(id), ms)
}
export function dismissToast(id: number) {
  const i = toasts.findIndex((t) => t.id === id)
  if (i >= 0) toasts.splice(i, 1)
}
