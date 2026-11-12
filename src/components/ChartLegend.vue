<script setup lang="ts">
import { computed, ref } from 'vue'
import Icon from './Icon.vue'
import { EXCHANGE_NAMES, MARKET_NAMES, symbolKey } from '../types'
import { app, openSearch, type PaneState } from '../stores/app'
import { adapters } from '../exchanges'
import { getTf } from '../lib/timeframes'
import { fmtCompact, fmtDuration, fmtPct, fmtPrice } from '../lib/format'
import { indicatorDef, indicatorTitle } from '../lib/indicators'
import { nowSec } from '../lib/now'
import { dayStats, dayProgress } from '../stores/atr'
import { tickers } from '../stores/tickers'
import type { Legend } from '../chart/controller'

const props = defineProps<{
  pane: PaneState
  index: number
  legend: Legend | null
  precision: number
  lastTime: number
  compact: boolean
  paneTops: number[]
  indPane: Record<string, number>
}>()

const tf = computed(() => getTf(props.pane.tf))
const status = computed(() => adapters[props.pane.symbol.exchange].status(props.pane.symbol.market).value)
const countdown = computed(() => {
  if (!props.lastTime || tf.value.id === '1M') return ''
  const left = props.lastTime + tf.value.sec - nowSec.value
  return left > 0 ? fmtDuration(left) : ''
})

// Дневной ATR и сколько его уже пройдено сегодня: от открытия дня и по размаху дня
const day = computed(() => {
  const key = symbolKey(props.pane.symbol)
  const s = dayStats[key]
  const last = tickers[key]?.last
  if (!s || !last) return null
  const p = dayProgress(s, last)
  // меньше 30% — запас хода большой, больше 70% — дневной ход почти выбран
  const tone = (v: number) => (v < 30 ? 'up' : v > 70 ? 'down' : '')
  return {
    atr: fmtPrice(s.atr, props.precision),
    pct: ((s.atr / last) * 100).toFixed(2),
    fromOpen: p.fromOpen.toFixed(0),
    fromOpenTone: tone(p.fromOpen),
    traveled: p.traveled.toFixed(0),
    traveledTone: tone(p.traveled),
    stop: fmtPrice(s.atr * 0.1, props.precision),
  }
})

const rows = computed(() =>
  props.pane.indicators.map((inst) => {
    const def = indicatorDef(inst.type)!
    const values = props.legend?.ind[inst.id] ?? []
    const p = def.type === 'vol' ? -1 : (def.precision ?? props.precision)
    const paneIdx = props.indPane[inst.id] ?? 0
    return {
      inst,
      // подпись индикатора из отдельной панели ставим в начало этой панели
      top: paneIdx ? (props.paneTops[paneIdx] ?? 0) : -1,
      title: indicatorTitle(inst),
      hasParams: def.params.length > 0 || def.plots.some((x) => x.kind === 'line'),
      values: inst.visible
        ? def.plots.map((plot, i) => ({
            text: p < 0 ? fmtCompact(values[i]) : fmtPrice(values[i], p),
            color: inst.colors?.[i] ?? (plot.kind === 'hist' ? '' : plot.color),
          }))
        : [],
    }
  }),
)

const mainRows = computed(() => rows.value.filter((r) => r.top < 0))
const paneRows = computed(() => rows.value.filter((r) => r.top >= 0))

// На сенсорном экране нет наведения: действия строки открываются касанием
const openRow = ref<string | null>(null)
const collapsed = ref(false)

function remove(id: string) {
  const i = props.pane.indicators.findIndex((x) => x.id === id)
  if (i >= 0) props.pane.indicators.splice(i, 1)
}

function pickSymbol() {
  app.active = props.index
  openSearch()
}
</script>

