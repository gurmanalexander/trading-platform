<script setup lang="ts">
import { defineAsyncComponent, onBeforeUnmount, onMounted, watch } from 'vue'
import TopBar from './components/TopBar.vue'
import DrawToolbar from './components/DrawToolbar.vue'
import ChartGrid from './components/ChartGrid.vue'
import SidePanel from './components/SidePanel.vue'
import BottomNav from './components/BottomNav.vue'
import Toasts from './components/Toasts.vue'
import { app, activeIndex, activePane, isPhone, modalOpen, paneCount, theme, cyclePane, openSearch, showPanel, toast, type Tool } from './stores/app'
import { addWatch, activeList } from './stores/watchlist'
import { redo, undo } from './stores/drawings'
import { stepSymbol } from './stores/screener'
import { chartAt } from './chart/registry'

// Диалоги нужны не сразу — грузим их код по первому открытию
const SymbolSearch = defineAsyncComponent(() => import('./components/SymbolSearch.vue'))
const IndicatorsDialog = defineAsyncComponent(() => import('./components/IndicatorsDialog.vue'))
const IndicatorSettings = defineAsyncComponent(() => import('./components/IndicatorSettings.vue'))
const IntervalDialog = defineAsyncComponent(() => import('./components/IntervalDialog.vue'))
const GoToDialog = defineAsyncComponent(() => import('./components/GoToDialog.vue'))
const HotkeysDialog = defineAsyncComponent(() => import('./components/HotkeysDialog.vue'))

watch(
  theme,
  (t) => {
    document.documentElement.dataset.theme = t
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', t === 'dark' ? '#141821' : '#f6f7f9')
  },
  { immediate: true },
)

// ---------- горячие клавиши ----------

const ALT_TOOLS: Record<string, Tool> = { KeyT: 'trend', KeyH: 'hline', KeyJ: 'hray', KeyV: 'vline', KeyC: 'cross', KeyF: 'fib' }

function addToWatchlist() {
  const s = activePane.value.symbol
  toast(addWatch(s) ? `${s.symbol} добавлен в список «${activeList.value.name}»` : `${s.symbol} уже есть в списке «${activeList.value.name}»`)
}

function fullscreen() {
  if (document.fullscreenElement) document.exitFullscreen()
  else document.documentElement.requestFullscreen?.().catch(() => {})
}

/** Сочетания с Alt. Возвращает true, если клавиша обработана */
function onAlt(e: KeyboardEvent): boolean {
  const pane = activePane.value
  const chart = chartAt(activeIndex.value)
  if (e.shiftKey) {
    if (e.code === 'KeyR') app.tool = 'rect'
    else return false
    return true
  }
  if (ALT_TOOLS[e.code]) app.tool = ALT_TOOLS[e.code]
  else if (e.code === 'KeyW') addToWatchlist()
  else if (e.code === 'KeyA') {
    showPanel('alerts')
    app.alertFocus++
  } else if (e.code === 'KeyR') chart?.resetView()
  else if (e.code === 'KeyL') pane.scale = pane.scale === 'log' ? 'normal' : 'log'
  else if (e.code === 'KeyP') pane.scale = pane.scale === 'percent' ? 'normal' : 'percent'
  else if (e.code === 'KeyI') pane.invert = !pane.invert
  else if (e.code === 'KeyG') app.gotoOpen = true
  else if (e.code === 'KeyS') chart?.screenshot()
  else if (e.code === 'Enter' || e.code === 'NumpadEnter') {
    if (paneCount.value > 1) app.maximized = !app.maximized
  } else return false
  return true
}

/** Сочетания с Ctrl (на Mac — Cmd) */
function onCtrl(e: KeyboardEvent): boolean {
  const chart = chartAt(activeIndex.value)
  if (e.altKey) {
    if (e.code === 'KeyH') app.drawingsHidden = !app.drawingsHidden
    else return false
    return true
  }
  if (e.code === 'KeyZ') {
    if (e.shiftKey) redo()
    else undo()
  } else if (e.code === 'KeyY') redo()
  else if (e.code === 'KeyC') return chart?.draw.copySelected() ?? false
  else if (e.code === 'KeyV') return chart?.draw.paste() ?? false
  else if (e.code === 'KeyK') openSearch()
  else if (e.code === 'ArrowLeft') chart?.scrollBars(-20)
  else if (e.code === 'ArrowRight') chart?.scrollBars(20)
  else return false
  return true
}

