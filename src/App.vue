<script setup lang="ts">
import Icon from './components/Icon.vue'
import { defineAsyncComponent, onBeforeUnmount, onMounted, watch } from 'vue'
import TopBar from './components/TopBar.vue'
import DrawToolbar from './components/DrawToolbar.vue'
import ChartGrid from './components/ChartGrid.vue'
import SidePanel from './components/SidePanel.vue'
import BottomNav from './components/BottomNav.vue'
import Toasts from './components/Toasts.vue'
import { app, activeIndex, activePane, isPhone, modalOpen, paneCount, theme, cyclePane, openSearch, setZen, showPanel, togglePanel, toast, type Tool } from './stores/app'
import { addWatch, activeList } from './stores/watchlist'
import { clipboard, redo, selection, undo } from './stores/drawings'
import { stepSymbol } from './stores/screener'
import { chartAt } from './chart/registry'
import { applyPastedText, applySetup, setupTextFromUrl } from './chart/setup'
import { applyShare } from './chart/share'
import { decodeShare } from './lib/share'
import { snapshotAll } from './chart/snapshot'
import { parseSetup } from './lib/setup'

// Диалоги нужны не сразу — грузим их код по первому открытию
const SymbolSearch = defineAsyncComponent(() => import('./components/SymbolSearch.vue'))
const IndicatorsDialog = defineAsyncComponent(() => import('./components/IndicatorsDialog.vue'))
const IndicatorSettings = defineAsyncComponent(() => import('./components/IndicatorSettings.vue'))
const IntervalDialog = defineAsyncComponent(() => import('./components/IntervalDialog.vue'))
const GoToDialog = defineAsyncComponent(() => import('./components/GoToDialog.vue'))
const HotkeysDialog = defineAsyncComponent(() => import('./components/HotkeysDialog.vue'))
const TextDialog = defineAsyncComponent(() => import('./components/TextDialog.vue'))
const TradeTextDialog = defineAsyncComponent(() => import('./components/TradeTextDialog.vue'))
const ColorsDialog = defineAsyncComponent(() => import('./components/ColorsDialog.vue'))
const Dashboard = defineAsyncComponent(() => import('./components/Dashboard.vue'))
const ShareDialog = defineAsyncComponent(() => import('./components/ShareDialog.vue'))
const ScreenerFilterDialog = defineAsyncComponent(() => import('./components/ScreenerFilterDialog.vue'))
const TransferDialog = defineAsyncComponent(() => import('./components/TransferDialog.vue'))

watch(
  theme,
  (t) => {
    document.documentElement.dataset.theme = t
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', t === 'dark' ? '#161a23' : '#f6f7f9')
  },
  { immediate: true },
)

// Свои цвета перекрывают переменные темы; сброшенный цвет возвращается к стандартному
const CSS_VARS = { up: '--up', down: '--down', bg: '--bg', accent: '--accent' } as const
watch(
  [theme, () => app.colors],
  () => {
    const custom = app.colors[theme.value]
    const style = document.documentElement.style
    for (const [key, name] of Object.entries(CSS_VARS)) {
      const v = custom[key as keyof typeof CSS_VARS]
      if (v) style.setProperty(name, v)
      else style.removeProperty(name)
    }
  },
  { immediate: true, deep: true },
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
    else if (e.code === 'KeyS') snapshotAll()
    else return false
    return true
  }
  if (ALT_TOOLS[e.code]) app.tool = ALT_TOOLS[e.code]
  else if (e.code === 'KeyW') addToWatchlist()
  else if (e.code === 'KeyK') togglePanel('checklist')
  else if (e.code === 'KeyD') app.dashboardOpen = true
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
  // сделка (ТВХ / SL / TP), строка сетапа или несколько строк сетапов
  if (applyPastedText(text)) e.preventDefault()
  else if (text.trim()) {
    // молчать нельзя: иначе непонятно, почему вставка «не сработала»
    const one = text.trim().replace(/\s+/g, ' ')
    toast(`Не понял вставленный текст: «${one.length > 60 ? one.slice(0, 60) + '…' : one}». Нужна монета (#TAOUSDT), можно с датой, направлением и уровнем`, 'error', 7000)
  }
}

/**
 * Буква или цифра по физической клавише — независимо от раскладки: в русской раскладке
 * клавиша «И» всё равно даёт «B», и поиск монеты открывается как обычно.
 */
