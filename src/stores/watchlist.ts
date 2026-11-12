import { computed, reactive } from 'vue'
import { sameSymbol, symbolKey, type SymbolRef } from '../types'
import { load, persist } from '../lib/storage'
import { latestPosition } from '../chart/position'
import { drawings } from './drawings'

export type Side = 'long' | 'short'
export type SideFilter = 'all' | Side

export interface WatchItem extends SymbolRef {
  /** направление, отмеченное вручную; не задано — берётся у последней позиции на графике */
  side?: Side
}

export interface WatchList {
  id: string
  name: string
  color: string
  collapsed: boolean
  items: WatchItem[]
}

export const LIST_COLORS = ['#e8a838', '#1fb28a', '#4c8dff', '#a78bfa', '#f0566b', '#3fa7a3', '#d86bb0', '#7d8799']

const uid = () => Math.random().toString(36).slice(2, 10)
const fut = (symbol: string): WatchItem => ({ exchange: 'binance', market: 'futures', symbol })

function defaults(): { all: WatchList[]; activeId: string } {
  const mk = (name: string, color: string, items: WatchItem[] = []): WatchList => ({ id: uid(), name, color, collapsed: false, items })
  const all = [
    mk('Поводыри', '#e8a838', [fut('BTCUSDT'), fut('ETHUSDT')]),
    mk('Сделки', '#1fb28a'),
    mk('Ордера', '#4c8dff'),
    mk('Не взяли', '#a78bfa'),
    mk('Закрытые', '#7d8799'),
    mk('Наблюдаю', '#3fa7a3'),
    mk('Остальные', '#d86bb0'),
  ]
  // новые инструменты (Alt+W, звёздочка) по умолчанию попадают в «Наблюдаю»
  return { all, activeId: all[5].id }
}

function initial() {
  const saved = load<{ all?: WatchList[]; activeId?: string; filter?: SideFilter } | null>('lists', null)
  const all = (saved?.all ?? [])
    .filter((l) => l && typeof l.name === 'string' && Array.isArray(l.items))
    .map((l, i) => ({
      id: String(l.id),
      name: l.name,
      color: typeof l.color === 'string' ? l.color : LIST_COLORS[i % LIST_COLORS.length],
      collapsed: l.collapsed === true,
      items: l.items
        .filter((r) => r && r.exchange && r.market && r.symbol)
        .map((r) => ({ exchange: r.exchange, market: r.market, symbol: r.symbol, ...(r.side === 'long' || r.side === 'short' ? { side: r.side } : {}) })),
    }))
  const base = all.length ? { all, activeId: all.some((l) => l.id === saved?.activeId) ? saved!.activeId! : all[0].id } : defaults()
  return { ...base, filter: (saved?.filter === 'long' || saved?.filter === 'short' ? saved.filter : 'all') as SideFilter }
}

/** Списки наблюдения. activeId — текущий список: в него добавляют Alt+W и звёздочка */
export const lists = reactive(initial())
persist('lists', lists, () => lists)

export const activeList = computed(() => lists.all.find((l) => l.id === lists.activeId) ?? lists.all[0])

/** Направление инструмента: ручная отметка либо направление последней позиции на его графике */
export function sideOf(item: WatchItem): Side | null {
  if (item.side) return item.side
  const p = latestPosition(drawings[symbolKey(item)])
  return p ? (p.type as Side) : null
}

export const matchesFilter = (item: WatchItem) => lists.filter === 'all' || sideOf(item) === lists.filter

/** Инструменты в том порядке, как они видны на экране: свёрнутые списки и отфильтрованные строки пропущены */
export const visibleItems = computed(() => lists.all.flatMap((l) => (l.collapsed ? [] : l.items.filter(matchesFilter))))

export const inActiveList = (ref: SymbolRef) => activeList.value.items.some((r) => sameSymbol(r, ref))

/** Добавляет инструмент в конец текущего списка; false — если он там уже есть */
export function addWatch(ref: SymbolRef): boolean {
  if (inActiveList(ref)) return false
  activeList.value.items.push({ exchange: ref.exchange, market: ref.market, symbol: ref.symbol })
  return true
}

/** Звёздочка: добавляет в текущий список или убирает из него */
export function toggleWatch(ref: SymbolRef) {
  const items = activeList.value.items
  const i = items.findIndex((r) => sameSymbol(r, ref))
  if (i >= 0) items.splice(i, 1)
  else addWatch(ref)
}

export function removeItem(listId: string, index: number) {
  lists.all.find((l) => l.id === listId)?.items.splice(index, 1)
}

/** Отметка направления по кругу: нет → лонг → шорт → нет */
export function cycleSide(item: WatchItem) {
  if (!item.side) item.side = 'long'
  else if (item.side === 'long') item.side = 'short'
  else delete item.side
}

/**
 * Переносит инструмент. toIndex — позиция в целевом списке, считая до изъятия строки;
 * при переносе внутри одного списка сдвиг учитывается здесь.
 */
export function moveItem(fromListId: string, fromIndex: number, toListId: string, toIndex: number) {
  const from = lists.all.find((l) => l.id === fromListId)
  const to = lists.all.find((l) => l.id === toListId)
  if (!from || !to || fromIndex < 0 || fromIndex >= from.items.length) return
  if (from === to && (toIndex === fromIndex || toIndex === fromIndex + 1)) return
  const [item] = from.items.splice(fromIndex, 1)
  // один и тот же инструмент дважды в списке не нужен
  const dup = to.items.findIndex((r) => sameSymbol(r, item))
  if (from !== to && dup >= 0) {
    to.items.splice(dup, 1)
    if (dup < toIndex) toIndex--
  }
  if (from === to && fromIndex < toIndex) toIndex--
  to.items.splice(Math.max(0, Math.min(to.items.length, toIndex)), 0, item)
}

/** Переставляет список целиком вместе с его инструментами; toIndex — позиция до изъятия */
export function moveList(fromIndex: number, toIndex: number) {
  if (fromIndex < 0 || fromIndex >= lists.all.length || toIndex === fromIndex || toIndex === fromIndex + 1) return
  const [list] = lists.all.splice(fromIndex, 1)
  if (fromIndex < toIndex) toIndex--
  lists.all.splice(Math.max(0, Math.min(lists.all.length, toIndex)), 0, list)
}

export function createList(name: string) {
  const list: WatchList = { id: uid(), name, color: LIST_COLORS[lists.all.length % LIST_COLORS.length], collapsed: false, items: [] }
  lists.all.push(list)
  lists.activeId = list.id
}

export function deleteList(id: string) {
  if (lists.all.length <= 1) return
  const i = lists.all.findIndex((l) => l.id === id)
  if (i < 0) return
  lists.all.splice(i, 1)
  if (lists.activeId === id) lists.activeId = lists.all[0].id
}
