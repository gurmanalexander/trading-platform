<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import Icon from './Icon.vue'
import Dropdown from './Dropdown.vue'
import SideMark from './SideMark.vue'
import ColumnsMenu from './ColumnsMenu.vue'
import { EXCHANGE_NAMES, MARKET_NAMES, sameSymbol, symbolKey } from '../types'
import { activePane, openSearch, setSymbol } from '../stores/app'
import { pasteFromClipboard } from '../chart/setup'
import { tickers, useTickers } from '../stores/tickers'
import { dayStats, dayProgress, useDayStats } from '../stores/atr'
import { spentTone } from '../lib/atr'
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
  LIST_COLS,
  type ListCol,
  type SideFilter,
  type WatchItem,
  type WatchList,
} from '../stores/watchlist'
import { fmtPct, fmtPrice, fmtVolume, precisionOf } from '../lib/format'
import { fmtR } from '../chart/position'

useTickers(() => visibleItems.value)
useDayStats(() => visibleItems.value)
useTrackedPositions(() => visibleItems.value)

const FILTERS: { id: SideFilter; label: string; title: string }[] = [
  { id: 'all', label: 'Все', title: 'Показывать все монеты' },
  { id: 'long', label: '▲ Лонг', title: 'Скрыть монеты, отмеченные как шорт' },
  { id: 'short', label: '▼ Шорт', title: 'Скрыть монеты, отмеченные как лонг' },
]

// Столбцы: название — всегда, остальные выбираются
const HEAD: Record<ListCol, string> = { price: 'Цена', change: '24ч', volume: 'Объём', result: 'Итог', atr: 'ATR' }
const WIDTH: Record<ListCol, string> = { price: 'minmax(58px, auto)', change: '56px', volume: '50px', result: '54px', atr: '40px' }
const cols = computed(() => LIST_COLS.filter((c) => lists.cols.includes(c.id)))
// слева — метка цвета списка, затем тикер (все тикеры начинаются с одной линии), справа — числа
const grid = computed(() => ({ gridTemplateColumns: ['12px', 'minmax(0, 1fr)', ...cols.value.map((c) => WIDTH[c.id]), '18px'].join(' ') }))
const tone = (pct: number | undefined) => (!pct ? 'muted' : pct > 0 ? 'up' : 'down')

/** Сколько дневного ATR пройдено от открытия дня */
function atrCell(r: WatchItem) {
  const key = symbolKey(r)
  const s = dayStats[key]
  const last = tickers[key]?.last
  if (!s || !last) return null
  const v = dayProgress(s, last).fromOpen
  return { text: v.toFixed(0) + '%', cls: spentTone(v) }
}

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

