<script setup lang="ts">
import { computed, reactive } from 'vue'
import Icon from './Icon.vue'
import Dropdown from './Dropdown.vue'
import LayoutIcon from './LayoutIcon.vue'
import TfDropdown from './TfDropdown.vue'
import { EXCHANGE_NAMES, MARKET_NAMES } from '../types'
import {
  app,
  activeIndex,
  activePane,
  paneCount,
  isPhone,
  viewport,
  openSearch,
  showPanel,
  togglePanel,
  setTf,
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
import { unreadAlerts } from '../stores/alerts'
import { cloud } from '../stores/cloud'
import { chartAt } from '../chart/registry'
import { donate } from '../lib/donate'
import { copyAll, copyCanvas, snapshotAll } from '../chart/snapshot'
import { t, i18n, LANGS } from '../lib/i18n'

const pane = activePane
const favorites = computed(() => TIMEFRAMES.filter((t) => app.favTfs.includes(t.id)))
// избранные интервалы в строку помещаются только на достаточно широком экране
const inlineTfs = computed(() => viewport.w >= 900 && favorites.value.length > 0)
const tfInMenu = computed(() => !inlineTfs.value || !app.favTfs.includes(pane.value.tf))
const chartType = computed(() => CHART_TYPES.find((t) => t.id === pane.value.chartType) ?? CHART_TYPES[0])
const canFullscreen = !!document.documentElement.requestFullscreen
const template = computed(() => app.templates.find((t) => t.id === app.templateId))
const favTemplates = computed(() => app.templates.filter((t) => t.fav !== false))
/** Подпись кнопки избранного шаблона — первый символ названия */
const initial = (name: string) => [...name.trim()][0]?.toUpperCase() ?? '?'

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
  const name = prompt(t('Название шаблона'), template.value ? template.value.name + ' 2' : t('Мой шаблон'))?.trim()
  if (!name) return
  const withSymbols = confirm(
    [
      t('Запомнить в шаблоне инструменты окон?'),
      '',
      t('ОК — шаблон откроет те же инструменты.'),
      t('Отмена — шаблон применится к текущему инструменту.'),
    ].join('\n'),
  )
  saveTemplate(name.slice(0, 40), withSymbols)
  toast(t('Шаблон «{name}» сохранён', { name }))
}
function overwrite(id: string, name: string) {
  updateTemplate(id)
  toast(t('Шаблон «{name}» обновлён', { name }))
}
function remove(id: string, name: string) {
  if (confirm(t('Удалить шаблон «{name}»?', { name }))) deleteTemplate(id)
}

function fullscreen() {
  if (document.fullscreenElement) document.exitFullscreen()
  else document.documentElement.requestFullscreen().catch(() => {})
}
</script>

