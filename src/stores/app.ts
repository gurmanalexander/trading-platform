import { reactive, computed, ref } from 'vue'
import type { ExchangeId, MarketId, SymbolRef } from '../types'
import { load, persist } from '../lib/storage'
import { indicatorDef, type IndicatorInstance } from '../lib/indicators'
import { DEFAULT_FAVORITE_TFS, getTf, isTf, TIMEFRAMES } from '../lib/timeframes'

export type ChartType = 'candles' | 'hollow' | 'bars' | 'heikin' | 'line' | 'area'
export type ScaleMode = 'normal' | 'log' | 'percent'
export type PanelId = 'screener' | 'watchlist' | 'alerts'
export type MobileTab = 'chart' | PanelId
export type Tool = 'cursor' | 'trend' | 'ray' | 'hline' | 'hray' | 'vline' | 'cross' | 'rect' | 'fib' | 'long' | 'short' | 'measure'
export type Theme = 'dark' | 'light'
export type ThemePref = 'system' | Theme

export interface PaneState {
  symbol: SymbolRef
  tf: string
  chartType: ChartType
  scale: ScaleMode
  invert: boolean
  indicators: IndicatorInstance[]
}

export const CHART_TYPES: { id: ChartType; label: string; icon: string }[] = [
  { id: 'bars', label: 'Бары', icon: 'bars' },
  { id: 'candles', label: 'Свечи', icon: 'candles' },
  { id: 'hollow', label: 'Пустые свечи', icon: 'hollow' },
  { id: 'heikin', label: 'Хейкен Аши', icon: 'candles' },
  { id: 'line', label: 'Линия', icon: 'line' },
  { id: 'area', label: 'Область', icon: 'area' },
]

// ---------- раскладка ----------

/**
 * Раскладка — группы панелей. dir = 'rows': группы идут сверху вниз, панели внутри группы — слева направо;
 * dir = 'cols': группы слева направо, панели внутри — сверху вниз. groups — сколько панелей в каждой группе.
 */
export interface LayoutDef {
  dir: 'rows' | 'cols'
  groups: number[]
}
export interface LayoutState extends LayoutDef {
  /** доли групп и панелей внутри групп (меняются перетаскиванием границ) */
  groupSizes: number[]
  cellSizes: number[][]
}

export const MAX_PANES = 8
export const MAX_GROUPS = 4
export const MAX_PER_GROUP = 4

export const LAYOUT_PRESETS: LayoutDef[] = [
  { dir: 'rows', groups: [1] },
  { dir: 'rows', groups: [2] },
  { dir: 'rows', groups: [1, 1] },
  { dir: 'rows', groups: [1, 2] },
  { dir: 'rows', groups: [2, 1] },
  { dir: 'cols', groups: [1, 2] },
  { dir: 'cols', groups: [2, 1] },
  { dir: 'rows', groups: [3] },
  { dir: 'rows', groups: [1, 1, 1] },
  { dir: 'rows', groups: [2, 2] },
  { dir: 'rows', groups: [1, 3] },
  { dir: 'cols', groups: [1, 3] },
  { dir: 'rows', groups: [4] },
  { dir: 'rows', groups: [3, 3] },
  { dir: 'rows', groups: [2, 2, 2] },
  { dir: 'rows', groups: [4, 4] },
]

export const layoutCount = (l: LayoutDef) => l.groups.reduce((a, b) => a + b, 0)
export const sameLayout = (a: LayoutDef, b: LayoutDef) => a.dir === b.dir && a.groups.join() === b.groups.join()

export function makeLayout(def: LayoutDef): LayoutState {
  return {
    dir: def.dir,
    groups: def.groups.slice(),
    groupSizes: def.groups.map(() => 1),
    cellSizes: def.groups.map((n) => new Array(n).fill(1)),
  }
}