// новый список — строкой прямо в панели: название и цвет
const draft = reactive({ open: false, name: '', color: LIST_COLORS[0] })
const draftInput = ref<HTMLInputElement>()
function startList() {
  draft.open = !draft.open
  if (!draft.open) return
  draft.name = ''
  draft.color = LIST_COLORS[lists.all.length % LIST_COLORS.length]
  nextTick(() => draftInput.value?.focus())
}
function addList() {
  const name = draft.name.trim()
  if (!name) return draftInput.value?.focus()
  createList(name.slice(0, 40), draft.color)
  draft.open = false
  nextTick(() => scroller.value?.scrollTo({ top: scroller.value.scrollHeight, behavior: 'smooth' }))
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
      <div class="seg" role="group" aria-label="Фильтр по направлению">
        <button v-for="f in FILTERS" :key="f.id" :class="{ on: lists.filter === f.id, [f.id]: true }" :title="f.title" @click="lists.filter = f.id">{{ f.label }}</button>
      </div>
      <span class="grow" />
      <button class="btn sm" title="Вставить из буфера: строки с монетами попадут в текущий список" @click="pasteFromClipboard()"><Icon name="paste" :size="16" /></button>
      <ColumnsMenu :model-value="lists.cols" :options="LIST_COLS" @update:model-value="lists.cols = $event as ListCol[]" />
      <button class="btn sm" :class="{ on: draft.open }" title="Новый список" @click="startList"><Icon name="listPlus" :size="16" /></button>
    </div>

    <form v-if="draft.open" class="draft" @submit.prevent="addList" @keydown.esc.stop="draft.open = false">
      <input ref="draftInput" v-model="draft.name" class="field" maxlength="40" placeholder="Название списка" autocomplete="off" />
      <div class="draft-row">
        <button
          v-for="c in LIST_COLORS"
          :key="c"
          type="button"
          class="swatch"
          :class="{ on: c === draft.color }"
          :style="{ background: c }"
          :aria-label="'Цвет ' + c"
          @click="draft.color = c"
        />
        <span class="grow" />
        <button type="button" class="btn sm" @click="draft.open = false">Отмена</button>
        <button class="btn sm primary" type="submit" :disabled="!draft.name.trim()">Создать</button>
      </div>
    </form>

    <div class="wl-cols" :style="grid">
      <span />
      <span>Тикер</span>
      <span v-for="c in cols" :key="c.id" class="num" :title="c.hint || c.label">{{ HEAD[c.id] }}</span>
      <span />
    </div>

    <div ref="scroller" class="wl-list scroll">
      <section v-for="(l, li) in lists.all" :key="l.id" class="list" :class="listMark(l.id, li)" :data-list="l.id" :style="{ '--list': l.color }">
        <header
          class="list-head"
          :class="{ current: l.id === lists.activeId, closed: l.collapsed, moving: drag.active && drag.kind === 'list' && drag.listId === l.id }"
          :title="l.id === lists.activeId ? 'Текущий список: сюда добавляют Alt+W и вставка' : ''"
          @pointerdown="onDown($event, 'list', l.id, li, l.name)"
          @click="toggle(l, $event)"
        >
          <Icon name="chevron" :size="13" class="chev" />
          <b>{{ l.name }}</b>
          <span class="count">{{ l.items.length }}</span>
          <span v-if="l.id === lists.activeId" class="cur">★</span>
          <span class="grow" />
          <span class="head-tools">
            <button class="btn sm" title="Добавить монету в этот список" @click.stop="addTo(l)"><Icon name="plus" :size="15" /></button>
            <Dropdown align="right">
              <template #trigger="{ toggle: open }">
                <button class="btn sm" title="Настройки списка" @click.stop="open"><Icon name="more" :size="15" /></button>
              </template>
              <template #default="{ close }">
                <button class="menu-item" :class="{ on: l.id === lists.activeId }" @click="(lists.activeId = l.id), close()">
                  <Icon name="star" :size="16" />Сделать текущим
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
          </span>
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
              :style="grid"
              :data-row="i"
              :title="`${EXCHANGE_NAMES[r.exchange]} · ${MARKET_NAMES[r.market]}`"
              role="button"
              tabindex="0"
              @pointerdown="onDown($event, 'item', l.id, i, r.symbol)"
              @click="pick(r)"
              @keydown.enter="setSymbol(r)"
            >
              <i class="tag" />
              <span class="name">
                <b class="sym">{{ r.symbol }}<i v-if="r.exchange !== 'binance' || r.market !== 'futures'">{{ r.exchange === 'bybit' ? 'bb' : 'bn' }}{{ r.market === 'spot' ? '·с' : '' }}</i></b>
                <SideMark :item="r" />
              </span>
              <template v-for="c in cols" :key="c.id">
                <span v-if="c.id === 'price'" class="num" :class="tone(tickers[symbolKey(r)]?.changePct)" :title="'За сутки ' + fmtPct(tickers[symbolKey(r)]?.changePct)">{{ price(r) }}</span>
                <span v-else-if="c.id === 'change'" class="num" :class="tone(tickers[symbolKey(r)]?.changePct)">{{ fmtPct(tickers[symbolKey(r)]?.changePct) }}</span>
                <span v-else-if="c.id === 'volume'" class="num muted">{{ fmtVolume(tickers[symbolKey(r)]?.quoteVolume) }}</span>
                <span v-else-if="c.id === 'result'" class="num st" :class="status(r)?.cls" :title="status(r)?.title">{{ status(r)?.text ?? '' }}</span>
                <span v-else class="num" :class="atrCell(r)?.cls" title="Дневной ATR исчерпан от открытия дня">{{ atrCell(r)?.text ?? '' }}</span>
              </template>
              <button class="btn sm rm" title="Убрать из списка" @click.stop="removeItem(l.id, i)"><Icon name="x" :size="13" /></button>
            </div>
          </template>
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
  padding: 6px 6px 6px 8px;
  flex: none;
}
/* фильтр по направлению — переключатель из трёх положений */
.seg {
  display: flex;
  padding: 2px;
  border-radius: 7px;
  background: var(--hover);
}
.seg button {
  height: 24px;
  padding: 0 9px;
  border-radius: 5px;
  font-size: 12px;
  color: var(--muted);
  white-space: nowrap;
}
.seg button.on {
  background: var(--panel);
  color: var(--text);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.14);
}
.seg button.on.long {
  color: var(--up);
}
.seg button.on.short {
  color: var(--down);
}
.grow {
  flex: 1;
}
.draft {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0 8px 8px;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg);
  flex: none;
}
.draft .field {
  height: 30px;
}
.draft-row {
  display: flex;
  align-items: center;
  gap: 5px;
}
.draft-row .swatch {
  width: 16px;
  height: 16px;
}
.wl-cols {
  display: grid;
  align-items: center;
  column-gap: 6px;
  padding: 0 6px 5px 4px;
  font-size: 10.5px;
  color: var(--muted);
  border-bottom: 1px solid var(--border);
  flex: none;
}
.wl-list {
  flex: 1;
  min-height: 0;
  overflow-x: hidden;
}
.list {
  position: relative;
}
/* заголовок списка — как раздел в ТВ: с отступом, без подложки; тикеры под ним стоят левее и читаются столбцом */
.list-head {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 34px;
  padding: 4px 2px 0 22px;
  background: var(--panel);
  cursor: pointer;
  position: sticky;
  top: 0;
  z-index: 2;
}
.chev {
  color: var(--muted);
  transition: transform 0.12s;
}
.list-head.closed .chev {
  transform: rotate(-90deg);
}
.list-head b {
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.list-head:hover b,
.list-head.current b {
  color: var(--text);
}
.count {
  font-size: 10.5px;
  color: var(--muted);
}
.cur {
  color: var(--warn);
  font-size: 10px;
}
.head-tools {
  display: flex;
}
.head-tools .btn {
  color: var(--muted);
  height: 24px;
  min-width: 24px;
  padding: 0;
}
@media (hover: hover) {
  .head-tools {
    visibility: hidden;
  }
  .list-head:hover .head-tools,
  .head-tools:focus-within {
    visibility: visible;
  }
}
.wl-row {
  display: grid;
  align-items: center;
  column-gap: 6px;
  padding: 0 6px 0 4px;
  height: 32px;
  font-size: 13px;
  cursor: pointer;
  position: relative;
}
.wl-row:hover {
  background: var(--hover);
}
.wl-row.active {
  background: var(--accent-soft);
  box-shadow: inset 2px 0 0 var(--accent);
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
/* метка цвета списка у левого края строки — вымпел, как флажок в ТВ */
.tag {
  width: 8px;
  height: 12px;
  background: var(--list);
  clip-path: polygon(0 0, 100% 0, 62% 50%, 100% 100%, 0 100%);
}
.name {
  display: flex;
  align-items: center;
  gap: 2px;
  min-width: 0;
}
.sym {
  font-weight: 500;
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
  font-variant-numeric: tabular-nums;
}
.st {
  font-weight: 600;
}
.wl-row .btn.rm {
  color: var(--muted);
  height: 22px;
  width: 18px;
  min-width: 0;
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
  }
  .list-head {
    height: 38px;
  }
}
</style>
