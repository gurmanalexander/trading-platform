<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue'
import Icon from './Icon.vue'
import { sameSymbol, symbolKey, EXCHANGE_NAMES, MARKET_NAMES, type SymbolRef } from '../types'
import { activePane, setSymbol } from '../stores/app'
import { settings, state, view, total, sortBy, refresh, resetSettings, startAutoRefresh, MAX_ROWS, type SortKey } from '../stores/screener'
import SideMark from './SideMark.vue'
import ListPicker from './ListPicker.vue'
import ListMenu from './ListMenu.vue'
import Dropdown from './Dropdown.vue'
import { fmtPct, fmtPriceShort, fmtVolume } from '../lib/format'

const showSettings = ref(false)
const stop = startAutoRefresh()
onBeforeUnmount(stop)

// другая биржа или рынок — другой список: запрашиваем сразу
watch(() => [settings.exchange, settings.market], () => {
  picked.value = new Set()
  refresh()
})

// ---------- выбор нескольких монет ----------
// Ctrl+щелчок добавляет монету к выбранным, Shift+щелчок выбирает подряд; на сенсорном экране
// выбор начинается долгим нажатием. Флажок и меню по правой кнопке действуют на все выбранные.

const picked = ref(new Set<string>())
let anchor = ''
const chosen = computed(() => view.value.filter((r) => picked.value.has(symbolKey(r))))
const isPicked = (r: SymbolRef) => picked.value.has(symbolKey(r))

function togglePick(r: SymbolRef) {
  const next = new Set(picked.value)
  const k = symbolKey(r)
  if (next.has(k)) next.delete(k)
  else next.add(k)
  picked.value = next
  anchor = k
}
function pickRange(r: SymbolRef) {
  const rows = view.value
  const to = rows.findIndex((x) => symbolKey(x) === symbolKey(r))
  let from = rows.findIndex((x) => symbolKey(x) === anchor)
  // якоря нет — выбор тянется от открытой сейчас монеты
  if (from < 0) from = rows.findIndex((x) => sameSymbol(x, activePane.value.symbol))
  if (from < 0) from = to
  const next = new Set(picked.value)
  for (let i = Math.min(from, to); i <= Math.max(from, to); i++) next.add(symbolKey(rows[i]))
  picked.value = next
}
function clearPicked() {
  picked.value = new Set()
  anchor = ''
}

// долгое нажатие пальцем
let pressTimer = 0
let pressAt = { x: 0, y: 0 }
let touch = false
let longPressed = false
function onDown(e: PointerEvent, r: SymbolRef) {
  touch = e.pointerType === 'touch'
  longPressed = false
  clearTimeout(pressTimer)
  if (!touch) return
  pressAt = { x: e.clientX, y: e.clientY }
  pressTimer = window.setTimeout(() => {
    longPressed = true
    togglePick(r)
    navigator.vibrate?.(15)
  }, 450)
}
function onMove(e: PointerEvent) {
  if (Math.abs(e.clientX - pressAt.x) + Math.abs(e.clientY - pressAt.y) > 10) clearTimeout(pressTimer)
}
const onUp = () => clearTimeout(pressTimer)
onBeforeUnmount(onUp)

function onRowClick(e: MouseEvent, r: SymbolRef) {
  if (longPressed) {
    longPressed = false
    return
  }
  if (e.shiftKey) pickRange(r)
  else if (e.ctrlKey || e.metaKey || (touch && picked.value.size)) togglePick(r)
  else {
    clearPicked()
    anchor = symbolKey(r)
    setSymbol(r)
  }
}

/** На что действует флажок или меню строки: на все выбранные, если строка среди них, иначе только на неё */
const targetsOf = (r: SymbolRef) => (isPicked(r) && chosen.value.length > 1 ? chosen.value : [r])

// ---------- меню по правой кнопке ----------

