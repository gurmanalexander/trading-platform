<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue'
import Icon from './Icon.vue'
import ChartLegend from './ChartLegend.vue'
import { ChartController } from '../chart/controller'
import { symbolKey } from '../types'
import { app, activeIndex, paneCount, isPhone, toast, type ScaleMode } from '../stores/app'
import { tickers, useTickers } from '../stores/tickers'
import { alerts, addAlert } from '../stores/alerts'
import { DRAW_COLORS, clearDrawings, drawings, drawingsOf, selection } from '../stores/drawings'
import { fmtPrice } from '../lib/format'

const props = defineProps<{ index: number }>()
const pane = app.panes[props.index]

const host = ref<HTMLElement>()
const overlay = ref<HTMLElement>()
const ctrl = shallowRef<ChartController>()
const key = computed(() => symbolKey(pane.symbol))
const isActive = computed(() => activeIndex.value === props.index)
const precision = computed(() => ctrl.value?.ui.precision ?? 2)

const menu = reactive({ open: false, x: 0, y: 0, price: 0 })

// живая цена инструмента панели: и для списка, и для «докраски» последней свечи
useTickers(() => [pane.symbol])

onMounted(() => {
  const c = new ChartController(host.value!, pane, props.index)
  ctrl.value = c
  c.draw.bind(overlay.value!)
  c.draw.setList(drawingsOf(key.value))
  c.setAlertLines(alertPrices.value)
  c.load()
  window.addEventListener('keydown', onKey)
  document.addEventListener('pointerdown', closeMenu, true)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  document.removeEventListener('pointerdown', closeMenu, true)
  if (selection.value?.pane === props.index) selection.value = null
  ctrl.value?.destroy()
})

watch(
  () => [key.value, pane.tf],
  () => {
    const c = ctrl.value
    if (!c) return
    if (selection.value?.pane === props.index) selection.value = null
    c.draw.setList(drawingsOf(key.value))
    c.load()
  },
)
watch(() => pane.chartType, () => ctrl.value?.setChartType())
watch(() => pane.scale, () => ctrl.value?.applyScale())
watch(() => pane.indicators, () => ctrl.value?.syncIndicators(), { deep: true })
watch(() => app.theme, () => ctrl.value?.applyTheme())
watch(
  () => app.tool,
  (tool) => {
    if (tool === 'cursor') ctrl.value?.draw.cancelDraft()
    else ctrl.value?.draw.layoutOverlay()
  },
)
// рисунки могли изменить извне (очистка, удаление) — перерисовываем
watch(() => drawings[key.value], (list) => {
  const c = ctrl.value
  if (!c) return
  if (list !== c.draw.list) c.draw.setList(drawingsOf(key.value))
  else c.draw.redraw()
}, { deep: true })

watch(
  () => tickers[key.value]?.last,
  (last) => {
    if (last) ctrl.value?.patchLast(last)
  },
)

const alertPrices = computed(() => alerts.filter((a) => a.active && symbolKey(a.ref) === key.value).map((a) => a.price))
watch(alertPrices, (p) => ctrl.value?.setAlertLines(p))

// ---------- рисунки ----------

const selected = computed(() => ctrl.value?.draw.selectedId.value ?? null)
const anchor = computed(() => ctrl.value?.draw.anchor.value ?? null)
const actionsStyle = computed(() => {
  const a = anchor.value
  if (!a) return {}
  return { left: Math.max(6, a.x) + 'px', top: Math.max(30, a.y - 44) + 'px' }
})
const selectedColor = computed(() => (selected.value ? ctrl.value?.draw.selected()?.color : ''))

function onKey(e: KeyboardEvent) {
  if (!selected.value) return
  const t = e.target as HTMLElement
  if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') return
  if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault()
    ctrl.value?.draw.removeSelected()
  }
}

// ---------- контекстное меню ----------

function onContext(e: MouseEvent) {
  const c = ctrl.value
  if (!c || app.tool !== 'cursor') return
  const r = host.value!.getBoundingClientRect()
  const price = c.priceAt(e.clientY - r.top)
  if (price == null || !(price > 0)) return
  menu.price = price
  menu.x = Math.min(e.clientX - r.left, r.width - 250)
  menu.y = Math.min(e.clientY - r.top, r.height - 170)
  menu.open = true
}
function closeMenu(e: Event) {
  if (menu.open && !(e.target as HTMLElement).closest?.('.ctx-menu')) menu.open = false
}
function menuAlert() {
  const last = tickers[key.value]?.last ?? ctrl.value?.legend.value?.c ?? menu.price
  addAlert(pane.symbol, +menu.price.toFixed(precision.value), last)
  toast(`Оповещение: ${pane.symbol.symbol} ${fmtPrice(menu.price, precision.value)}`)
  menu.open = false
}
function menuLine() {
  ctrl.value?.draw.addHLine(+menu.price.toFixed(precision.value))
  menu.open = false
}
function menuReset() {
  ctrl.value?.resetView()
  menu.open = false
}
function menuClear() {
  clearDrawings(key.value)
  menu.open = false
}

const SCALES: { id: ScaleMode; label: string; title: string }[] = [
  { id: 'log', label: 'лог', title: 'Логарифмическая шкала' },
  { id: 'percent', label: '%', title: 'Процентная шкала' },
]
function toggleScale(id: ScaleMode) {
  pane.scale = pane.scale === id ? 'normal' : id
}
</script>