export function sanitizeLayout(raw: Partial<LayoutState> | undefined): LayoutState {
  const fallback = makeLayout({ dir: 'rows', groups: [1, 2] })
  if (!raw || (raw.dir !== 'rows' && raw.dir !== 'cols') || !Array.isArray(raw.groups)) return fallback
  const groups = raw.groups.map((n) => Math.floor(Number(n)))
  const okGroups =
    groups.length >= 1 && groups.length <= MAX_GROUPS && groups.every((n) => n >= 1 && n <= MAX_PER_GROUP) && layoutCount({ dir: raw.dir, groups }) <= MAX_PANES
  if (!okGroups) return fallback
  const sizes = (arr: unknown, n: number) =>
    Array.isArray(arr) && arr.length === n && arr.every((v) => typeof v === 'number' && v > 0 && isFinite(v)) ? (arr as number[]).slice() : new Array(n).fill(1)
  return {
    dir: raw.dir,
    groups,
    groupSizes: sizes(raw.groupSizes, groups.length),
    cellSizes: groups.map((n, i) => sizes(raw.cellSizes?.[i], n)),
  }
}

// ---------- панели ----------

const DEFAULT_SYMBOL: SymbolRef = { exchange: 'binance', market: 'futures', symbol: 'BTCUSDT' }
// сверху 5 минут, снизу слева день, снизу справа час
const DEFAULT_TFS = ['5m', '1d', '1h']

function defaultPane(i: number): PaneState {
  return { symbol: { ...DEFAULT_SYMBOL }, tf: DEFAULT_TFS[i] ?? '1h', chartType: 'bars', scale: 'normal', invert: false, indicators: [] }
}

