<script setup lang="ts">
import { computed, reactive } from 'vue'
import Icon from './Icon.vue'
import Dropdown from './Dropdown.vue'
import LayoutIcon from './LayoutIcon.vue'
import PhoneMenu from './PhoneMenu.vue'
import { EXCHANGE_NAMES, MARKET_NAMES } from '../types'
import {
  app,
  activeIndex,
  activePane,
  paneCount,
  isPhone,
  viewport,
  theme,
  openSearch,
  showPanel,
  togglePanel,
  setTf,
  toggleFavTf,
  setLayout,
  sameLayout,
  saveTemplate,
  updateTemplate,
  deleteTemplate,
  applyTemplate,
  bindTemplate,
  toast,
  CHART_TYPES,
  LAYOUT_PRESETS,
  MAX_GROUPS,
  MAX_PER_GROUP,
  MAX_PANES,
  type ThemePref,
} from '../stores/app'
import { TIMEFRAMES, getTf } from '../lib/timeframes'

const pane = activePane
const favorites = computed(() => TIMEFRAMES.filter((t) => app.favTfs.includes(t.id)))
// избранные интервалы в строку помещаются только на достаточно широком экране
const inlineTfs = computed(() => viewport.w >= 900 && favorites.value.length > 0)
const tfInMenu = computed(() => !inlineTfs.value || !app.favTfs.includes(pane.value.tf))
const chartType = computed(() => CHART_TYPES.find((t) => t.id === pane.value.chartType) ?? CHART_TYPES[0])
const canFullscreen = !!document.documentElement.requestFullscreen
const template = computed(() => app.templates.find((t) => t.id === app.templateId))

const THEMES: { id: ThemePref; label: string; icon: string }[] = [
  { id: 'system', label: 'Как в системе', icon: 'monitor' },
  { id: 'dark', label: 'Тёмная', icon: 'moon' },
  { id: 'light', label: 'Светлая', icon: 'sun' },
]
const SYNC: { id: keyof typeof app.sync; label: string; hint: string }[] = [
  { id: 'symbol', label: 'Инструмент', hint: 'Смена инструмента во всех окнах сразу' },
  { id: 'interval', label: 'Интервал', hint: 'Один интервал во всех окнах' },
  { id: 'crosshair', label: 'Перекрестие', hint: 'Курсор показывает тот же момент во всех окнах' },
  { id: 'time', label: 'Время', hint: 'Прокрутка одного окна двигает остальные к той же дате' },
]

// ---------- своя раскладка ----------

const custom = reactive({ dir: app.layout.dir, groups: app.layout.groups.slice() })
const customTotal = computed(() => custom.groups.reduce((a, b) => a + b, 0))
function changeGroups(step: number) {
  if (step > 0 && custom.groups.length < MAX_GROUPS && customTotal.value < MAX_PANES) custom.groups.push(1)
  else if (step < 0 && custom.groups.length > 1) custom.groups.pop()
}
function changeCells(i: number, step: number) {
  const next = custom.groups[i] + step
  if (next < 1 || next > MAX_PER_GROUP || (step > 0 && customTotal.value >= MAX_PANES)) return
  custom.groups[i] = next
}

// ---------- шаблоны ----------

function saveNew() {
  const name = prompt('Название шаблона', template.value ? template.value.name + ' 2' : 'Мой шаблон')?.trim()
  if (!name) return
  const withSymbols = confirm('Запомнить в шаблоне инструменты окон?\n\nОК — шаблон откроет те же инструменты.\nОтмена — шаблон применится к текущему инструменту.')
  saveTemplate(name.slice(0, 40), withSymbols)
  toast(`Шаблон «${name}» сохранён`)
}
function overwrite(id: string, name: string) {
  updateTemplate(id)
  toast(`Шаблон «${name}» обновлён`)
}
function remove(id: string, name: string) {
  if (confirm(`Удалить шаблон «${name}»?`)) deleteTemplate(id)
}

