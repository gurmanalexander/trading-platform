<script setup lang="ts">
import { defineAsyncComponent, onBeforeUnmount, onMounted, watch } from 'vue'
import TopBar from './components/TopBar.vue'
import DrawToolbar from './components/DrawToolbar.vue'
import ChartGrid from './components/ChartGrid.vue'
import SidePanel from './components/SidePanel.vue'
import BottomNav from './components/BottomNav.vue'
import Toasts from './components/Toasts.vue'
import { app, activeIndex, activePane, isPhone, modalOpen, paneCount, theme, cyclePane, openSearch, setSymbol, showPanel, toast, type Tool } from './stores/app'
import { addWatch, activeList } from './stores/watchlist'
import { addDrawing, clipboard, redo, selection, styleFor, undo, type Drawing } from './stores/drawings'
import { stepSymbol } from './stores/screener'
import { chartAt } from './chart/registry'
import { isPosition } from './chart/drawings'
import { setPositionPrices } from './chart/position'
import { parseSignal, type Signal } from './lib/signal'
import { getTf } from './lib/timeframes'
import { symbolKey, type SymbolRef } from './types'

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
  // Ctrl+C и Ctrl+V здесь не перехватываются: их обрабатывают события copy и paste (см. ниже)
  if (e.code === 'KeyZ') {
    if (e.shiftKey) redo()
    else undo()
  } else if (e.code === 'KeyY') redo()
  else if (e.code === 'KeyK') openSearch()
  else if (e.code === 'ArrowLeft') chart?.scrollBars(-20)
  else if (e.code === 'ArrowRight') chart?.scrollBars(20)
  else return false
  return true
}

/** Стрелки при выбранном рисунке двигают его: по свечам и по шагам цены (с Shift — в 10 раз быстрее) */
function nudgeSelected(e: KeyboardEvent): boolean {
  const sel = selection.value
  const layer = sel ? chartAt(sel.pane)?.draw : undefined
  if (!layer) return false
  const k = e.shiftKey ? 10 : 1
  if (e.code === 'ArrowLeft') return layer.nudge(-k, 0)
  if (e.code === 'ArrowRight') return layer.nudge(k, 0)
  if (e.code === 'ArrowUp') return layer.nudge(0, k)
  if (e.code === 'ArrowDown') return layer.nudge(0, -k)
  return false
}

function onPlain(e: KeyboardEvent): boolean {
  const chart = chartAt(activeIndex.value)
  if (nudgeSelected(e)) return true
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

const isTyping = (target: EventTarget | null) => {
  const t = target as HTMLElement | null
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)
}

// ---------- копирование и вставка ----------

/** Ctrl+C: рисунок запоминается, а в системный буфер уходит текст (у позиции — её цены в формате сделки) */
function onCopy(e: ClipboardEvent) {
  if (isTyping(e.target) || modalOpen.value) return
  const sel = selection.value
  const layer = sel ? chartAt(sel.pane)?.draw : undefined
  if (!layer?.copySelected()) return
  e.clipboardData?.setData('text/plain', clipboard.text)
  e.preventDefault()
}

/**
 * Ctrl+V: свой скопированный рисунок вставляется копией; текст сделки (ТВХ / SL / TP)
 * раскладывается по выбранной позиции, а если позиция не выбрана — создаёт новую.
 */
function onPaste(e: ClipboardEvent) {
  if (isTyping(e.target) || modalOpen.value) return
  const text = e.clipboardData?.getData('text/plain') ?? ''
  if (clipboard.item && text === clipboard.text) {
    if (chartAt(activeIndex.value)?.draw.paste()) e.preventDefault()
    return
  }
  const sig = parseSignal(text)
  if (!sig) return
  e.preventDefault()
  applySignal(sig)
}

function applySignal(sig: Signal) {
  const sel = selection.value
  const layer = sel ? chartAt(sel.pane)?.draw : undefined
  const cur = layer?.selected()
  if (layer && cur && isPosition(cur.type)) {
    if (layer.applySignal(sig)) toast('Цены позиции обновлены из текста')
    else toast('Не получилось: стоп и цель должны быть по разные стороны от входа', 'error')
    return
  }
  if (sig.entry === undefined || sig.stop === undefined || sig.target === undefined) {
    toast('Чтобы создать позицию из текста, нужны вход, стоп и цель. Либо выделите позицию и вставьте снова', 'error')
    return
  }
  const pane = activePane.value
  const ref: SymbolRef = { exchange: pane.symbol.exchange, market: pane.symbol.market, symbol: sig.symbol ?? pane.symbol.symbol }
  // вход — текущая минута; ширина — сутки на интервале до часа, чтобы позицию было видно на любом внутридневном графике
  const t = Math.floor(Date.now() / 60_000) * 60
  const d: Drawing = {
    id: Math.random().toString(36).slice(2, 10),
    type: 'long',
    color: styleFor('long').color,
    pts: [
      { t, p: sig.entry },
      { t: t + Math.min(getTf(pane.tf).sec, 3600) * 24, p: sig.target },
      { t, p: sig.stop },
    ],
  }
  if (!setPositionPrices(d, sig.entry, sig.stop, sig.target)) {
    toast('Не получилось: стоп и цель должны быть по разные стороны от входа', 'error')
    return
  }
  addDrawing(symbolKey(ref), d)
  if (ref.symbol !== pane.symbol.symbol) setSymbol(ref)
  selection.value = { pane: activeIndex.value, id: d.id }
  toast(`${d.type === 'long' ? 'Лонг' : 'Шорт'} ${ref.symbol} добавлен на график`)
}

function onKey(e: KeyboardEvent) {
  const typing = isTyping(e.target)
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

onMounted(() => {
  window.addEventListener('keydown', onKey)
  document.addEventListener('copy', onCopy)
  document.addEventListener('paste', onPaste)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  document.removeEventListener('copy', onCopy)
  document.removeEventListener('paste', onPaste)
})
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
  width: 340px;
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
