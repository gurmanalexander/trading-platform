<script setup lang="ts">
import Icon from './Icon.vue'
import Dropdown from './Dropdown.vue'
import LayoutIcon from './LayoutIcon.vue'
import {
  app,
  activePane,
  paneCount,
  setLayout,
  sameLayout,
  applyTemplate,
  saveTemplate,
  toast,
  CHART_TYPES,
  LAYOUT_PRESETS,
  type ThemePref,
} from '../stores/app'
import { addWatch, activeList } from '../stores/watchlist'
import { activeIndex } from '../stores/app'
import { pasteFromClipboard } from '../chart/setup'
import { chartAt } from '../chart/registry'
import { copyAll, copyCanvas, snapshotAll } from '../chart/snapshot'
import { refreshAll, refreshing } from '../chart/refresh'
import { MARKET_NAMES } from '../types'
import { t, i18n, LANGS } from '../lib/i18n'

// side — меню открывается сбоку от кнопки (телефон набок: кнопка стоит в боковой колонке)
defineProps<{ side?: boolean }>()

// Меню «ещё» для телефона: всё, что на широком экране лежит кнопками на верхней панели
const pane = activePane
// на телефоне уместны раскладки до четырёх окон
const layouts = LAYOUT_PRESETS.filter((l) => l.groups.reduce((a, b) => a + b, 0) <= 4)
const THEMES: { id: ThemePref; label: string; icon: string }[] = [
  { id: 'system', label: 'Системная', icon: 'monitor' },
  { id: 'dark', label: 'Тёмная', icon: 'moon' },
  { id: 'light', label: 'Светлая', icon: 'sun' },
]
const SYNC: { id: keyof typeof app.sync; label: string }[] = [
  { id: 'symbol', label: 'Инструмент' },
  { id: 'interval', label: 'Интервал' },
  { id: 'crosshair', label: 'Перекрестие' },
  { id: 'time', label: 'Время' },
]

function toList() {
  const s = pane.value.symbol
  const vars = { s: s.symbol, list: activeList.value.name }
  toast(addWatch(s) ? t('{s} добавлен в список «{list}»', vars) : t('{s} уже есть в списке «{list}»', vars))
}
/** Полная перезагрузка страницы — то же, что закрыть приложение и открыть заново */
const restart = () => location.reload()
function saveNew() {
  const name = prompt(t('Название шаблона'), t('Мой шаблон'))?.trim()
  if (!name) return
  const question = [
    t('Запомнить в шаблоне инструменты окон?'),
    '',
    t('ОК — шаблон откроет те же инструменты.'),
    t('Отмена — шаблон применится к текущему инструменту.'),
  ].join('\n')
  saveTemplate(name.slice(0, 40), confirm(question))
  toast(t('Шаблон «{name}» сохранён', { name }))
}
</script>

