<script setup lang="ts">
import { computed } from 'vue'
import Icon from './Icon.vue'
import Dropdown from './Dropdown.vue'
import { EXCHANGE_NAMES, MARKET_NAMES } from '../types'
import { app, activePane, isPhone, openSearch, togglePanel, CHART_TYPES, LAYOUTS, viewport } from '../stores/app'
import { TIMEFRAMES, FAVORITE_TFS, getTf } from '../lib/timeframes'

const pane = activePane
const favorites = computed(() => TIMEFRAMES.filter((t) => FAVORITE_TFS.includes(t.id)))
// избранные интервалы в строку помещаются только на широком экране
const inlineTfs = computed(() => viewport.w >= 1100)
const chartType = computed(() => CHART_TYPES.find((t) => t.id === pane.value.chartType) ?? CHART_TYPES[0])
const canFullscreen = !!document.documentElement.requestFullscreen

function toggleTheme() {
  app.theme = app.theme === 'dark' ? 'light' : 'dark'
}
function fullscreen() {
  if (document.fullscreenElement) document.exitFullscreen()
  else document.documentElement.requestFullscreen().catch(() => {})
}
function openAlerts() {
  if (isPhone.value) app.mobileTab = 'alerts'
  else {
    app.panel = 'alerts'
    app.panelOpen = true
  }
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
      <button v-for="t in favorites" :key="t.id" class="btn tf" :class="{ on: pane.tf === t.id }" @click="pane.tf = t.id">
        {{ t.label }}
      </button>
    </template>
    <Dropdown>
      <template #trigger="{ toggle }">
        <button class="btn" :class="{ on: !inlineTfs || !FAVORITE_TFS.includes(pane.tf) }" title="Интервал" @click="toggle">
          <template v-if="!inlineTfs || !FAVORITE_TFS.includes(pane.tf)">{{ getTf(pane.tf).label }}</template>
          <Icon name="chevron" :size="14" />
        </button>
      </template>
      <template #default="{ close }">
        <div class="tf-grid">
          <button
            v-for="t in TIMEFRAMES"
            :key="t.id"
            class="menu-item"
            :class="{ on: pane.tf === t.id }"
            @click="(pane.tf = t.id), close()"
          >
            {{ t.label }}
          </button>
        </div>
      </template>
    </Dropdown>

    <span class="sep" />

    <Dropdown>
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

    <button class="btn" title="Индикаторы" @click="app.indicatorsOpen = true">
      <Icon name="fx" /><span class="wide">Индикаторы</span>
    </button>
    <button class="btn" title="Оповещения" @click="openAlerts"><Icon name="bell" /><span class="wide">Оповещения</span></button>
    <button v-if="isPhone" class="btn" :class="{ on: app.drawBarOpen }" title="Рисование" @click="app.drawBarOpen = !app.drawBarOpen">
      <Icon name="pencil" />
    </button>

    <span class="grow" />

    <Dropdown v-if="!isPhone" align="right">
      <template #trigger="{ toggle }">
        <button class="btn" title="Раскладка графиков" @click="toggle"><Icon :name="'layout-' + app.layout" /></button>
      </template>
      <template #default="{ close }">
        <button v-for="l in LAYOUTS" :key="l.id" class="menu-item" :class="{ on: app.layout === l.id }" @click="(app.layout = l.id), close()">
          <Icon :name="'layout-' + l.id" :size="16" />{{ l.label }}
        </button>
      </template>
    </Dropdown>
    <button class="btn" :title="app.theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'" @click="toggleTheme">
      <Icon :name="app.theme === 'dark' ? 'sun' : 'moon'" />
    </button>
    <button v-if="canFullscreen && !isPhone" class="btn" title="Во весь экран" @click="fullscreen"><Icon name="maximize" /></button>
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
.tf-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 2px;
}
.tf-grid .menu-item {
  justify-content: center;
  padding: 0 14px;
}
@media (max-width: 899px) {
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