<template>
  <header class="topbar">
    <button class="btn symbol" :title="t('Поиск инструмента')" @click="openSearch()">
      <Icon name="search" :size="16" />
      <b>{{ pane.symbol.symbol }}</b>
      <span class="tag" :class="pane.symbol.exchange">{{ EXCHANGE_NAMES[pane.symbol.exchange] }} · {{ MARKET_NAMES[pane.symbol.market] }}</span>
    </button>

    <span class="sep" />

    <template v-if="inlineTfs">
      <button v-for="f in favorites" :key="f.id" class="btn tf" :class="{ on: pane.tf === f.id }" @click="setTf(f.id)">
        {{ f.label }}
      </button>
    </template>
    <TfDropdown :label="tfInMenu" />

    <!-- телефон: вкладки окон раскладки; подпись — интервал окна -->
    <div v-if="isPhone && paneCount > 1" class="pane-tabs" role="tablist" :aria-label="t('Окна раскладки')">
      <button
        v-for="i in paneCount"
        :key="i"
        role="tab"
        :class="{ on: activeIndex === i - 1 }"
        :title="t('Окно {n}: {symbol}', { n: i, symbol: app.panes[i - 1].symbol.symbol })"
        @click="app.active = i - 1"
      >
        {{ getTf(app.panes[i - 1].tf).label }}
      </button>
      <button class="all" :class="{ on: app.phoneStack }" :title="t('Показывать все окна сразу')" @click="app.phoneStack = !app.phoneStack"><Icon name="windows" :size="16" /></button>
    </div>

    <span v-if="!isPhone" class="sep" />

    <Dropdown v-if="!isPhone">
      <template #trigger="{ toggle }">
        <button class="btn" :title="t('Вид графика')" @click="toggle"><Icon :name="chartType.icon" /></button>
      </template>
      <template #default="{ close }">
        <button
          v-for="ct in CHART_TYPES"
          :key="ct.id"
          class="menu-item"
          :class="{ on: pane.chartType === ct.id }"
          @click="(pane.chartType = ct.id), close()"
        >
          <Icon :name="ct.icon" :size="16" />{{ t(ct.label) }}
        </button>
        <div class="menu-sep" />
        <label class="menu-item check" :title="t('При увеличении бары не толстеют, как «Тонкие бары» в TradingView')">
          <input v-model="app.view.thinBars" type="checkbox" />
          {{ t('Тонкие бары') }}
        </label>
        <label class="menu-item check" :title="t('Горизонтальная линия от последнего бара; цена и таймер на шкале остаются')">
          <input v-model="app.view.priceLine" type="checkbox" />
          {{ t('Линия текущей цены') }}
        </label>
      </template>
    </Dropdown>

    <button v-if="!isPhone" class="btn" :title="t('Индикаторы (/)')" @click="app.indicatorsOpen = true">
      <Icon name="fx" /><span class="wide">{{ t('Индикаторы') }}</span>
    </button>
    <button v-if="!isPhone" class="btn bell" :title="unreadAlerts ? t('Оповещения: непрочитанных {n}', { n: unreadAlerts }) : t('Оповещения (Alt+A)')" @click="showPanel('alerts')">
      <Icon :name="unreadAlerts ? 'bellRing' : 'bell'" /><i v-if="unreadAlerts" class="count">{{ unreadAlerts }}</i>
    </button>
    <button v-if="isPhone" class="btn" :class="{ on: app.drawBarOpen }" :title="t('Рисование')" @click="app.drawBarOpen = !app.drawBarOpen">
      <Icon name="pencil" />
    </button>
    <span class="grow" />

    <!-- шаблоны: избранные — кнопками (первая буква названия), остальное — в меню -->
    <template v-if="!isPhone">
      <button
        v-for="tp in favTemplates"
        :key="tp.id"
        class="btn tpl-fav"
        :class="{ on: tp.id === app.templateId }"
        :title="t('Шаблон «{name}»', { name: tp.name })"
        @click="applyTemplate(tp.id)"
      >
        {{ initial(tp.name) }}
      </button>
      <Dropdown align="right">
        <template #trigger="{ toggle }">
          <button class="btn" :title="t('Шаблоны: раскладка и настройки всех окон')" @click="toggle">
            <Icon name="template" /><Icon name="chevron" :size="13" class="caret" />
          </button>
        </template>
        <template #default="{ close }">
          <div class="menu-title">{{ t('Шаблоны') }}</div>
          <div v-for="tp in app.templates" :key="tp.id" class="tpl-row">
            <button
              class="btn sm star"
              :class="{ on: tp.fav !== false }"
              :title="tp.fav !== false ? t('Убрать кнопку шаблона с верхней панели') : t('Показывать кнопкой на верхней панели')"
              @click="tp.fav = tp.fav === false"
            >
              <Icon name="star" :size="16" />
            </button>
            <button class="menu-item" :class="{ on: tp.id === app.templateId }" :title="tp.withSymbols ? t('С инструментами') : t('Для текущего инструмента')" @click="applyTemplate(tp.id), close()">
              {{ tp.name }}
            </button>
            <button
              class="btn sm"
              :class="{ on: app.tabTemplates.screener === tp.id }"
              :title="t('Включать этот шаблон при открытии вкладки «Отбор»')"
              @click="bindTemplate('screener', tp.id)"
            >
              <Icon name="filter" :size="16" />
            </button>
            <button
              class="btn sm"
              :class="{ on: app.tabTemplates.watchlist === tp.id }"
              :title="t('Включать этот шаблон при открытии вкладки «Список»')"
              @click="bindTemplate('watchlist', tp.id)"
            >
              <Icon name="list" :size="16" />
            </button>
            <button class="btn sm" :title="t('Перезаписать текущим состоянием')" @click="overwrite(tp.id, tp.name)"><Icon name="save" :size="16" /></button>
            <button class="btn sm" :title="t('Удалить')" @click="remove(tp.id, tp.name)"><Icon name="trash" :size="16" /></button>
          </div>
          <p class="menu-note muted">
            {{ t('Шаблон запоминает раскладку, интервалы, вид графиков, индикаторы и синхронизацию окон.') }}
            <template v-if="app.templates.length">{{ t('Звёздочка ставит кнопку шаблона на верхнюю панель; воронка и список привязывают его к вкладке.') }}</template>
          </p>
          <div class="menu-sep" />
          <button class="menu-item" @click="saveNew(), close()"><Icon name="plus" :size="16" />{{ t('Сохранить как новый…') }}</button>
        </template>
      </Dropdown>
      <span class="sep" />
    </template>

    <!-- раскладка окон и их синхронизация -->
    <Dropdown v-if="!isPhone" align="right">
      <template #trigger="{ toggle }">
        <button class="btn" :title="t('Раскладка и синхронизация окон')" @click="toggle"><LayoutIcon :def="app.layout" /><Icon name="chevron" :size="13" class="caret" /></button>
      </template>
      <template #default="{ close }">
        <div class="menu-title">{{ t('Раскладка') }}</div>
        <div class="layouts">
          <button
            v-for="(def, i) in LAYOUT_PRESETS"
            :key="i"
            class="btn"
            :class="{ on: sameLayout(def, app.layout) }"
            :title="t('Окон: {n}', { n: def.groups.reduce((a, b) => a + b, 0) })"
            @click="setLayout(def), close()"
          >
            <LayoutIcon :def="def" />
          </button>
        </div>
        <div class="menu-sep" />
        <div class="menu-title">{{ t('Своя раскладка') }}</div>
        <div class="custom">
          <div class="custom-row">
            <button class="btn sm" :class="{ on: custom.dir === 'rows' }" @click="custom.dir = 'rows'">{{ t('Ряды') }}</button>
            <button class="btn sm" :class="{ on: custom.dir === 'cols' }" @click="custom.dir = 'cols'">{{ t('Колонки') }}</button>
            <span class="grow" />
            <button class="btn sm" :title="t('Убрать')" @click="changeGroups(-1)">−</button>
            <span class="num">{{ custom.groups.length }}</span>
            <button class="btn sm" :title="t('Добавить')" @click="changeGroups(1)">+</button>
          </div>
          <div v-for="(n, i) in custom.groups" :key="i" class="custom-row">
            <span class="muted">{{ custom.dir === 'rows' ? t('Ряд {n}: окон', { n: i + 1 }) : t('Колонка {n}: окон', { n: i + 1 }) }}</span>
            <span class="grow" />
            <button class="btn sm" @click="changeCells(i, -1)">−</button>
            <span class="num">{{ n }}</span>
            <button class="btn sm" @click="changeCells(i, 1)">+</button>
          </div>
          <div class="custom-row">
            <LayoutIcon :def="custom" />
            <span class="muted">{{ t('окон: {n} из {max}', { n: customTotal, max: MAX_PANES }) }}</span>
            <span class="grow" />
            <button class="btn primary sm" @click="setLayout(custom), close()">{{ t('Применить') }}</button>
          </div>
        </div>
        <div class="menu-sep" />
        <div class="menu-title">{{ t('Синхронизация окон') }}</div>
        <div class="sync">
          <label v-for="o in SYNC" :key="o.id" class="menu-item check" :title="t(o.hint)">
            <input v-model="app.sync[o.id]" type="checkbox" />
            {{ t(o.label) }}
          </label>
        </div>
      </template>
    </Dropdown>

    <!-- снимок: нажатие сразу сохраняет все окна одной картинкой, стрелка — другие варианты -->
    <div v-if="!isPhone" class="split-btn">
      <button class="btn" :title="t('Снимок всех окон одной картинкой (Alt+Shift+S)')" @click="snapshotAll()"><Icon name="camera" /></button>
      <Dropdown align="right">
        <template #trigger="{ toggle }">
          <button class="btn caret-btn" :title="t('Другие варианты снимка')" @click="toggle"><Icon name="chevron" :size="13" /></button>
        </template>
        <template #default="{ close }">
          <button class="menu-item" @click="snapshotAll(), close()"><Icon name="windows" :size="16" />{{ t('Все окна одной картинкой') }} <span class="muted">Alt+Shift+S</span></button>
          <button class="menu-item" @click="chartAt(activeIndex)?.screenshot(), close()"><Icon name="rect" :size="16" />{{ t('Только активное окно') }} <span class="muted">Alt+S</span></button>
          <div class="menu-title">{{ t('В буфер обмена') }}</div>
          <button class="menu-item" @click="copyAll(), close()"><Icon name="windows" :size="16" />{{ t('Все окна одной картинкой') }} <span class="muted">Alt+Shift+C</span></button>
          <button class="menu-item" @click="copyCanvas(chartAt(activeIndex)?.capture() ?? null), close()"><Icon name="rect" :size="16" />{{ t('Только активное окно') }}</button>
        </template>
      </Dropdown>
    </div>
    <button v-if="!isPhone" class="btn" :title="t('Копировать снимок всех окон в буфер обмена (Alt+Shift+C)')" @click="copyAll()"><Icon name="copy" /></button>
    <button v-if="!isPhone" class="btn" :title="t('Поделиться: уровни, позиции, ссылка и QR-код')" @click="app.shareOpen = true"><Icon name="share" /></button>
    <button v-if="!isPhone" class="btn" :title="t('Обзор по монетам списков (Alt+D)')" @click="app.dashboardOpen = true"><Icon name="dashboard" /></button>

    <button
      v-if="!isPhone && cloud.code"
      class="btn"
      :class="cloud.online ? 'sync-on' : 'sync-off'"
      :title="cloud.online ? t('Синхронизация устройств: на связи') : t('Синхронизация устройств: нет связи')"
      @click="app.syncOpen = true"
    >
      <Icon :name="cloud.online ? 'cloud' : 'cloudOff'" />
    </button>
    <Dropdown v-if="!isPhone" align="right">
      <template #trigger="{ toggle }">
        <button class="btn" :title="t('Настройки')" @click="toggle"><Icon name="gear" /></button>
      </template>
      <template #default="{ close }">
        <div class="menu-title">{{ t('Тема') }}</div>
        <button v-for="th in THEMES" :key="th.id" class="menu-item" :class="{ on: app.themePref === th.id }" @click="app.themePref = th.id">
          <Icon :name="th.icon" :size="16" />{{ t(th.label) }}
        </button>
        <button class="menu-item" @click="(app.colorsOpen = true), close()"><Icon name="pencil" :size="16" />{{ t('Свои цвета…') }}</button>
        <button class="menu-item" @click="(app.viewOpen = true), close()"><Icon name="text" :size="16" />{{ t('Шрифты, таймер, размер позиции…') }}</button>
        <div class="menu-sep" />
        <div class="menu-title">Язык / Language</div>
        <button v-for="l in LANGS" :key="l.id" class="menu-item" :class="{ on: i18n.lang === l.id }" @click="i18n.lang = l.id">{{ l.label }}</button>
        <div class="menu-sep" />
        <button class="menu-item" @click="(app.syncOpen = true), close()"><Icon name="cloud" :size="16" />{{ t('Синхронизация устройств…') }}</button>
        <button class="menu-item" @click="(app.transfer = { code: '' }), close()"><Icon name="phone" :size="16" />{{ t('Разовый перенос (QR, ссылка, файл)…') }}</button>
        <div class="menu-sep" />
        <div class="menu-title">{{ t('Монета из вставки или ссылки') }}</div>
        <div class="defaults">
          <select v-model="app.defaults.exchange" class="field" :title="t('Биржа по умолчанию')">
            <option value="binance">Binance</option>
            <option value="bybit">Bybit</option>
          </select>
          <select v-model="app.defaults.market" class="field" :title="t('Рынок по умолчанию')">
            <option value="futures">{{ MARKET_NAMES.futures }}</option>
            <option value="spot">{{ MARKET_NAMES.spot }}</option>
          </select>
        </div>
        <p class="menu-note muted">{{ t('На этой бирже и рынке открывается монета, если в строке или ссылке они не указаны.') }}</p>
        <template v-if="canFullscreen">
          <div class="menu-sep" />
          <button class="menu-item" @click="fullscreen(), close()"><Icon name="maximize" :size="16" />{{ t('Во весь экран') }} <span class="muted">Shift+F</span></button>
        </template>
      </template>
    </Dropdown>
    <button v-if="!isPhone" class="btn donate" :class="{ pulse: donate.pulse }" :title="t('Поддержать проект')" :aria-label="t('Поддержать проект')" @click="app.donateOpen = true">
      <Icon name="heart" />
    </button>
    <button v-if="!isPhone" class="btn" :title="t('Обучение: видео-обзор терминала')" @click="app.tutorialOpen = true"><Icon name="learn" /></button>
    <button v-if="!isPhone" class="btn" :title="t('Горячие клавиши (?)')" @click="app.hotkeysOpen = true"><Icon name="keyboard" /></button>
    <button v-if="!isPhone" class="btn" :class="{ on: app.panelOpen }" :title="t('Боковая панель')" @click="togglePanel(app.panel)">
      <Icon name="panel" />
    </button>
  </header>
