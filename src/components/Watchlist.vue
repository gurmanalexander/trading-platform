<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import Icon from './Icon.vue'
import Dropdown from './Dropdown.vue'
import SideMark from './SideMark.vue'
import { EXCHANGE_NAMES, MARKET_NAMES, sameSymbol, symbolKey } from '../types'
import { activePane, openSearch, setSymbol } from '../stores/app'
import { tickers, useTickers } from '../stores/tickers'
import { dayStats, useDayStats } from '../stores/atr'
import { drawings } from '../stores/drawings'
import { tracked, currentR, useTrackedPositions } from '../stores/positions'
import {
  lists,
  visibleItems,
  matchesFilter,
  removeItem,
  moveItem,
  moveList,
  createList,
  deleteList,
  LIST_COLORS,
  type SideFilter,
  type WatchItem,
  type WatchList,
} from '../stores/watchlist'
import { fmtPct, fmtPrice, precisionOf } from '../lib/format'
import { fmtR } from '../chart/position'

useTickers(() => visibleItems.value)
useDayStats(() => visibleItems.value)
useTrackedPositions(() => visibleItems.value)

const FILTERS: { id: SideFilter; label: string }[] = [
  { id: 'all', label: 'Все' },
  { id: 'long', label: 'Лонги' },
  { id: 'short', label: 'Шорты' },
]

function price(r: WatchItem) {
  const key = symbolKey(r)
  const t = tickers[key]
  return t ? fmtPrice(t.last, precisionOf(key, t.last)) : '—'
}

interface Status {
  text: string
  cls: string
  title: string
}

/** Результат последней позиции в R */
function positionStatus(key: string): Status | null {
  const p = tracked[key]
  if (!p) return null
  if (p.status === 'pending') return { text: 'ждёт', cls: 'muted', title: 'Время входа ещё не наступило' }
  const value = currentR(key)
  if (value == null) return null
  const mark = p.status === 'tp' ? '✓ ' : p.status === 'sl' ? '✕ ' : ''
  const state = p.status === 'tp' ? 'закрыта по тейку' : p.status === 'sl' ? 'закрыта по стопу' : 'открыта'
  return { text: mark + fmtR(value), cls: value >= 0 ? 'up' : 'down', title: `Последняя позиция (${p.type === 'long' ? 'лонг' : 'шорт'}) ${state}` }
}

/** Расстояние до ближайшего горизонтального уровня в долях дневного ATR: плюс — уровень выше цены, минус — ниже */
function levelStatus(key: string): Status | null {
  const last = tickers[key]?.last
  const atr = dayStats[key]?.atr
  if (!last || !atr) return null
  let best: number | null = null
  for (const d of drawings[key] ?? []) {
    if (d.type !== 'hline' && d.type !== 'hray') continue
    const level = d.pts[0].p
    if (best === null || Math.abs(level - last) < Math.abs(best - last)) best = level
  }
  if (best === null) return null
  const dist = (best - last) / atr
  return {
    text: (dist >= 0 ? '+' : '') + dist.toFixed(2) + 'A',
    cls: dist >= 0 ? 'up' : 'down',
    title: `До ближайшего уровня ${best}: ${dist.toFixed(2)} ATR (ATR ${fmtPrice(atr, precisionOf(key, last))})`,
  }
}

/**
 * Правая колонка строки. Идёт сделка — её результат в R. Активной сделки нет — расстояние
 * до ближайшего уровня; если и уровней нет, остаётся итог последней закрытой сделки.
 */
function status(r: WatchItem): Status | null {
  const key = symbolKey(r)
  const p = tracked[key]
  if (p && (p.status === 'open' || p.status === 'pending')) return positionStatus(key)
  return levelStatus(key) ?? positionStatus(key)
}

// ---------- списки ----------

function addList() {
  const name = prompt('Название нового списка', `Список ${lists.all.length + 1}`)?.trim()
  if (name) createList(name.slice(0, 40))
}
function rename(l: WatchList) {
  const name = prompt('Название списка', l.name)?.trim()
  if (name) l.name = name.slice(0, 40)
}
function remove(l: WatchList) {
  if (confirm(`Удалить список «${l.name}»${l.items.length ? ` и ${l.items.length} инструм. в нём` : ''}?`)) deleteList(l.id)
}
function addTo(l: WatchList) {
  lists.activeId = l.id
  l.collapsed = false
  openSearch()
}

// ---------- перетаскивание ----------
// Свой механизм на событиях указателя: встроенное перетаскивание браузера не работает на сенсорных экранах.
// Мышью строка или заголовок тянется сразу, пальцем — после долгого нажатия (иначе это прокрутка).

