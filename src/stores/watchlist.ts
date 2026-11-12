import { computed, reactive } from 'vue'
import { sameSymbol, type SymbolRef } from '../types'
import { load, persist } from '../lib/storage'

export interface WatchList {
  id: string
  name: string
  items: SymbolRef[]
}

const DEFAULTS: SymbolRef[] = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'DOGEUSDT'].map((symbol) => ({
  exchange: 'binance',
  market: 'futures',
  symbol,
}))

const uid = () => Math.random().toString(36).slice(2, 10)
const validItem = (r: SymbolRef) => !!(r && r.exchange && r.market && r.symbol)

function initial(): { all: WatchList[]; activeId: string } {
  const saved = load<{ all?: WatchList[]; activeId?: string } | null>('watchlists', null)
  const all = (saved?.all ?? [])
    .filter((l) => l && typeof l.name === 'string' && Array.isArray(l.items))
    .map((l) => ({ id: String(l.id), name: l.name, items: l.items.filter(validItem) }))
  if (!all.length) all.push({ id: uid(), name: 'Основной', items: DEFAULTS })
  return { all, activeId: all.some((l) => l.id === saved?.activeId) ? saved!.activeId! : all[0].id }
}

/** Списки наблюдения; один из них — текущий */
export const lists = reactive(initial())
persist('watchlists', lists, () => lists)

export const activeList = computed(() => lists.all.find((l) => l.id === lists.activeId) ?? lists.all[0])
export const watchlist = computed(() => activeList.value.items)

export const inWatchlist = (ref: SymbolRef) => watchlist.value.some((r) => sameSymbol(r, ref))

/** Добавляет инструмент в конец текущего списка; false — если он там уже есть */
export function addWatch(ref: SymbolRef): boolean {
  if (inWatchlist(ref)) return false
  watchlist.value.push({ exchange: ref.exchange, market: ref.market, symbol: ref.symbol })
  return true
}

export function toggleWatch(ref: SymbolRef) {
  const i = watchlist.value.findIndex((r) => sameSymbol(r, ref))
  if (i >= 0) watchlist.value.splice(i, 1)
  else addWatch(ref)
}

export function createList(name: string) {
  const list = { id: uid(), name, items: [] as SymbolRef[] }
  lists.all.push(list)
  lists.activeId = list.id
}

export function renameList(id: string, name: string) {
  const l = lists.all.find((x) => x.id === id)
  if (l) l.name = name
}

export function deleteList(id: string) {
  if (lists.all.length <= 1) return
  const i = lists.all.findIndex((l) => l.id === id)
  if (i < 0) return
  lists.all.splice(i, 1)
  if (lists.activeId === id) lists.activeId = lists.all[0].id
}