const menu = reactive({ open: false, x: 0, y: 0, items: [] as SymbolRef[] })
const menuEl = ref<HTMLElement>()
async function onContext(e: MouseEvent, r: SymbolRef) {
  // на сенсорном экране долгое нажатие уже занято выбором
  if (touch) return
  // правая кнопка по невыбранной строке — работаем только с ней
  if (!isPicked(r)) clearPicked()
  menu.items = targetsOf(r)
  menu.x = e.clientX
  menu.y = e.clientY
  menu.open = true
  await nextTick()
  const el = menuEl.value
  if (!el) return
  menu.x = Math.max(6, Math.min(window.innerWidth - el.offsetWidth - 6, menu.x))
  menu.y = Math.max(6, Math.min(window.innerHeight - el.offsetHeight - 6, menu.y))
}
function closeMenu(e?: Event) {
  if (e && menuEl.value?.contains(e.target as Node)) return
  menu.open = false
}
watch(
  () => menu.open,
  (open) => {
    if (open) {
      document.addEventListener('pointerdown', closeMenu, true)
      document.addEventListener('keydown', onMenuKey, true)
    } else unbindMenu()
  },
)
function onMenuKey(e: KeyboardEvent) {
  if (e.key === 'Escape') menu.open = false
}
function unbindMenu() {
  document.removeEventListener('pointerdown', closeMenu, true)
  document.removeEventListener('keydown', onMenuKey, true)
}
onBeforeUnmount(unbindMenu)

const COLS: { id: SortKey; label: string }[] = [
  { id: 'symbol', label: 'Инструмент' },
  { id: 'price', label: 'Цена' },
  { id: 'change', label: '24ч' },
  { id: 'volume', label: 'Объём' },
]
</script>