function fullscreen() {
  if (document.fullscreenElement) document.exitFullscreen()
  else document.documentElement.requestFullscreen().catch(() => {})
}
</script>

<template>
  <header class="topbar">
    <button class="btn symbol" title="Поиск инструмента" @click="openSearch()">
      <Icon name="search" :size="16" />
      <b>{{ pane.symbol.symbol }}</b>
      <span class="tag" :class="pane.symbol.exchange">{{ EXCHANGE_NAMES[pane.symbol.exchange] }} · {{ MARKET_NAMES[pane.symbol.market] }}</span>
    </button>

    <span class="sep" />

    <template v-if="inlineTfs">
      <button v-for="t in favorites" :key="t.id" class="btn tf" :class="{ on: pane.tf === t.id }" @click="setTf(t.id)">
        {{ t.label }}
      </button>
    </template>
    <Dropdown>
      <template #trigger="{ toggle }">
        <button class="btn" :class="{ on: tfInMenu }" title="Интервал: выбор и избранные" @click="toggle">
          <template v-if="tfInMenu">{{ getTf(pane.tf).label }}</template>
          <Icon name="chevron" :size="14" />
        </button>
      </template>
      <template #default="{ close }">
        <div v-for="t in TIMEFRAMES" :key="t.id" class="tf-row">
          <button class="menu-item" :class="{ on: pane.tf === t.id }" @click="setTf(t.id), close()">{{ t.label }}</button>
          <button
            class="btn sm star"
            :class="{ on: app.favTfs.includes(t.id) }"
            :title="app.favTfs.includes(t.id) ? 'Убрать с панели' : 'Показывать на панели'"
            @click="toggleFavTf(t.id)"
          >
            <Icon name="star" :size="15" />
          </button>
        </div>
      </template>
    </Dropdown>

    <!-- телефон: вкладки окон раскладки; подпись — интервал окна -->
    <div v-if="isPhone && paneCount > 1" class="pane-tabs" role="tablist" aria-label="Окна раскладки">
      <button
        v-for="i in paneCount"
        :key="i"
        role="tab"
        :class="{ on: activeIndex === i - 1 }"
        :title="`Окно ${i}: ${app.panes[i - 1].symbol.symbol}`"
        @click="app.active = i - 1"
      >
        {{ getTf(app.panes[i - 1].tf).label }}
      </button>
    </div>

    <span v-if="!isPhone" class="sep" />

    <Dropdown v-if="!isPhone">
      <template #trigger="{ toggle }">
        <button class="btn" title="Вид графика" @click="toggle"><Icon :name="chartType.icon" /></button>
      </template>
      <template #default="{ close }">
        <button
          v-for="t in CHART_TYPES"
          :key="t.id"
          class="menu-item"
          :class="{ on: pane.chartType === t.id }"
          @click="(pane.chartType = t.id), close()"
        >
          <Icon :name="t.icon" :size="16" />{{ t.label }}
        </button>
      </template>
    </Dropdown>

    <button v-if="!isPhone" class="btn" title="Индикаторы (/)" @click="app.indicatorsOpen = true">
      <Icon name="fx" /><span class="wide">Индикаторы</span>
    </button>
    <button v-if="!isPhone" class="btn" title="Оповещения (Alt+A)" @click="showPanel('alerts')"><Icon name="bell" /></button>
    <button v-if="isPhone" class="btn" :class="{ on: app.drawBarOpen }" title="Рисование" @click="app.drawBarOpen = !app.drawBarOpen">
      <Icon name="pencil" />
    </button>
    <span class="grow" />
    <PhoneMenu v-if="isPhone" />

    <Dropdown v-if="!isPhone" align="right">
      <template #trigger="{ toggle }">
        <button class="btn" title="Синхронизация окон" @click="toggle"><Icon name="link" /></button>
      </template>
      <div class="menu-title">Синхронизация окон</div>
      <label v-for="o in SYNC" :key="o.id" class="menu-item check" :title="o.hint">
        <input v-model="app.sync[o.id]" type="checkbox" />
        {{ o.label }}
      </label>
    </Dropdown>

    <Dropdown v-if="!isPhone" align="right">
      <template #trigger="{ toggle }">
        <button class="btn" title="Раскладка окон" @click="toggle"><LayoutIcon :def="app.layout" /></button>
      </template>
      <template #default="{ close }">
        <div class="menu-title">Раскладка</div>
        <div class="layouts">
          <button
            v-for="(def, i) in LAYOUT_PRESETS"
            :key="i"
            class="btn"
            :class="{ on: sameLayout(def, app.layout) }"
            :title="`Окон: ${def.groups.reduce((a, b) => a + b, 0)}`"
            @click="setLayout(def), close()"
          >
            <LayoutIcon :def="def" />
          </button>
        </div>
        <div class="menu-sep" />
        <div class="menu-title">Своя раскладка</div>
        <div class="custom">
          <div class="custom-row">
            <button class="btn sm" :class="{ on: custom.dir === 'rows' }" @click="custom.dir = 'rows'">Ряды</button>
            <button class="btn sm" :class="{ on: custom.dir === 'cols' }" @click="custom.dir = 'cols'">Колонки</button>
            <span class="grow" />
            <button class="btn sm" title="Убрать" @click="changeGroups(-1)">−</button>
            <span class="num">{{ custom.groups.length }}</span>
            <button class="btn sm" title="Добавить" @click="changeGroups(1)">+</button>
          </div>
          <div v-for="(n, i) in custom.groups" :key="i" class="custom-row">
            <span class="muted">{{ custom.dir === 'rows' ? 'Ряд' : 'Колонка' }} {{ i + 1 }}: окон</span>
            <span class="grow" />
            <button class="btn sm" @click="changeCells(i, -1)">−</button>
            <span class="num">{{ n }}</span>
            <button class="btn sm" @click="changeCells(i, 1)">+</button>
          </div>
          <div class="custom-row">
            <LayoutIcon :def="custom" />
            <span class="muted">окон: {{ customTotal }} из {{ MAX_PANES }}</span>
            <span class="grow" />
            <button class="btn primary sm" @click="setLayout(custom), close()">Применить</button>
          </div>
        </div>
      </template>
    </Dropdown>

    <Dropdown v-if="!isPhone" align="right">
      <template #trigger="{ toggle }">
        <button class="btn" title="Шаблоны: раскладка и настройки всех окон" @click="toggle">
          <Icon name="bookmark" /><span v-if="template" class="wide tpl-name">{{ template.name }}</span>
        </button>
      </template>
      <template #default="{ close }">
        <div class="menu-title">Шаблоны</div>
        <div v-for="t in app.templates" :key="t.id" class="tpl-row">
          <button class="menu-item" :class="{ on: t.id === app.templateId }" :title="t.withSymbols ? 'С инструментами' : 'Для текущего инструмента'" @click="applyTemplate(t.id), close()">
            {{ t.name }}
          </button>
          <button
            class="btn sm"
            :class="{ on: app.tabTemplates.screener === t.id }"
            title="Включать этот шаблон при открытии вкладки «Отбор»"
            @click="bindTemplate('screener', t.id)"
          >
            <Icon name="filter" :size="15" />
          </button>
          <button
            class="btn sm"
            :class="{ on: app.tabTemplates.watchlist === t.id }"
            title="Включать этот шаблон при открытии вкладки «Список»"
            @click="bindTemplate('watchlist', t.id)"
          >
            <Icon name="list" :size="15" />
          </button>
          <button class="btn sm" title="Перезаписать текущим состоянием" @click="overwrite(t.id, t.name)"><Icon name="save" :size="15" /></button>
          <button class="btn sm" title="Удалить" @click="remove(t.id, t.name)"><Icon name="trash" :size="15" /></button>
        </div>
        <p class="menu-note muted">
          Шаблон запоминает раскладку, интервалы, вид графиков, индикаторы и синхронизацию.
          <template v-if="app.templates.length">Кнопки с воронкой и списком привязывают шаблон к вкладке: он включится сам, когда вы её откроете.</template>
        </p>
        <div class="menu-sep" />
        <button class="menu-item" @click="saveNew(), close()"><Icon name="plus" :size="16" />Сохранить как новый…</button>
      </template>
    </Dropdown>

    <Dropdown v-if="!isPhone" align="right">
      <template #trigger="{ toggle }">
        <button class="btn" title="Тема" @click="toggle"><Icon :name="theme === 'dark' ? 'moon' : 'sun'" /></button>
      </template>
      <template #default="{ close }">
        <button v-for="t in THEMES" :key="t.id" class="menu-item" :class="{ on: app.themePref === t.id }" @click="(app.themePref = t.id), close()">
          <Icon :name="t.icon" :size="16" />{{ t.label }}
        </button>
      </template>
    </Dropdown>
    <button v-if="canFullscreen && !isPhone" class="btn" title="Во весь экран (Shift+F)" @click="fullscreen"><Icon name="maximize" /></button>
    <button v-if="!isPhone" class="btn" title="Горячие клавиши" @click="app.hotkeysOpen = true"><Icon name="help" /></button>
    <button v-if="!isPhone" class="btn" :class="{ on: app.panelOpen }" title="Боковая панель" @click="togglePanel(app.panel)">
      <Icon name="panel" />
    </button>
  </header>