function onPlain(e: KeyboardEvent): boolean {
  const chart = chartAt(activeIndex.value)
  switch (e.code) {
    case 'Escape':
      if (app.tool !== 'cursor') app.tool = 'cursor'
      else if (app.maximized) app.maximized = false
      else return false
      return true
    case 'ArrowLeft':
      chart?.scrollBars(-1)
      return true
    case 'ArrowRight':
      chart?.scrollBars(1)
      return true
    case 'ArrowUp':
      chart?.zoomBy(1.2)
      return true
    case 'ArrowDown':
      chart?.zoomBy(1 / 1.2)
      return true
    case 'End':
      chart?.goRealtime()
      return true
    case 'Space':
      stepSymbol(e.shiftKey ? -1 : 1)
      return true
    case 'Tab':
      if (paneCount.value < 2) return false
      cyclePane(e.shiftKey ? -1 : 1)
      return true
    case 'Slash':
      if (e.shiftKey) app.hotkeysOpen = true
      else app.indicatorsOpen = true
      return true
    case 'KeyF':
      if (!e.shiftKey) return false
      fullscreen()
      return true
  }
  return false
}

function onKey(e: KeyboardEvent) {
  const t = e.target as HTMLElement
  const typing = t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable
  const plain = !e.ctrlKey && !e.metaKey && !e.altKey
  // окно поиска или интервала ещё открывается, а пользователь уже печатает — не теряем символы
  if (!typing && plain && e.key.length === 1) {
    if (app.search && /^[a-zA-Z0-9]$/.test(e.key)) {
      app.search.query += e.key.toUpperCase()
      return
    }
    if (app.intervalInput && /^[a-zA-Z0-9]$/.test(e.key)) {
      app.intervalInput.text += e.key
      return
    }
  }
  if (typing || modalOpen.value) return

  let handled: boolean
  if (e.ctrlKey || e.metaKey) handled = onCtrl(e)
  else if (e.altKey) handled = onAlt(e)
  else handled = onPlain(e)

  if (!handled && plain && !e.shiftKey) {
    // буква открывает поиск инструмента, цифра — выбор интервала
    if (/^[a-zA-Z]$/.test(e.key)) {
      openSearch(e.key.toUpperCase())
      handled = true
    } else if (/^[0-9]$/.test(e.key)) {
      app.intervalInput = { text: e.key }
      handled = true
    }
  }
  if (handled) e.preventDefault()
}

onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="app" :class="{ phone: isPhone }">
    <TopBar />
    <div class="body">
      <DrawToolbar v-if="!isPhone || app.drawBarOpen" />
      <ChartGrid />
      <SidePanel v-if="!isPhone && app.panelOpen" class="side-dock" :tab="app.panel" tabs />
      <div v-if="isPhone && app.mobileTab !== 'chart'" class="sheet">
        <SidePanel :tab="app.mobileTab" :tabs="false" />
      </div>
    </div>
    <BottomNav v-if="isPhone" />

    <SymbolSearch v-if="app.search" />
    <IndicatorsDialog v-if="app.indicatorsOpen" />
    <IndicatorSettings v-if="app.indSettings" :key="app.indSettings.id" />
    <IntervalDialog v-if="app.intervalInput" />
    <GoToDialog v-if="app.gotoOpen" />
    <HotkeysDialog v-if="app.hotkeysOpen" />
    <Toasts />
  </div>
</template>

<style>
.app {
  display: flex;
  flex-direction: column;
  height: 100dvh;
  padding-left: env(safe-area-inset-left);
  padding-right: env(safe-area-inset-right);
}
.body {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
}
.side-dock {
  width: 320px;
  flex: none;
  border-left: 1px solid var(--border);
}
.sheet {
  position: absolute;
  inset: 0;
  z-index: 20;
  background: var(--panel);
}
@media (max-width: 899px) {
  .side-dock {
    width: 260px;
  }
}
</style>