interface DropTarget {
  listId: string
  /** для инструмента — позиция в списке, для списка — позиция среди списков */
  index: number
}

const drag = reactive({
  active: false,
  kind: 'item' as 'item' | 'list',
  listId: '',
  index: 0,
  label: '',
  x: 0,
  y: 0,
  target: null as DropTarget | null,
})
const scroller = ref<HTMLElement>()
let start = { x: 0, y: 0 }
let pressTimer = 0
let pending: { kind: 'item' | 'list'; listId: string; index: number; label: string; touch: boolean } | null = null
let suppressClick = false

function onDown(e: PointerEvent, kind: 'item' | 'list', listId: string, index: number, label: string) {
  if (e.button > 0 || (e.target as HTMLElement).closest('button, .dropdown')) return
  start = { x: e.clientX, y: e.clientY }
  pending = { kind, listId, index, label, touch: e.pointerType !== 'mouse' }
  if (pending.touch) pressTimer = window.setTimeout(() => begin(start.x, start.y), 350)
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  window.addEventListener('pointercancel', onUp)
}

function begin(x: number, y: number) {
  if (!pending) return
  Object.assign(drag, { active: true, kind: pending.kind, listId: pending.listId, index: pending.index, label: pending.label, x, y, target: null })
  if (pending.touch) navigator.vibrate?.(15)
}

function onMove(e: PointerEvent) {
  if (!pending) return
  if (!drag.active) {
    const moved = Math.hypot(e.clientX - start.x, e.clientY - start.y)
    if (pending.touch) {
      // палец поехал раньше срока — это прокрутка списка, а не перетаскивание
      if (moved > 8) cancel()
      return
    }
    if (moved < 5) return
    begin(e.clientX, e.clientY)
  }
  drag.x = e.clientX
  drag.y = e.clientY
  drag.target = findTarget(e.clientX, e.clientY)
  // у края списка подкручиваем его сами
  const box = scroller.value?.getBoundingClientRect()
  if (box && scroller.value) {
    if (e.clientY < box.top + 28) scroller.value.scrollTop -= 12
    else if (e.clientY > box.bottom - 28) scroller.value.scrollTop += 12
  }
}

function findTarget(x: number, y: number): DropTarget | null {
  const el = document.elementFromPoint(x, y) as HTMLElement | null
  if (!el) return null
  if (drag.kind === 'list') {
    const block = el.closest<HTMLElement>('[data-list]')
    if (!block) return null
    const r = block.getBoundingClientRect()
    const i = lists.all.findIndex((l) => l.id === block.dataset.list)
    return { listId: block.dataset.list!, index: y < r.top + r.height / 2 ? i : i + 1 }
  }
  const row = el.closest<HTMLElement>('[data-row]')
  if (row) {
    const r = row.getBoundingClientRect()
    const i = Number(row.dataset.row)
    return { listId: row.closest<HTMLElement>('[data-list]')!.dataset.list!, index: y < r.top + r.height / 2 ? i : i + 1 }
  }
  // заголовок или пустое место списка — в конец этого списка
  const block = el.closest<HTMLElement>('[data-list]')
  if (!block) return null
  const list = lists.all.find((l) => l.id === block.dataset.list)
  return list ? { listId: list.id, index: list.items.length } : null
}

function onUp() {
  if (drag.active && drag.target) {
    if (drag.kind === 'item') moveItem(drag.listId, drag.index, drag.target.listId, drag.target.index)
    else
      moveList(
        lists.all.findIndex((l) => l.id === drag.listId),
        drag.target.index,
      )
  }
  if (drag.active) {
    // отпускание после перетаскивания не должно сработать как щелчок по строке
    suppressClick = true
    setTimeout(() => (suppressClick = false), 0)
  }
  cancel()
}

function cancel() {
  clearTimeout(pressTimer)
  pending = null
  drag.active = false
  drag.target = null
  window.removeEventListener('pointermove', onMove)
  window.removeEventListener('pointerup', onUp)
  window.removeEventListener('pointercancel', onUp)
}

// пока тянем пальцем, список не должен прокручиваться сам
const blockScroll = (e: TouchEvent) => {
  if (drag.active) e.preventDefault()
}
onMounted(() => scroller.value?.addEventListener('touchmove', blockScroll, { passive: false }))
onBeforeUnmount(() => {
  scroller.value?.removeEventListener('touchmove', blockScroll)
  cancel()
})

function pick(r: WatchItem) {
  if (!suppressClick) setSymbol(r)
}
function toggle(l: WatchList, e: MouseEvent) {
  // щелчки внутри меню списка всплывают до заголовка — они не должны его сворачивать
  if (suppressClick || (e.target as HTMLElement).closest('.dropdown')) return
  l.collapsed = !l.collapsed
}