</template>

<style scoped>
.topbar {
  display: flex;
  align-items: center;
  gap: 2px;
  height: calc(var(--ctl) + 10px);
  padding: 0 6px;
  padding-top: env(safe-area-inset-top);
  box-sizing: content-box;
  background: var(--panel);
  border-bottom: 1px solid var(--border);
  overflow-x: auto;
  scrollbar-width: none;
  flex: none;
}
.topbar::-webkit-scrollbar {
  display: none;
}
.symbol b {
  font-size: 14px;
}
.tf {
  padding: 0 7px;
  min-width: 0;
}
.pane-tabs {
  display: flex;
  flex: none;
  margin-left: 4px;
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow: hidden;
}
.pane-tabs button {
  height: calc(var(--ctl) - 6px);
  padding: 0 9px;
  font-size: 12px;
  color: var(--muted);
}
.pane-tabs button + button {
  border-left: 1px solid var(--border);
}
.pane-tabs button.on {
  color: var(--accent);
  background: var(--accent-soft);
}
.sep {
  width: 1px;
  height: 20px;
  margin: 0 4px;
  background: var(--border);
  flex: none;
}
.grow {
  flex: 1;
}
.tf-row,
.tpl-row {
  display: flex;
  align-items: center;
  gap: 2px;
}
.tf-row .menu-item,
.tpl-row .menu-item {
  flex: 1;
  min-width: 90px;
}
.tpl-row .menu-item {
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  display: block;
}
.star {
  color: var(--muted);
}
.star.on {
  background: none;
  color: var(--warn);
}
.star.on :deep(path) {
  fill: currentColor;
}
.tpl-name {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.menu-title {
  padding: 6px 10px 4px;
  font-size: 11px;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.menu-note {
  margin: 0;
  padding: 4px 10px 8px;
  max-width: 250px;
  font-size: 12px;
  white-space: normal;
}
.check {
  cursor: pointer;
}
.check input {
  accent-color: var(--accent);
  width: 15px;
  height: 15px;
  margin: 0;
}
.layouts {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 2px;
  padding: 0 4px 4px;
}
.custom {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 0 8px 8px;
  min-width: 230px;
}
.custom-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.custom .num {
  min-width: 14px;
  text-align: center;
}
.custom .btn.sm {
  padding: 0 8px;
}
@media (max-width: 1099px) {
  .wide {
    display: none;
  }
}
@media (max-width: 419px) {
  .symbol .tag {
    display: none;
  }
}
</style>