/** Приводит сохранённую панель к актуальной схеме (на случай старых/битых данных) */
function sanitizePane(raw: Partial<PaneState> | undefined, i: number): PaneState {
  const d = defaultPane(i)
  if (!raw || typeof raw !== 'object') return d
  const s = raw.symbol
  const okSymbol =
    s && (s.exchange === 'binance' || s.exchange === 'bybit') && (s.market === 'spot' || s.market === 'futures') && typeof s.symbol === 'string' && s.symbol
  return {
    symbol: okSymbol ? { exchange: s.exchange, market: s.market, symbol: s.symbol } : d.symbol,
    tf: isTf(raw.tf) ? raw.tf : d.tf,
    chartType: CHART_TYPES.some((t) => t.id === raw.chartType) ? raw.chartType! : d.chartType,
    scale: raw.scale === 'log' || raw.scale === 'percent' ? raw.scale : 'normal',
    invert: raw.invert === true,
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

const clonePane = (p: PaneState): PaneState => sanitizePane(JSON.parse(JSON.stringify(p)), 0)

// ---------- синхронизация и шаблоны ----------

export interface SyncState {
  symbol: boolean
  interval: boolean
  crosshair: boolean
  time: boolean
}

/** Шаблон рабочего пространства: раскладка, настройки всех панелей и синхронизация */
export interface Template {
  id: string
  name: string
  /** false — при применении панели остаются на текущем инструменте */
  withSymbols: boolean
  layout: LayoutState
  panes: PaneState[]
  sync: SyncState
}

interface Saved {
  themePref?: ThemePref
  layout?: Partial<LayoutState>
  panes?: Partial<PaneState>[]
  active?: number
  panel?: PanelId
  panelOpen?: boolean
  magnet?: boolean
  sync?: Partial<SyncState>
  favTfs?: string[]
  templates?: Template[]
  templateId?: string | null
  searchFilter?: { exchange?: ExchangeId | 'all'; market?: MarketId | 'all' }
  drawingsHidden?: boolean
}

const saved = load<Saved>('app', {})
const PANELS: PanelId[] = ['screener', 'watchlist', 'alerts']

function sanitizeTemplates(raw: unknown): Template[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((t) => t && typeof t.name === 'string' && Array.isArray(t.panes))
    .map((t) => ({
      id: String(t.id),
      name: t.name,
      withSymbols: t.withSymbols === true,
      layout: sanitizeLayout(t.layout),
      panes: t.panes.map((p: Partial<PaneState>, i: number) => sanitizePane(p, i)),
      sync: { symbol: t.sync?.symbol !== false, interval: t.sync?.interval === true, crosshair: t.sync?.crosshair !== false, time: t.sync?.time === true },
    }))
}

export const app = reactive({
  themePref: (saved.themePref === 'dark' || saved.themePref === 'light' ? saved.themePref : 'system') as ThemePref,
  layout: sanitizeLayout(saved.layout),
  panes: Array.from({ length: MAX_PANES }, (_, i) => sanitizePane(saved.panes?.[i], i)),
  active: Math.min(MAX_PANES - 1, Math.max(0, saved.active ?? 0)),
  panel: (PANELS.includes(saved.panel as PanelId) ? saved.panel : 'screener') as PanelId,
  panelOpen: saved.panelOpen ?? true,
  magnet: saved.magnet ?? true,
  sync: {
    symbol: saved.sync?.symbol ?? true,
    interval: saved.sync?.interval ?? false,
    crosshair: saved.sync?.crosshair ?? true,
    time: saved.sync?.time ?? false,
  } as SyncState,
  favTfs: (Array.isArray(saved.favTfs) ? saved.favTfs.filter(isTf) : DEFAULT_FAVORITE_TFS.slice()) as string[],
  templates: sanitizeTemplates(saved.templates),
  templateId: (saved.templateId ?? null) as string | null,
  searchFilter: {
    exchange: (saved.searchFilter?.exchange ?? 'binance') as ExchangeId | 'all',
    market: (saved.searchFilter?.market ?? 'futures') as MarketId | 'all',
  },
  drawingsHidden: saved.drawingsHidden ?? false,

  // не сохраняется
  tool: 'cursor' as Tool,
  mobileTab: 'chart' as MobileTab,
  drawBarOpen: false,
  /** активная панель развёрнута на всё поле графиков */
  maximized: false,
  search: null as null | { query: string },
  indicatorsOpen: false,
  indSettings: null as null | { pane: number; id: string },
  intervalInput: null as null | { text: string },
  hotkeysOpen: false,
  gotoOpen: false,
  /** счётчик запросов «поставить курсор в поле цены оповещения» (Alt+A) */
  alertFocus: 0,
})

persist(
  'app',
  () => [app.themePref, app.layout, app.panes, app.active, app.panel, app.panelOpen, app.magnet, app.sync, app.favTfs, app.templates, app.templateId, app.searchFilter, app.drawingsHidden],
  () => ({
    themePref: app.themePref,
    layout: app.layout,
    panes: app.panes,
    active: app.active,
    panel: app.panel,
    panelOpen: app.panelOpen,
    magnet: app.magnet,
    sync: app.sync,
    favTfs: app.favTfs,
    templates: app.templates,
    templateId: app.templateId,
    searchFilter: app.searchFilter,
    drawingsHidden: app.drawingsHidden,
  }),
)

// ---------- тема ----------

const systemDark = window.matchMedia('(prefers-color-scheme: dark)')
const systemTheme = ref<Theme>(systemDark.matches ? 'dark' : 'light')
systemDark.addEventListener('change', (e) => (systemTheme.value = e.matches ? 'dark' : 'light'))

/** Действующая тема: выбранная вручную либо как в системе */
export const theme = computed<Theme>(() => (app.themePref === 'system' ? systemTheme.value : app.themePref))

// ---------- размеры экрана ----------

export const viewport = reactive({ w: window.innerWidth, h: window.innerHeight })
window.addEventListener('resize', () => {
  viewport.w = window.innerWidth
  viewport.h = window.innerHeight
})

/** Телефон: один график на экране, нижняя навигация, панели на весь экран */
export const isPhone = computed(() => viewport.w < 720)

export const paneCount = computed(() => layoutCount(app.layout))
export const activeIndex = computed(() => Math.min(app.active, paneCount.value - 1))
export const activePane = computed(() => app.panes[activeIndex.value])
export const modalOpen = computed(() => !!(app.search || app.indicatorsOpen || app.indSettings || app.intervalInput || app.hotkeysOpen || app.gotoOpen))

// ---------- действия ----------

/** Меняет инструмент активной панели, а при синхронизации инструмента — всех панелей раскладки */
export function setSymbol(ref: SymbolRef) {
  const next = () => ({ exchange: ref.exchange, market: ref.market, symbol: ref.symbol })
  if (app.sync.symbol) for (let i = 0; i < paneCount.value; i++) app.panes[i].symbol = next()
  else activePane.value.symbol = next()
  if (isPhone.value) app.mobileTab = 'chart'
}

export function setTf(id: string) {
  const tf = getTf(id).id
  if (app.sync.interval) for (let i = 0; i < paneCount.value; i++) app.panes[i].tf = tf
  else activePane.value.tf = tf
}

export function toggleFavTf(id: string) {
  const i = app.favTfs.indexOf(id)
  if (i >= 0) app.favTfs.splice(i, 1)
  else {
    app.favTfs.push(id)
    // порядок как в общем списке интервалов
    app.favTfs.sort((a, b) => TIMEFRAMES.findIndex((t) => t.id === a) - TIMEFRAMES.findIndex((t) => t.id === b))
  }
}

export function setLayout(def: LayoutDef) {
  const before = paneCount.value
  const symbol = activePane.value.symbol
  app.layout = makeLayout(def)
  app.maximized = false
  // новые панели открываются на текущем инструменте
  if (app.sync.symbol) for (let i = before; i < paneCount.value; i++) app.panes[i].symbol = { ...symbol }
  if (app.active >= paneCount.value) app.active = 0
}

export function cyclePane(step: number) {
  const n = paneCount.value
  app.active = (activeIndex.value + step + n) % n
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

export function showPanel(id: PanelId) {
  if (isPhone.value) app.mobileTab = id
  else {
    app.panel = id
    app.panelOpen = true
  }
}

// ---------- шаблоны ----------

const snapshot = (name: string, withSymbols: boolean, id: string): Template => ({
  id,
  name,
  withSymbols,
  layout: sanitizeLayout(JSON.parse(JSON.stringify(app.layout))),
  panes: app.panes.slice(0, paneCount.value).map(clonePane),
  sync: { ...app.sync },
})

export function saveTemplate(name: string, withSymbols: boolean) {
  const t = snapshot(name, withSymbols, Math.random().toString(36).slice(2, 10))
  app.templates.push(t)
  app.templateId = t.id
}

/** Перезаписывает шаблон текущим состоянием */
export function updateTemplate(id: string) {
  const i = app.templates.findIndex((t) => t.id === id)
  if (i < 0) return
  const old = app.templates[i]
  app.templates[i] = snapshot(old.name, old.withSymbols, old.id)
  app.templateId = id
}

export function deleteTemplate(id: string) {
  const i = app.templates.findIndex((t) => t.id === id)
  if (i >= 0) app.templates.splice(i, 1)
  if (app.templateId === id) app.templateId = null
}

export function applyTemplate(id: string) {
  const t = app.templates.find((x) => x.id === id)
  if (!t) return
  const current = { ...activePane.value.symbol }
  app.layout = sanitizeLayout(JSON.parse(JSON.stringify(t.layout)))
  app.sync = { ...t.sync }
  app.maximized = false
  t.panes.forEach((p, i) => {
    if (i >= MAX_PANES) return
    const next = clonePane(p)
    if (!t.withSymbols) next.symbol = { ...current }
    // панель обновляется на месте: график держит ссылку на этот объект
    Object.assign(app.panes[i], next)
  })
  app.active = 0
  app.templateId = id
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
