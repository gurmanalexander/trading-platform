<script setup lang="ts">
import { defineAsyncComponent, onBeforeUnmount, onMounted, watch } from 'vue'
import TopBar from './components/TopBar.vue'
import DrawToolbar from './components/DrawToolbar.vue'
import ChartPane from './components/ChartPane.vue'
import SidePanel from './components/SidePanel.vue'
import BottomNav from './components/BottomNav.vue'
import Toasts from './components/Toasts.vue'
import { app, isPhone, paneCount, openSearch, type Tool } from './stores/app'

// Диалоги нужны не сразу — грузим их код по первому открытию
const SymbolSearch = defineAsyncComponent(() => import('./components/SymbolSearch.vue'))
const IndicatorsDialog = defineAsyncComponent(() => import('./components/IndicatorsDialog.vue'))
const IndicatorSettings = defineAsyncComponent(() => import('./components/IndicatorSettings.vue'))

watch(
  () => app.theme,
  (t) => {
    document.documentElement.dataset.theme = t
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', t === 'dark' ? '#141821' : '#f6f7f9')
  },
  { immediate: true },
)

const HOTKEYS: Record<string, Tool> = { KeyT: 'trend', KeyH: 'hline', KeyV: 'vline', KeyR: 'rect', KeyF: 'fib', KeyM: 'measure' }

function onKey(e: KeyboardEvent) {
  const t = e.target as HTMLElement
  if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable) return
  const typed = !e.ctrlKey && !e.metaKey && !e.altKey && /^[a-zA-Z0-9]$/.test(e.key)
  if (app.search) {
    // окно поиска ещё открывается, а пользователь уже печатает — не теряем буквы
    if (typed) app.search.query += e.key.toUpperCase()
    return
  }
  if (app.indicatorsOpen || app.indSettings) return
  if (e.key === 'Escape') {
    app.tool = 'cursor'
    return
  }
  if (e.altKey && !e.ctrlKey && !e.metaKey && HOTKEYS[e.code]) {
    e.preventDefault()
    app.tool = HOTKEYS[e.code]
    return
  }
  // начали печатать — открываем поиск инструмента с введённой буквой
  if (typed) {
    e.preventDefault()
    openSearch(e.key.toUpperCase())
  }
}

onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="app" :class="{ phone: isPhone }">
    <TopBar />
    <div class="body">
      <DrawToolbar v-if="!isPhone || app.drawBarOpen" />
      <main class="charts" :class="'layout-' + (isPhone ? '1' : app.layout)">
        <ChartPane v-for="i in paneCount" :key="i" :index="i - 1" />
      </main>
      <SidePanel v-if="!isPhone && app.panelOpen" class="side-dock" :tab="app.panel" tabs />
      <div v-if="isPhone && app.mobileTab !== 'chart'" class="sheet">
        <SidePanel :tab="app.mobileTab" :tabs="false" />
      </div>
    </div>
    <BottomNav v-if="isPhone" />

    <SymbolSearch v-if="app.search" />
    <IndicatorsDialog v-if="app.indicatorsOpen" />
    <IndicatorSettings v-if="app.indSettings" :key="app.indSettings.id" />
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
.charts {
  flex: 1;
  min-width: 0;
  display: grid;
  gap: 1px;
  background: var(--border);
}
.layout-1 {
  grid-template: 1fr / 1fr;
}
.layout-2h {
  grid-template: 1fr / 1fr 1fr;
}
.layout-2v {
  grid-template: 1fr 1fr / 1fr;
}
.layout-4 {
  grid-template: 1fr 1fr / 1fr 1fr;
}
.side-dock {
  width: 300px;
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
