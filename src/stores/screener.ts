import { computed, reactive, shallowRef } from 'vue'
import { sameSymbol, type ExchangeId, type MarketId, type SymbolRef } from '../types'
import { load, persist } from '../lib/storage'
import { loadSymbols, withUsdVolume, type SymbolVolume } from '../exchanges'
import { app, activePane, isPhone, setSymbol } from './app'
import { visibleItems } from './watchlist'

export type SortKey = 'volume' | 'change' | 'price' | 'symbol'

/** Столбцы отбора, кроме названия: оно показывается всегда */
export type ScreenerCol = 'price' | 'change' | 'volume'
export const SCREENER_COLS: { id: ScreenerCol; label: string; sort: SortKey }[] = [
  { id: 'price', label: 'Цена', sort: 'price' },
  { id: 'change', label: 'Изменение за 24ч', sort: 'change' },
  { id: 'volume', label: 'Объём за 24ч', sort: 'volume' },
]

export interface ScreenerSettings {
  exchange: ExchangeId
  market: MarketId
  /** минимальный оборот за 24 часа, млн $ */
  minVolume: number
  /** минимальное изменение за 24 часа по модулю, %; 0 — не учитывать */
  minChange: number
  quote: 'USDT' | 'all'
  sort: SortKey
  dir: 'asc' | 'desc'
  cols: ScreenerCol[]
}

const DEFAULT_COLS: ScreenerCol[] = ['price', 'volume']
const DEFAULTS: ScreenerSettings = { exchange: 'binance', market: 'futures', minVolume: 30, minChange: 0, quote: 'USDT', sort: 'volume', dir: 'desc', cols: DEFAULT_COLS }
export const MAX_ROWS = 200
const REFRESH_MS = 20_000

function parse(s: Partial<ScreenerSettings>): ScreenerSettings {
  return {
    exchange: s.exchange === 'bybit' ? 'bybit' : 'binance',
    market: s.market === 'spot' ? 'spot' : 'futures',
    minVolume: typeof s.minVolume === 'number' && s.minVolume >= 0 ? s.minVolume : DEFAULTS.minVolume,
    minChange: typeof s.minChange === 'number' && s.minChange >= 0 ? s.minChange : 0,
    quote: s.quote === 'all' ? 'all' : 'USDT',
    sort: (['volume', 'change', 'price', 'symbol'] as SortKey[]).includes(s.sort as SortKey) ? (s.sort as SortKey) : 'volume',
    dir: s.dir === 'asc' ? 'asc' : 'desc',
    cols: Array.isArray(s.cols) ? SCREENER_COLS.map((c) => c.id).filter((c) => s.cols!.includes(c)) : DEFAULT_COLS.slice(),
  }
}

export const settings = reactive(parse(load<Partial<ScreenerSettings>>('screener', {})))
persist('screener', settings, () => settings)

/** Возвращает фильтры и сортировку к исходным; набор столбцов не трогает */
export function resetSettings() {
  Object.assign(settings, DEFAULTS, { cols: settings.cols })
}

/** Сколько условий отбора отличается от исходных — для метки на кнопке фильтра */
export const filterCount = computed(() => +(settings.minVolume !== DEFAULTS.minVolume) + +(settings.minChange > 0) + +(settings.quote !== DEFAULTS.quote))
/** Всего инструментов на выбранной бирже и рынке — до фильтров */
export const universe = computed(() => rows.value.length)

export const state = reactive({ loading: false, error: '', updatedAt: 0 })
const rows = shallowRef<SymbolVolume[]>([])

export async function refresh() {
  const { exchange, market } = settings
  state.loading = true
  try {
    const list = withUsdVolume(await loadSymbols(exchange, market, REFRESH_MS - 1000))
    // пока ждали ответ, биржу или рынок могли переключить
    if (exchange !== settings.exchange || market !== settings.market) return
    rows.value = list
    state.error = ''
    state.updatedAt = Date.now()
  } catch (e) {
    state.error = e instanceof Error ? e.message : 'Не удалось получить список'
  } finally {
    state.loading = false
  }
}

/** Отфильтрованный и отсортированный список */
export function screen(list: SymbolVolume[], s: ScreenerSettings): SymbolVolume[] {
  const min = s.minVolume * 1e6
  const out = list.filter(
    (r) => r.usdVolume >= min && (s.quote === 'all' || r.symbol.endsWith('USDT')) && (!s.minChange || Math.abs(r.changePct) >= s.minChange),
  )
  const sign = s.dir === 'asc' ? 1 : -1
  const value = (r: SymbolVolume) => (s.sort === 'volume' ? r.usdVolume : s.sort === 'change' ? r.changePct : r.last)
  out.sort((a, b) => (s.sort === 'symbol' ? a.symbol.localeCompare(b.symbol) : value(a) - value(b)) * sign)
  return out
}

export const total = computed(() => screen(rows.value, settings))
export const view = computed(() => total.value.slice(0, MAX_ROWS))

export function sortBy(key: SortKey) {
  if (settings.sort === key) settings.dir = settings.dir === 'asc' ? 'desc' : 'asc'
  else {
    settings.sort = key
    // названия удобнее по алфавиту, числа — от больших к меньшим
    settings.dir = key === 'symbol' ? 'asc' : 'desc'
  }
}

let timer = 0
let users = 0
/** Отбор обновляется по таймеру, только пока он на экране */
export function startAutoRefresh(): () => void {
  if (users++ === 0) {
    refresh()
    timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') refresh()
    }, REFRESH_MS)
  }
  return () => {
    if (--users === 0) clearInterval(timer)
  }
}

// ---------- переход по списку клавишами ----------

/** Следующий/предыдущий инструмент в том списке, который сейчас открыт (отбор или список наблюдения) */
export function stepSymbol(step: number) {
  const tab = isPhone.value ? app.mobileTab : app.panel
  const list: SymbolRef[] = tab === 'screener' ? view.value : visibleItems.value
  if (!list.length) return
  const cur = list.findIndex((r) => sameSymbol(r, activePane.value.symbol))
  const next = cur < 0 ? (step > 0 ? 0 : list.length - 1) : (cur + step + list.length) % list.length
  const keepTab = app.mobileTab
  setSymbol(list[next])
  app.mobileTab = keepTab
}

/** Принимает условия отбора с другого устройства; столбцы у каждого устройства свои */
export function importScreener(raw: unknown) {
  if (!raw || typeof raw !== 'object') return
  Object.assign(settings, parse(raw as Partial<ScreenerSettings>), { cols: settings.cols })
}
export function exportScreener() {
  const { cols: _cols, ...rest } = settings
  return rest
}