<template>
  <div class="sc">
    <div class="sc-top">
      <button class="btn sm filter" :class="{ on: showSettings }" title="Настройки отбора" @click="showSettings = !showSettings">
        <Icon name="filter" :size="15" />
        <span>{{ EXCHANGE_NAMES[settings.exchange] }} · {{ MARKET_NAMES[settings.market] }} · от {{ settings.minVolume }} млн $</span>
      </button>
      <span class="muted count" :title="state.updatedAt ? 'Обновлено ' + new Date(state.updatedAt).toLocaleTimeString('ru-RU') : ''">{{ total.length }}</span>
      <button class="btn sm" title="Обновить" :disabled="state.loading" @click="refresh()"><Icon name="refresh" :size="15" /></button>
    </div>

    <form v-if="showSettings" class="sc-form" @submit.prevent>
      <label>
        <span>Биржа</span>
        <select v-model="settings.exchange" class="field">
          <option value="binance">Binance</option>
          <option value="bybit">Bybit</option>
        </select>
      </label>
      <label>
        <span>Рынок</span>
        <select v-model="settings.market" class="field">
          <option value="futures">Фьючерсы</option>
          <option value="spot">Спот</option>
        </select>
      </label>
      <label>
        <span>Объём за 24ч от, млн $</span>
        <input v-model.number="settings.minVolume" class="field" type="number" min="0" step="5" inputmode="decimal" />
      </label>
      <label>
        <span>Изменение за 24ч от, % (по модулю)</span>
        <input v-model.number="settings.minChange" class="field" type="number" min="0" step="1" inputmode="decimal" />
      </label>
      <label>
        <span>Валюта котировки</span>
        <select v-model="settings.quote" class="field">
          <option value="USDT">Только USDT</option>
          <option value="all">Любая</option>
        </select>
      </label>
      <label>
        <span>Сортировка</span>
        <span class="pair">
          <select v-model="settings.sort" class="field">
            <option value="volume">Объём</option>
            <option value="change">Изменение за 24ч</option>
            <option value="price">Цена</option>
            <option value="symbol">Название</option>
          </select>
          <select v-model="settings.dir" class="field">
            <option value="desc">По убыванию</option>
            <option value="asc">По возрастанию</option>
          </select>
        </span>
      </label>
      <button type="button" class="btn sm reset" @click="resetSettings">Сбросить настройки</button>
    </form>

    <div v-if="chosen.length" class="sc-sel">
      <b>Выбрано: {{ chosen.length }}</b>
      <span class="grow" />
      <Dropdown align="right">
        <template #trigger="{ toggle }">
          <button class="btn sm" title="Добавить выбранные в список, поставить направление" @click="toggle"><Icon name="flag" :size="14" />В список</button>
        </template>
        <ListMenu :items="chosen" />
      </Dropdown>
      <button class="btn sm" title="Снять выбор" @click="clearPicked"><Icon name="close" :size="14" /></button>
    </div>

    <div class="sc-head">
      <button v-for="c in COLS" :key="c.id" class="muted" :class="{ on: settings.sort === c.id, num: c.id !== 'symbol', first: c.id === 'symbol' }" @click="sortBy(c.id)">
        {{ c.label }}
        <Icon v-if="settings.sort === c.id" :name="settings.dir === 'asc' ? 'sortUp' : 'sortDown'" :size="12" />
      </button>
      <span />
    </div>

    <div class="sc-list scroll">
      <div
        v-for="r in view"
        :key="symbolKey(r)"
        class="sc-row"
        :class="{ active: sameSymbol(r, activePane.symbol), picked: isPicked(r) }"
        role="button"
        tabindex="0"
        title="Ctrl+щелчок — выбрать несколько, Shift+щелчок — выбрать подряд, правая кнопка — в список"
        @click="onRowClick($event, r)"
        @keydown.enter="setSymbol(r)"
        @pointerdown="onDown($event, r)"
        @pointermove="onMove"
        @pointerup="onUp"
        @pointercancel="onUp"
        @contextmenu.prevent="onContext($event, r)"
      >
        <span class="name"><SideMark :item="r" /><b>{{ r.symbol }}</b></span>
        <span class="num">{{ fmtPriceShort(r.last) }}</span>
        <span class="num" :class="r.changePct >= 0 ? 'up' : 'down'">{{ fmtPct(r.changePct) }}</span>
        <span class="num muted">{{ fmtVolume(r.usdVolume) }}</span>
        <ListPicker :item="r" :group="targetsOf(r)" />
      </div>
      <p v-if="state.error" class="note muted">{{ state.error }}</p>
      <div v-else-if="state.loading && !view.length" class="note"><div class="spinner" /></div>
      <p v-else-if="!view.length" class="note muted">Под условия ничего не подходит. Смягчите фильтры.</p>
      <p v-else-if="total.length > MAX_ROWS" class="note muted">Показаны первые {{ MAX_ROWS }} из {{ total.length }}.</p>
    </div>

    <Teleport to="body">
      <div v-if="menu.open" ref="menuEl" class="menu sc-menu" :style="{ left: menu.x + 'px', top: menu.y + 'px' }">
        <ListMenu :items="menu.items" />
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.sc {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.sc-top {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 6px 5px 8px;
  border-bottom: 1px solid var(--border);
  flex: none;
}
.filter {
  flex: 1;
  min-width: 0;
  justify-content: flex-start;
  font-size: 12px;
}
.filter span {
  overflow: hidden;
  text-overflow: ellipsis;
}
.count {
  font-size: 12px;
  padding: 0 4px;
}
.sc-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
  flex: none;
  max-height: 60%;
  overflow-y: auto;
}
.sc-form label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--muted);
}
.sc-form .field {
  height: 30px;
  color: var(--text);
}
.pair {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}
.reset {
  align-self: flex-start;
  color: var(--muted);
}
.sc-head,
.sc-row {
  display: grid;
  grid-template-columns: minmax(84px, 1fr) minmax(0, auto) 52px 52px 22px;
  align-items: center;
  column-gap: 6px;
  padding: 0 4px 0 4px;
  font-size: 12.5px;
}
.sc-head {
  height: 30px;
  font-size: 11px;
  border-bottom: 1px solid var(--border);
  flex: none;
}
.sc-head button {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  height: 100%;
  white-space: nowrap;
}
.sc-head button.first {
  padding-left: 21px;
}
.sc-head button.num {
  justify-content: flex-end;
}
.sc-head button:hover,
.sc-head button.on {
  color: var(--text);
}
.sc-list {
  flex: 1;
  min-height: 0;
}
.sc-row {
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
  height: 34px;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 55%, transparent);
  cursor: pointer;
}
.sc-row:hover {
  background: var(--hover);
}
.sc-row.picked {
  background: color-mix(in srgb, var(--accent) 16%, transparent);
}
.sc-row.picked:hover {
  background: color-mix(in srgb, var(--accent) 22%, transparent);
}
.sc-sel {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 6px 4px 10px;
  border-bottom: 1px solid var(--border);
  background: var(--accent-soft);
  font-size: 12.5px;
  flex: none;
}
.sc-sel .grow {
  flex: 1;
}
.sc-row.active {
  background: var(--accent-soft);
  box-shadow: inset 2px 0 0 var(--accent);
}
.name {
  display: flex;
  align-items: center;
  gap: 3px;
  min-width: 0;
}
.sc-row b {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
}
.num {
  text-align: right;
  white-space: nowrap;
}
.note {
  display: grid;
  place-items: center;
  margin: 0;
  padding: 18px 14px;
  text-align: center;
}
@media (max-width: 719px) {
  .sc-row {
    height: 44px;
  }
}
</style>

<style>
.sc-menu {
  position: fixed;
  z-index: 90;
}
</style>