/** Куда встанет перетаскиваемое: класс для строки или списка, рисующий линию вставки */
function rowMark(listId: string, i: number, count: number): string {
  const t = drag.target
  if (!drag.active || drag.kind !== 'item' || !t || t.listId !== listId) return ''
  if (t.index === i) return 'drop-before'
  return i === count - 1 && t.index >= count ? 'drop-after' : ''
}
function listMark(listId: string, i: number): string {
  const t = drag.target
  if (!drag.active || !t) return ''
  if (drag.kind === 'list') return t.index === i ? 'drop-before' : i === lists.all.length - 1 && t.index > i ? 'drop-after' : ''
  const list = lists.all[i]
  return t.listId === listId && (list.collapsed || !list.items.length) ? 'drop-into' : ''
}
</script>

<template>
  <div class="wl" :class="{ dragging: drag.active }">
    <div class="wl-top">
      <button v-for="f in FILTERS" :key="f.id" class="btn sm" :class="{ on: lists.filter === f.id }" @click="lists.filter = f.id">{{ f.label }}</button>
      <span class="grow" />
      <button class="btn sm" title="Новый список" @click="addList"><Icon name="plus" :size="16" /></button>
    </div>

    <div ref="scroller" class="wl-list scroll">
      <section v-for="(l, li) in lists.all" :key="l.id" class="list" :class="listMark(l.id, li)" :data-list="l.id" :style="{ '--list': l.color }">
        <header
          class="list-head"
          :class="{ current: l.id === lists.activeId, moving: drag.active && drag.kind === 'list' && drag.listId === l.id }"
          @pointerdown="onDown($event, 'list', l.id, li, l.name)"
          @click="toggle(l, $event)"
        >
          <Icon name="chevron" :size="14" :style="{ transform: l.collapsed ? 'rotate(-90deg)' : '' }" />
          <Icon name="flag" :size="14" class="flag" />
          <b>{{ l.name }}</b>
          <span class="muted count">{{ l.items.length }}</span>
          <span v-if="l.id === lists.activeId" class="cur" title="Текущий список: сюда добавляют Alt+W и звёздочка">★</span>
          <span class="grow" />
          <Dropdown align="right">
            <template #trigger="{ toggle: open }">
              <button class="btn sm more" title="Действия со списком" @click.stop="open"><Icon name="sliders" :size="14" /></button>
            </template>
            <template #default="{ close }">
              <button class="menu-item" @click="addTo(l), close()"><Icon name="plus" :size="16" />Добавить инструмент…</button>
              <button class="menu-item" :class="{ on: l.id === lists.activeId }" @click="(lists.activeId = l.id), close()">
                <Icon name="star" :size="16" />Текущий (для Alt+W и ★)
              </button>
              <button class="menu-item" @click="rename(l), close()"><Icon name="pencil" :size="16" />Переименовать…</button>
              <div class="colors">
                <button
                  v-for="c in LIST_COLORS"
                  :key="c"
                  class="swatch"
                  :class="{ on: c === l.color }"
                  :style="{ background: c }"
                  :aria-label="'Цвет ' + c"
                  @click="l.color = c"
                />
                <label class="swatch custom" title="Свой цвет">
                  <input type="color" :value="l.color" @change="l.color = ($event.target as HTMLInputElement).value" />
                </label>
              </div>
              <template v-if="lists.all.length > 1">
                <div class="menu-sep" />
                <button class="menu-item" @click="remove(l), close()"><Icon name="trash" :size="16" />Удалить список</button>
              </template>
            </template>
          </Dropdown>
        </header>

        <template v-if="!l.collapsed">
          <template v-for="(r, i) in l.items" :key="symbolKey(r)">
            <div
              v-if="matchesFilter(r)"
              class="wl-row"
              :class="[
                rowMark(l.id, i, l.items.length),
                { active: sameSymbol(r, activePane.symbol), moving: drag.active && drag.kind === 'item' && drag.listId === l.id && drag.index === i },
              ]"
              :data-row="i"
              :title="`${EXCHANGE_NAMES[r.exchange]} · ${MARKET_NAMES[r.market]}`"
              role="button"
              tabindex="0"
              @pointerdown="onDown($event, 'item', l.id, i, r.symbol)"
              @click="pick(r)"
              @keydown.enter="setSymbol(r)"
            >
              <SideMark :item="r" />
              <b class="sym">{{ r.symbol }}<i v-if="r.exchange !== 'binance' || r.market !== 'futures'">{{ r.exchange === 'bybit' ? 'bb' : 'bn' }}{{ r.market === 'spot' ? '·с' : '' }}</i></b>
              <span class="num">{{ price(r) }}</span>
              <span class="num" :class="(tickers[symbolKey(r)]?.changePct ?? 0) >= 0 ? 'up' : 'down'">{{ fmtPct(tickers[symbolKey(r)]?.changePct) }}</span>
              <span class="num st" :class="status(r)?.cls" :title="status(r)?.title">{{ status(r)?.text ?? '' }}</span>
              <button class="btn sm rm" title="Убрать из списка" @click.stop="removeItem(l.id, i)"><Icon name="x" :size="13" /></button>
            </div>
          </template>
          <p v-if="!l.items.length" class="empty muted">Пусто — перетащите сюда инструмент</p>
        </template>
      </section>
    </div>

    <div v-if="drag.active" class="ghost" :style="{ left: drag.x + 12 + 'px', top: drag.y + 8 + 'px' }">{{ drag.label }}</div>
  </div>