</template>

<style scoped>
/* донат: красное залитое сердечко; время от времени оно «стучит» (см. lib/donate): два крупных удара
   со свечением и два кольца, расходящихся от кнопки */
.donate {
  position: relative;
  color: #f23645;
}
.donate :deep(svg) {
  fill: currentColor;
  transition: transform 0.15s;
}
.donate:hover {
  color: #ff4d5e;
}
.donate:hover :deep(svg) {
  transform: scale(1.12);
}
.donate::before,
.donate::after {
  content: '';
  position: absolute;
  inset: 4px;
  border-radius: 50%;
  border: 2px solid #f23645;
  opacity: 0;
  pointer-events: none;
}
.donate.pulse :deep(svg) {
  animation: heartbeat 1.3s ease-in-out 2;
}
.donate.pulse::before {
  animation: heart-ring 1.3s ease-out 2;
}
.donate.pulse::after {
  animation: heart-ring 1.3s ease-out 0.25s 2;
}
@keyframes heartbeat {
  0%,
  100% {
    transform: scale(1);
    filter: drop-shadow(0 0 0 rgba(242, 54, 69, 0));
  }
  14% {
    transform: scale(1.4);
    filter: drop-shadow(0 0 6px rgba(242, 54, 69, 0.9));
  }
  28% {
    transform: scale(1.05);
  }
  42% {
    transform: scale(1.28);
    filter: drop-shadow(0 0 5px rgba(242, 54, 69, 0.8));
  }
  70% {
    transform: scale(1);
    filter: drop-shadow(0 0 2px rgba(242, 54, 69, 0.3));
  }
}
@keyframes heart-ring {
  0% {
    transform: scale(0.5);
    opacity: 0.85;
  }
  100% {
    transform: scale(1.7);
    opacity: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .donate.pulse :deep(svg),
  .donate.pulse::before,
  .donate.pulse::after {
    animation: none;
  }
}
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
.pane-tabs button.all {
  padding: 0 7px;
  display: grid;
  place-items: center;
}
.pane-tabs button.on {
  color: var(--sel);
  background: var(--sel-bg);
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
.tpl-row {
  display: flex;
  align-items: center;
  gap: 2px;
}
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
.bell {
  position: relative;
}
.bell .count {
  position: absolute;
  top: 2px;
  right: 0;
  min-width: 15px;
  height: 15px;
  padding: 0 4px;
  border-radius: 8px;
  background: var(--warn);
  color: #111;
  font: 600 10px/15px var(--font);
  font-style: normal;
  text-align: center;
}
.sync-on {
  color: var(--up);
}
.sync-off {
  color: var(--down);
}
.tpl-fav {
  min-width: calc(var(--ctl) - 4px);
  height: calc(var(--ctl) - 4px);
  padding: 0 6px;
  border: 1px solid var(--border);
  font-weight: 600;
  font-size: 13px;
}
.tpl-fav.on {
  border-color: var(--sel-border);
}
.caret {
  margin-left: -4px;
  color: var(--muted);
}
.split-btn {
  display: flex;
  flex: none;
}
.split-btn .btn:first-child {
  border-radius: 6px 0 0 6px;
}
.caret-btn {
  min-width: 16px;
  width: 16px;
  padding: 0;
  margin-left: -2px;
  border-radius: 0 6px 6px 0;
  color: var(--muted);
}
.sync {
  display: grid;
  grid-template-columns: 1fr 1fr;
  padding: 0 2px 4px;
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
.defaults {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  padding: 2px 8px 4px;
}
.defaults .field {
  height: 30px;
}
.menu-item .muted {
  margin-left: auto;
  font-size: 11px;
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