<template>
  <Dropdown align="right" :side="side">
    <template #trigger="{ toggle, open }">
      <slot name="trigger" :toggle="toggle" :open="open">
        <button class="btn" :class="{ on: open }" :title="t('Ещё: настройки и действия')" @click="toggle"><Icon name="more" /></button>
      </slot>
    </template>
    <template #default="{ close }">
      <div class="pm">
        <button class="menu-item" :disabled="refreshing" @click="refreshAll(), close()"><Icon name="refresh" :size="16" />{{ t('Обновить данные') }}</button>
        <button class="menu-item" @click="(app.tutorialOpen = true), close()"><Icon name="learn" :size="16" />{{ t('Обучение: видео-обзор') }}</button>
        <button class="menu-item donate" @click="(app.donateOpen = true), close()"><Icon name="heart" :size="16" />{{ t('Поддержать проект') }}</button>
        <button class="menu-item" @click="(app.dashboardOpen = true), close()"><Icon name="dashboard" :size="16" />{{ t('Обзор по спискам') }}</button>
        <button class="menu-item" @click="(app.indicatorsOpen = true), close()"><Icon name="fx" :size="16" />{{ t('Индикаторы') }}</button>
        <button class="menu-item" @click="pasteFromClipboard(), close()"><Icon name="paste" :size="16" />{{ t('Вставить из буфера (сделка, сетапы)') }}</button>
        <button class="menu-item" @click="toList(), close()"><Icon name="star" :size="16" />{{ t('В список «{list}»', { list: activeList.name }) }}</button>
        <button class="menu-item" @click="(app.gotoOpen = true), close()"><Icon name="skip" :size="16" />{{ t('Перейти к дате') }}</button>
        <button class="menu-item" @click="(app.shareOpen = true), close()"><Icon name="share" :size="16" />{{ t('Поделиться…') }}</button>
        <button class="menu-item" @click="(paneCount > 1 && app.phoneStack ? snapshotAll() : chartAt(activeIndex)?.screenshot()), close()">
          <Icon name="camera" :size="16" />{{ t('Снимок графика') }}
        </button>
        <button class="menu-item" @click="(paneCount > 1 && app.phoneStack ? copyAll() : copyCanvas(chartAt(activeIndex)?.capture() ?? null)), close()">
          <Icon name="copy" :size="16" />{{ t('Копировать снимок в буфер') }}
        </button>

        <div class="menu-title">{{ t('Вид графика') }}</div>
        <div class="icons">
          <button v-for="ct in CHART_TYPES" :key="ct.id" class="btn" :class="{ on: pane.chartType === ct.id }" :title="t(ct.label)" @click="pane.chartType = ct.id">
            <Icon :name="ct.icon" />
          </button>
        </div>

        <div class="menu-title">{{ t('Окна') }}</div>
        <div class="icons">
          <button v-for="(def, i) in layouts" :key="i" class="btn" :class="{ on: sameLayout(def, app.layout) }" @click="setLayout(def)">
            <LayoutIcon :def="def" />
          </button>
        </div>
        <label v-if="paneCount > 1" class="menu-item check">
          <input v-model="app.phoneStack" type="checkbox" />
          {{ t('Показывать все окна сразу') }}
        </label>

        <div class="menu-title">{{ t('Шаблоны') }}</div>
        <button v-for="tp in app.templates" :key="tp.id" class="menu-item" :class="{ on: tp.id === app.templateId }" @click="applyTemplate(tp.id), close()">
          <Icon name="template" :size="16" />{{ tp.name }}
        </button>
        <button class="menu-item" @click="saveNew(), close()"><Icon name="plus" :size="16" />{{ t('Сохранить текущее как шаблон…') }}</button>

        <div class="menu-title">{{ t('Синхронизация окон') }}</div>
        <label v-for="o in SYNC" :key="o.id" class="menu-item check">
          <input v-model="app.sync[o.id]" type="checkbox" />
          {{ t(o.label) }}
        </label>

        <div class="menu-title">{{ t('Монета из вставки или ссылки') }}</div>
        <div class="defaults">
          <select v-model="app.defaults.exchange" class="field">
            <option value="binance">Binance</option>
            <option value="bybit">Bybit</option>
          </select>
          <select v-model="app.defaults.market" class="field">
            <option value="futures">{{ MARKET_NAMES.futures }}</option>
            <option value="spot">{{ MARKET_NAMES.spot }}</option>
          </select>
        </div>

        <button class="menu-item" @click="(app.syncOpen = true), close()"><Icon name="cloud" :size="16" />{{ t('Синхронизация устройств…') }}</button>
        <button class="menu-item" @click="(app.transfer = { code: '' }), close()"><Icon name="share" :size="16" />{{ t('Перенос с другого устройства') }}</button>
        <button class="menu-item" @click="(app.colorsOpen = true), close()"><Icon name="pencil" :size="16" />{{ t('Свои цвета') }}</button>
        <button class="menu-item" @click="(app.viewOpen = true), close()"><Icon name="text" :size="16" />{{ t('Шрифты, таймер, размер позиции') }}</button>

        <div class="menu-title">{{ t('Тема') }}</div>
        <div class="icons">
          <button v-for="th in THEMES" :key="th.id" class="btn theme" :class="{ on: app.themePref === th.id }" @click="app.themePref = th.id">
            <Icon :name="th.icon" :size="16" />{{ t(th.label) }}
          </button>
        </div>
        <div class="menu-title">Язык / Language</div>
        <div class="icons">
          <button v-for="l in LANGS" :key="l.id" class="btn theme" :class="{ on: i18n.lang === l.id }" @click="i18n.lang = l.id">{{ l.label }}</button>
        </div>
        <div class="menu-sep" />
        <button class="menu-item" @click="restart"><Icon name="skip" :size="16" />{{ t('Перезапустить приложение') }}</button>
      </div>
    </template>
  </Dropdown>
</template>

<style scoped>
.pm {
  min-width: 250px;
  max-width: 300px;
}
.menu-title {
  padding: 8px 10px 4px;
  font-size: 11px;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.icons {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  padding: 0 6px;
}
.theme {
  font-size: 12px;
}
.defaults {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  padding: 0 8px;
}
.check {
  cursor: pointer;
}
.check input {
  accent-color: var(--accent);
  width: 16px;
  height: 16px;
  margin: 0;
}
.menu-item {
  white-space: normal;
}
.donate :deep(svg) {
  color: #f23645;
  fill: currentColor;
}
</style>