</template>

<style scoped>
.wl {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.wl.dragging {
  cursor: grabbing;
  user-select: none;
}
.wl-top {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 5px 6px 5px 8px;
  border-bottom: 1px solid var(--border);
  flex: none;
}
.wl-top .btn {
  padding: 0 9px;
  color: var(--muted);
}
.wl-top .btn.on {
  color: var(--accent);
}
.grow {
  flex: 1;
}
.wl-list {
  flex: 1;
  min-height: 0;
}
.list {
  position: relative;
}
.list-head {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 4px 0 6px;
  background: var(--panel-2);
  border-bottom: 1px solid var(--border);
  cursor: pointer;
  position: sticky;
  top: 0;
  z-index: 2;
}
/* цвет списка — только флажок, как метка, а не заливка */
.flag {
  color: var(--list);
}
.flag :deep(path) {
  fill: var(--list);
  fill-opacity: 0.85;
}
.list-head b {
  font-size: 12px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.count {
  font-size: 11px;
}
.cur {
  color: var(--warn);
  font-size: 11px;
}
.more {
  color: var(--muted);
  height: 24px;
  min-width: 24px;
}
.wl-row {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr) auto 50px 54px 18px;
  align-items: center;
  column-gap: 5px;
  padding: 0 4px 0 4px;
  height: 30px;
  font-size: 12.5px;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 55%, transparent);
  cursor: pointer;
  position: relative;
}
.wl-row:hover {
  background: var(--hover);
}
.wl-row.active {
  background: var(--accent-soft);
}
.moving {
  opacity: 0.35;
}
/* линия, показывающая, куда встанет перетаскиваемое */
.drop-before::before,
.drop-after::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  height: 2px;
  background: var(--accent);
  z-index: 3;
  pointer-events: none;
}
.drop-before::before {
  top: -1px;
}
.drop-after::after {
  bottom: -1px;
}
.list.drop-into > .list-head {
  box-shadow: inset 0 0 0 2px var(--accent);
}
.sym {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sym i {
  font-style: normal;
  font-weight: 400;
  font-size: 10px;
  color: var(--muted);
  margin-left: 4px;
}
.num {
  text-align: right;
  white-space: nowrap;
}
.st {
  font-weight: 600;
}
.rm {
  color: var(--muted);
  height: 22px;
  min-width: 18px;
  padding: 0;
}
@media (hover: hover) {
  .rm {
    visibility: hidden;
  }
  .wl-row:hover .rm {
    visibility: visible;
  }
}
.empty {
  margin: 0;
  padding: 7px 10px;
  font-size: 12px;
}
.colors {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 6px 10px;
  max-width: 220px;
}
.swatch {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 2px solid transparent;
}
.swatch.on {
  border-color: var(--text);
}
.swatch.custom {
  position: relative;
  overflow: hidden;
  cursor: pointer;
  background: conic-gradient(#f0566b, #e8a838, #1fb28a, #4c8dff, #a78bfa, #f0566b);
}
.swatch.custom input {
  position: absolute;
  inset: -6px;
  width: 40px;
  height: 40px;
  opacity: 0;
  cursor: pointer;
}
.ghost {
  position: fixed;
  z-index: 200;
  padding: 4px 10px;
  border-radius: 6px;
  background: var(--accent);
  color: #fff;
  font-weight: 600;
  font-size: 12px;
  pointer-events: none;
  box-shadow: var(--shadow);
}
@media (max-width: 719px) {
  .wl-row {
    height: 40px;
    grid-template-columns: 26px minmax(0, 1fr) auto 54px 58px 26px;
  }
  .list-head {
    height: 38px;
  }
}
</style>