<template>
  <div class="legend" :class="{ compact }">
    <div class="legend-main">
      <button class="legend-symbol" title="Сменить инструмент" @click="pickSymbol">
        <span class="dot" :class="status" :title="status === 'open' ? 'Данные в реальном времени' : 'Нет соединения'" />
        <b>{{ pane.symbol.symbol }}</b>
        <span class="muted">· {{ tf.label }} · {{ EXCHANGE_NAMES[pane.symbol.exchange] }} {{ MARKET_NAMES[pane.symbol.market] }}</span>
      </button>
      <span v-if="legend" class="ohlc" :class="legend.up ? 'up' : 'down'">
        <span><i>О</i>{{ fmtPrice(legend.o, precision) }}</span>
        <span><i>В</i>{{ fmtPrice(legend.h, precision) }}</span>
        <span><i>Н</i>{{ fmtPrice(legend.l, precision) }}</span>
        <span><i>З</i>{{ fmtPrice(legend.c, precision) }}</span>
        <span :class="legend.chg >= 0 ? 'up' : 'down'">{{ fmtPct(legend.chgPct) }}</span>
      </span>
      <span v-if="countdown" class="muted countdown" title="До закрытия свечи">{{ countdown }}</span>
    </div>
    <div
      v-if="day"
      class="legend-atr"
      title="ATR — средний диапазон 5 дневных свечей без аномально больших и маленьких. Пройдено за сегодня: от открытия дня / по размаху дня. Стоп — 10% ATR."
    >
      <span><i>ATR</i>{{ day.atr }} <i>({{ day.pct }}%)</i></span>
      <span><i>пройдено</i><b :class="day.fromOpenTone">{{ day.fromOpen }}%</b> / <b :class="day.traveledTone">{{ day.traveled }}%</b></span>
      <span><i>стоп</i>{{ day.stop }}</span>
    </div>
    <div v-if="mainRows.length" class="legend-rows">
      <button v-if="mainRows.length > 1" class="collapse muted" :title="collapsed ? 'Показать индикаторы' : 'Свернуть индикаторы'" @click="collapsed = !collapsed">
        <Icon name="chevron" :size="14" :style="{ transform: collapsed ? 'rotate(-90deg)' : '' }" />
        <span v-if="collapsed">{{ mainRows.length }}</span>
      </button>
    </div>
    <template v-for="group in [collapsed ? [] : mainRows, paneRows]" :key="group === paneRows ? 'p' : 'm'">
      <div
        v-for="r in group"
        :key="r.inst.id"
        class="legend-row"
        :class="{ open: openRow === r.inst.id, off: !r.inst.visible, floating: r.top >= 0 }"
        :style="r.top >= 0 ? { top: r.top + 'px' } : undefined"
        @click="openRow = openRow === r.inst.id ? null : r.inst.id"
      >
        <span class="row-title">{{ r.title }}</span>
        <span v-for="(v, i) in r.values" :key="i" class="row-val" :style="{ color: v.color || undefined }">{{ v.text }}</span>
        <span class="row-actions" @click.stop>
          <button class="btn sm" :title="r.inst.visible ? 'Скрыть' : 'Показать'" @click="r.inst.visible = !r.inst.visible">
            <Icon :name="r.inst.visible ? 'eye' : 'eyeOff'" :size="15" />
          </button>
          <button v-if="r.hasParams" class="btn sm" title="Настройки" @click="app.indSettings = { pane: index, id: r.inst.id }">
            <Icon name="sliders" :size="15" />
          </button>
          <button class="btn sm" title="Удалить" @click="remove(r.inst.id)"><Icon name="x" :size="15" /></button>
        </span>
      </div>
    </template>
  </div>
</template>

<style scoped>
.legend {
  position: absolute;
  top: 4px;
  left: 6px;
  right: 64px;
  z-index: 4;
  pointer-events: none;
  font-size: 12px;
  line-height: 20px;
}
.legend-main {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  column-gap: 10px;
  width: fit-content;
  max-width: 100%;
  background: color-mix(in srgb, var(--bg) 70%, transparent);
  border-radius: 4px;
}
.legend-symbol {
  pointer-events: auto;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 0 4px;
  margin-left: -4px;
  border-radius: 4px;
  font-size: 13px;
  white-space: nowrap;
}
.legend-symbol:hover {
  background: var(--hover);
}
.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--muted);
}
.dot.open {
  background: var(--up);
}
.dot.connecting {
  background: var(--warn);
}
.dot.closed {
  background: var(--down);
}
.ohlc {
  display: inline-flex;
  flex-wrap: wrap;
  column-gap: 8px;
}
.ohlc i {
  font-style: normal;
  color: var(--muted);
  margin-right: 2px;
}
.countdown {
  font-size: 11px;
}
.legend-atr {
  pointer-events: auto;
  display: flex;
  flex-wrap: wrap;
  column-gap: 10px;
  width: fit-content;
  max-width: 100%;
  background: color-mix(in srgb, var(--bg) 70%, transparent);
  border-radius: 4px;
  cursor: help;
}
.legend-atr i {
  font-style: normal;
  color: var(--muted);
  margin-right: 3px;
}
.legend-atr b {
  font-weight: 600;
}
.legend-rows {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}
.collapse {
  pointer-events: auto;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  height: 18px;
  padding: 0 3px;
  margin-left: -4px;
  border-radius: 4px;
  font-size: 11px;
}
.collapse:hover {
  background: var(--hover);
}
.legend-row {
  pointer-events: auto;
  display: flex;
  width: fit-content;
  max-width: 100%;
  background: color-mix(in srgb, var(--bg) 70%, transparent);
  align-items: center;
  gap: 6px;
  height: 22px;
  padding: 0 4px;
  margin-left: -4px;
  border-radius: 4px;
  white-space: nowrap;
  cursor: default;
}
.legend-row.floating {
  position: absolute;
  left: 0;
}
.legend-row.off .row-title {
  opacity: 0.5;
}
.row-title {
  color: var(--muted);
}
.row-actions {
  display: none;
  align-items: center;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 5px;
}
.row-actions .btn.sm {
  height: 22px;
  min-width: 24px;
}
.legend-row.open .row-actions {
  display: inline-flex;
}
@media (hover: hover) {
  .legend-row:hover {
    background: var(--panel);
  }
  .legend-row:hover .row-actions {
    display: inline-flex;
  }
}
.legend.compact {
  font-size: 11px;
}
.legend.compact .legend-main,
.legend.compact .ohlc {
  column-gap: 6px;
}
.legend.compact .legend-symbol .muted {
  font-size: 11px;
}
</style>
