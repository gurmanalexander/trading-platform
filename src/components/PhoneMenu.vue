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
import { chartAt } from '../chart/registry'
import { snapshotAll } from '../chart/snapshot'
import { copyShareLink } from '../chart/share'

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
  toast(addWatch(s) ? `${s.symbol} добавлен в список «${activeList.value.name}»` : `${s.symbol} уже есть в списке «${activeList.value.name}»`)
}
function saveNew() {
  const name = prompt('Название шаблона', 'Мой шаблон')?.trim()
  if (!name) return
  saveTemplate(name.slice(0, 40), confirm('Запомнить в шаблоне инструменты окон?\n\nОК — шаблон откроет те же инструменты.\nОтмена — шаблон применится к текущему инструменту.'))
  toast(`Шаблон «${name}» сохранён`)
}
</script>

<template>
  <Dropdown align="right">
    <template #trigger="{ toggle }">
      <button class="btn" title="Ещё" @click="toggle"><Icon name="more" /></button>
    </template>
    <template #default="{ close }">
      <div class="pm">
        <button class="menu-item" @click="(app.indicatorsOpen = true), close()"><Icon name="fx" :size="16" />Индикаторы</button>
        <button class="menu-item" @click="(app.checklistOpen = true), close()"><Icon name="checklist" :size="16" />Чеклист сделки</button>
        <button class="menu-item" @click="(app.tradeTextOpen = true), close()"><Icon name="paste" :size="16" />Вставить текстом</button>
        <button class="menu-item" @click="toList(), close()"><Icon name="star" :size="16" />В список «{{ activeList.name }}»</button>
        <button class="menu-item" @click="(app.gotoOpen = true), close()"><Icon name="skip" :size="16" />Перейти к дате</button>
        <button class="menu-item" @click="copyShareLink(), close()"><Icon name="share" :size="16" />Поделиться ссылкой</button>
        <button class="menu-item" @click="(paneCount > 1 && app.phoneStack ? snapshotAll() : chartAt(activeIndex)?.screenshot()), close()">
          <Icon name="camera" :size="16" />Снимок графика
        </button>

        <div class="menu-title">Вид графика</div>
        <div class="icons">
          <button v-for="t in CHART_TYPES" :key="t.id" class="btn" :class="{ on: pane.chartType === t.id }" :title="t.label" @click="pane.chartType = t.id">
            <Icon :name="t.icon" />
          </button>
        </div>

        <div class="menu-title">Окна</div>
        <div class="icons">
          <button v-for="(def, i) in layouts" :key="i" class="btn" :class="{ on: sameLayout(def, app.layout) }" @click="setLayout(def)">
            <LayoutIcon :def="def" />
          </button>
        </div>
        <label v-if="paneCount > 1" class="menu-item check">
          <input v-model="app.phoneStack" type="checkbox" />
          Показывать все окна сразу
        </label>

        <div class="menu-title">Шаблоны</div>
        <button v-for="t in app.templates" :key="t.id" class="menu-item" :class="{ on: t.id === app.templateId }" @click="applyTemplate(t.id), close()">
          <Icon name="bookmark" :size="16" />{{ t.name }}
        </button>
        <button class="menu-item" @click="saveNew(), close()"><Icon name="plus" :size="16" />Сохранить текущее как шаблон…</button>

        <div class="menu-title">Синхронизация окон</div>
        <label v-for="o in SYNC" :key="o.id" class="menu-item check">
          <input v-model="app.sync[o.id]" type="checkbox" />
          {{ o.label }}
        </label>

        <div class="menu-title">Монета из вставки или ссылки</div>
        <div class="defaults">
          <select v-model="app.defaults.exchange" class="field">
            <option value="binance">Binance</option>
            <option value="bybit">Bybit</option>
          </select>
          <select v-model="app.defaults.market" class="field">
            <option value="futures">Фьючерсы</option>
            <option value="spot">Спот</option>
          </select>
        </div>

        <button class="menu-item" @click="(app.transfer = { code: '' }), close()"><Icon name="share" :size="16" />Перенос с другого устройства</button>
        <button class="menu-item" @click="(app.colorsOpen = true), close()"><Icon name="pencil" :size="16" />Свои цвета</button>

        <div class="menu-title">Тема</div>
        <div class="icons">
          <button v-for="t in THEMES" :key="t.id" class="btn theme" :class="{ on: app.themePref === t.id }" @click="app.themePref = t.id">
            <Icon :name="t.icon" :size="16" />{{ t.label }}
          </button>
        </div>
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
</style>