<template>
  <section class="pane" :class="{ active: isActive && paneCount > 1 }" @pointerdown.capture="app.active = index">
    <div
      ref="host"
      class="chart-host"
      :class="{ drawing: app.tool !== 'cursor' }"
      @contextmenu.prevent="onContext"
    >
      <div v-show="app.tool !== 'cursor'" ref="overlay" class="draw-overlay" />
    </div>

    <ChartLegend
      v-if="ctrl"
      :pane="pane"
      :index="index"
      :legend="ctrl.legend.value"
      :precision="precision"
      :last-time="ctrl.ui.lastTime"
      :pane-tops="ctrl.ui.paneTops"
      :ind-pane="ctrl.ui.indPane"
      :compact="isPhone || paneCount > 1"
    />

    <div v-if="ctrl" class="pane-tools">
      <button class="chip" title="Сбросить масштаб" @click="ctrl.resetView()">авто</button>
      <button v-for="s in SCALES" :key="s.id" class="chip" :class="{ on: pane.scale === s.id }" :title="s.title" @click="toggleScale(s.id)">
        {{ s.label }}
      </button>
    </div>

    <button v-if="ctrl?.ui.scrolledBack" class="rt-btn" title="К текущей цене" @click="ctrl.goRealtime()">
      <Icon name="skip" :size="16" />
    </button>

    <div v-if="selected && anchor" class="draw-actions" :style="actionsStyle" @pointerdown.stop>
      <button
        v-for="c in DRAW_COLORS"
        :key="c"
        class="swatch"
        :class="{ on: c === selectedColor }"
        :style="{ background: c }"
        :aria-label="'Цвет ' + c"
        @click="ctrl?.draw.setColor(c)"
      />
      <button class="btn sm" title="Удалить рисунок" @click="ctrl?.draw.removeSelected()"><Icon name="trash" :size="16" /></button>
    </div>

    <div v-if="menu.open" class="menu ctx-menu" :style="{ left: Math.max(4, menu.x) + 'px', top: Math.max(4, menu.y) + 'px' }">
      <button class="menu-item" @click="menuAlert"><Icon name="bell" :size="16" />Оповещение на {{ fmtPrice(menu.price, precision) }}</button>
      <button class="menu-item" @click="menuLine"><Icon name="hline" :size="16" />Линия на {{ fmtPrice(menu.price, precision) }}</button>
      <div class="menu-sep" />
      <button class="menu-item" @click="menuReset"><Icon name="maximize" :size="16" />Сбросить масштаб</button>
      <button class="menu-item" @click="menuClear"><Icon name="trash" :size="16" />Удалить все рисунки</button>
    </div>

    <div v-if="ctrl && (ctrl.ui.loading || ctrl.ui.error)" class="pane-state">
      <div v-if="ctrl.ui.loading" class="spinner" />
      <template v-else>
        <p>{{ ctrl.ui.error }}</p>
        <button class="btn primary" @click="ctrl.load()">Повторить</button>
      </template>
    </div>
  </section>
</template>

<style scoped>
.pane {
  position: relative;
  min-width: 0;
  min-height: 0;
  background: var(--bg);
  overflow: hidden;
}
.pane.active::after {
  content: '';
  position: absolute;
  inset: 0;
  border: 1px solid var(--accent);
  pointer-events: none;
  z-index: 6;
}
.chart-host {
  position: absolute;
  inset: 0;
  touch-action: none;
}
.chart-host.over-drawing :deep(canvas) {
  cursor: pointer !important;
}
.draw-overlay {
  position: absolute;
  left: 0;
  top: 0;
  z-index: 5;
  cursor: crosshair;
  touch-action: none;
}
.pane-tools {
  position: absolute;
  /* левее — обязательный знак библиотеки графиков */
  left: 52px;
  bottom: 34px;
  z-index: 4;
  display: flex;
  gap: 4px;
  opacity: 0.75;
}
.pane-tools:hover {
  opacity: 1;
}
.chip {
  height: 22px;
  padding: 0 7px;
  border-radius: 4px;
  border: 1px solid var(--border);
  background: var(--panel);
  color: var(--muted);
  font-size: 11px;
}
.chip:hover {
  color: var(--text);
}
.chip.on {
  color: var(--accent);
  border-color: var(--accent);
}
.rt-btn {
  position: absolute;
  right: 72px;
  bottom: 36px;
  z-index: 4;
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  border: 1px solid var(--border);
  background: var(--panel);
  color: var(--text);
  box-shadow: var(--shadow);
}
.rt-btn:hover {
  background: var(--hover);
}
.draw-actions {
  position: absolute;
  z-index: 7;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 6px 5px 8px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: var(--shadow);
}
.swatch {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 2px solid transparent;
}
.swatch.on {
  border-color: var(--text);
}
.ctx-menu {
  position: absolute;
  z-index: 8;
}
.pane-state {
  position: absolute;
  inset: 0;
  z-index: 3;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 16px;
  text-align: center;
  color: var(--muted);
  pointer-events: none;
}
.pane-state .btn {
  pointer-events: auto;
}
.pane-state p {
  margin: 0;
  max-width: 320px;
}
@media (max-width: 719px) {
  .chip {
    height: 26px;
    padding: 0 9px;
  }
  .swatch {
    width: 24px;
    height: 24px;
  }
}
</style>
