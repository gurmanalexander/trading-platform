<script setup lang="ts">
import { computed } from 'vue'
import { fmtMoney, fmtPct } from '../lib/format'
import { plural, t } from '../lib/i18n'

/**
 * Разрез строками: подпись, полоса от общей нулевой линии (прибыль вправо, убыток влево) и сумма.
 * Значение всегда написано числом — полоса его только иллюстрирует.
 */
export interface Row {
  key: string
  label: string
  net: number
  trades: number
  wins: number
}
const props = defineProps<{ items: Row[]; clickable?: boolean }>()
const emit = defineEmits<{ pick: [key: string] }>()

const max = computed(() => Math.max(1e-9, ...props.items.map((r) => Math.abs(r.net))))
const hasNeg = computed(() => props.items.some((r) => r.net < 0))
const hasPos = computed(() => props.items.some((r) => r.net > 0))
/** Где проходит ноль: посередине, если есть и прибыль, и убыток; иначе у края */
const zero = computed(() => (hasNeg.value && hasPos.value ? 50 : hasNeg.value ? 100 : 0))

function style(r: Row) {
  const span = zero.value === 50 ? 50 : 100
  const w = (Math.abs(r.net) / max.value) * span
  return r.net >= 0 ? { left: zero.value + '%', width: w + '%' } : { left: zero.value - w + '%', width: w + '%' }
}
const hint = (r: Row) =>
  r.trades ? `${plural(r.trades, ['сделка', 'сделки', 'сделок'], ['trade', 'trades'])} · ${t('прибыльных {p}', { p: fmtPct(r.wins / r.trades, 0) })}` : t('нет сделок')
</script>

<template>
  <ul class="rows">
    <li v-for="r in items" :key="r.key" class="rw" :class="{ click: clickable && r.trades, off: !r.trades }" :title="hint(r)" :tabindex="clickable && r.trades ? 0 : undefined" @click="clickable && r.trades && emit('pick', r.key)" @keydown.enter="clickable && r.trades && emit('pick', r.key)">
      <span class="rw-label">{{ r.label }}</span>
      <span class="rw-track">
        <span class="rw-zero" :style="{ left: zero + '%' }" />
        <span v-if="r.trades" class="rw-bar" :class="r.net >= 0 ? 'pos' : 'neg'" :style="style(r)" />
      </span>
      <span class="rw-val">{{ r.trades ? fmtMoney(r.net) : '—' }}</span>
      <span class="rw-n muted">{{ r.trades || '' }}</span>
    </li>
  </ul>
</template>

<style>
.rows {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.rw {
  display: grid;
  grid-template-columns: minmax(64px, 28%) 1fr 84px 30px;
  align-items: center;
  gap: 8px;
  height: 28px;
  padding: 0 6px;
  border-radius: 6px;
}
.rw.click {
  cursor: pointer;
}
.rw.click:hover {
  background: var(--hover);
}
.rw.off {
  color: var(--muted);
}
.rw-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rw-track {
  position: relative;
  height: 10px;
}
.rw-zero {
  position: absolute;
  top: -4px;
  bottom: -4px;
  width: 1px;
  background: var(--border);
}
.rw-bar {
  position: absolute;
  top: 0;
  bottom: 0;
  min-width: 2px;
}
.rw-bar.pos {
  background: var(--up);
  border-radius: 0 4px 4px 0;
}
.rw-bar.neg {
  background: var(--down);
  border-radius: 4px 0 0 4px;
}
.rw-val {
  text-align: right;
  white-space: nowrap;
}
.rw-n {
  text-align: right;
  font-size: 11px;
}
</style>