function typedChar(e: KeyboardEvent): string {
  const m = /^(?:Key([A-Z])|(?:Digit|Numpad)(\d))$/.exec(e.code)
  return m ? (m[1] ?? m[2]) : ''
}

function onKey(e: KeyboardEvent) {
  const typing = isTyping(e.target)
  const plain = !e.ctrlKey && !e.metaKey && !e.altKey
  const ch = plain ? typedChar(e) : ''
  // окно поиска или интервала ещё открывается, а пользователь уже печатает — не теряем символы
  if (!typing && ch) {
    if (app.search) {
      app.search.query += ch
      return
    }
    if (app.intervalInput) {
      // регистр важен: m — минуты, M — месяц
      app.intervalInput.text += e.shiftKey ? ch : ch.toLowerCase()
      return
    }
  }
  if (typing || modalOpen.value) return

  let handled: boolean
  if (e.ctrlKey || e.metaKey) handled = onCtrl(e)
  else if (e.altKey) handled = onAlt(e)
  else handled = onPlain(e)

  if (!handled && ch && !e.shiftKey) {
    // буква открывает поиск инструмента, цифра — выбор интервала (а если это начало тикера — тоже поиск)
    if (/[A-Z]/.test(ch)) openSearch(ch)
    else app.intervalInput = { text: ch }
    handled = true
  }
  if (handled) e.preventDefault()
}

/** Сетап в адресе страницы: ссылка, которой поделились, или строка, дописанная к адресу руками */
function openFromUrl() {
  // ссылка переноса данных с другого устройства
  if (location.hash.startsWith('#import=')) {
    app.transfer = { code: location.hash.slice(8) }
    return
  }
  // ссылка «Поделиться» с несколькими уровнями или позициями
  if (location.hash.startsWith('#share=')) {
    const pack = decodeShare(location.hash.slice(7))
    if (pack) applyShare(pack)
    else toast('Ссылка повреждена: не удалось прочитать, чем поделились', 'error')
    history.replaceState(null, '', new URL('./', location.href).pathname)
    return
  }
  const text = setupTextFromUrl()
  if (!text) return
  const setup = parseSetup(text)
  if (setup) applySetup(setup)
  // адрес возвращаем к обычному: при обновлении страницы сетап не должен применяться заново
  history.replaceState(null, '', new URL('./', location.href).pathname)
}

onMounted(() => {
  openFromUrl()
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
    <TopBar v-if="!app.zen" />
    <div class="body">
      <DrawToolbar v-if="!app.zen && (!isPhone || app.drawBarOpen)" :horizontal="isPhone" />
      <ChartGrid />
      <SidePanel v-if="!isPhone && app.panelOpen && !app.zen" class="side-dock" :tab="app.panel" tabs />
      <div v-if="isPhone && app.mobileTab !== 'chart' && !app.zen" class="sheet">
        <SidePanel :tab="app.mobileTab" :tabs="false" />
      </div>
      <button v-if="app.zen" class="zen-exit" title="Вернуть панели" @click="setZen(false)"><Icon name="minimize" :size="18" /></button>
    </div>
    <BottomNav v-if="isPhone && !app.zen" />

    <SymbolSearch v-if="app.search" />
    <IndicatorsDialog v-if="app.indicatorsOpen" />
    <IndicatorSettings v-if="app.indSettings" :key="app.indSettings.id" />
    <IntervalDialog v-if="app.intervalInput" />
    <GoToDialog v-if="app.gotoOpen" />
    <HotkeysDialog v-if="app.hotkeysOpen" />
    <TextDialog v-if="app.textEdit" :key="app.textEdit.id ?? 'new'" />
    <TradeTextDialog v-if="app.tradeTextOpen" />
    <ColorsDialog v-if="app.colorsOpen" />
    <TransferDialog v-if="app.transfer" />
    <ShareDialog v-if="app.shareOpen" />
    <Dashboard v-if="app.dashboardOpen" />
    <ScreenerFilterDialog v-if="app.screenerFilterOpen" />
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
/* телефон: панель рисования — полосой под графиком */
.app.phone .body {
  flex-direction: column;
}
.app.phone .drawbar {
  order: 2;
}
.zen-exit {
  position: absolute;
  top: calc(6px + env(safe-area-inset-top));
  right: 74px;
  z-index: 30;
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: color-mix(in srgb, var(--panel) 82%, transparent);
  color: var(--text);
  backdrop-filter: blur(4px);
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
