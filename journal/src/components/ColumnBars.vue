<script setup lang="ts">
import { computed, ref } from 'vue'
import { fmtMoney, fmtPct, fmtShort } from '../lib/format'
import { plural, t } from '../lib/i18n'
import { niceTicks, useWidth } from './useSize'

/** Вертикальные столбики результата: вверх от нуля — прибыль, вниз — убыток (дни, часы, дни недели) */
export interface Column {
  key: string | number
  /** подпись под столбиком; пустая — без подписи */
  label: string
  /** заголовок во всплывающей подсказке */
  title: string
  net: number
  trades: number
  wins: number
}
const props = defineProps<{ items: Column[]; height?: number; label: string }>()
const emit = defineEmits<{ pick: [key: string | number] }>()

const box = ref<HTMLElement | null>(null)
const width = useWidth(box)
const H = computed(() => props.height ?? 150)
const PAD = { top: 8, right: 44, bottom: 20, left: 2 }

const geo = computed(() => {
  let lo = 0
  let hi = 0
  for (const c of props.items) {
    if (c.net < lo) lo = c.net
    if (c.net > hi) hi = c.net
  }
  if (lo === hi) hi = lo + 1
  const w = Math.max(10, width.value - PAD.left - PAD.right)
  const h = H.value - PAD.top - PAD.bottom
  const n = Math.max(1, props.items.length)
  const slot = w / n
  // между столбиками всегда остаётся зазор не меньше 2 px
  const bar = Math.max(1, Math.min(28, slot - 2))
  const y = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo)) * h
  const zero = y(0)
  const bars = props.items.map((c, i) => {
    const top = Math.min(zero, y(c.net))
    const height = Math.max(c.trades ? 1.5 : 0, Math.abs(y(c.net) - zero))
    return { c, x: PAD.left + slot * i + (slot - bar) / 2, cx: PAD.left + slot * (i + 0.5), y: c.net >= 0 ? zero - height : top, h: height, slotX: PAD.left + slot * i }
  })
  // подписи не должны наезжать друг на друга: показываем каждую k-ю
  const every = Math.max(1, Math.ceil(46 / slot))
  return { bars, bar, slot, zero, lo, hi, every, ticks: niceTicks(lo, hi, 3).map((v) => ({ v, y: y(v) })) }
})

const hover = ref<number | null>(null)
const tip = computed(() => {
  if (hover.value == null) return null
  const b = geo.value.bars[hover.value]
  return b ? { ...b, flip: b.cx > width.value * 0.6 } : null
})
/** Скругление только у конца столбика, противоположного нулю */
function barPath(b: { x: number; y: number; h: number; c: Column }, w: number): string {
  const r = Math.min(3, w / 2, b.h)
  const { x, y, h } = b
  if (b.c.net >= 0) return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`
  return `M${x},${y}V${y + h - r}Q${x},${y + h} ${x + r},${y + h}H${x + w - r}Q${x + w},${y + h} ${x + w},${y + h - r}V${y}Z`
}
</script>

<template>
  <div ref="box" class="cols" :style="{ height: H + 'px' }" @pointerleave="hover = null">
    <svg :width="width" :height="H" role="img" :aria-label="label">
      <g class="grid">
        <line v-for="k in geo.ticks" :key="k.v" :x1="PAD.left" :x2="width - PAD.right" :y1="k.y" :y2="k.y" :class="{ zero: k.v === 0 }" />
      </g>
      <g class="axis">
        <text v-for="k in geo.ticks" :key="k.v" :x="width - PAD.right + 6" :y="k.y + 4">{{ fmtShort(k.v, false) }}</text>
      </g>
      <g v-for="(b, i) in geo.bars" :key="b.c.key">
        <path v-if="b.c.trades" :d="barPath(b, geo.bar)" class="bar" :class="[b.c.net >= 0 ? 'pos' : 'neg', { hot: hover === i }]" />
        <text v-if="b.c.label && i % geo.every === 0" class="lbl" :x="Math.max(b.cx, 16)" :y="H - 5" text-anchor="middle">{{ b.c.label }}</text>
        <!-- область наведения шире самого столбика -->
        <rect class="hit" :x="b.slotX" :y="0" :width="geo.slot" :height="H" @pointerenter="hover = i" @pointermove="hover = i" @click="b.c.trades && emit('pick', b.c.key)" />
      </g>
    </svg>
    <div v-if="tip && tip.c.trades" class="tip" :class="{ flip: tip.flip }" :style="{ left: tip.cx + 'px', top: '4px' }">
      <b>{{ fmtMoney(tip.c.net) }}</b>
      <span>{{ tip.c.title }}</span>
      <span class="muted">{{ plural(tip.c.trades, ['сделка', 'сделки', 'сделок'], ['trade', 'trades']) }} · {{ t('прибыльных {p}', { p: fmtPct(tip.c.wins / tip.c.trades, 0) }) }}</span>
    </div>
  </div>
</template>

<style>
.cols {
  position: relative;
  width: 100%;
}
.cols svg {
  display: block;
}
.cols .grid line {
  stroke: var(--border);
  stroke-dasharray: 2 4;
  opacity: 0.7;
}
.cols .grid line.zero {
  stroke-dasharray: none;
  opacity: 1;
}
.cols .axis text,
.cols .lbl {
  fill: var(--muted);
  font-size: 11px;
}
.cols .bar.pos {
  fill: var(--up);
}
.cols .bar.neg {
  fill: var(--down);
}
.cols .bar.hot {
  filter: brightness(1.2);
}
.cols .hit {
  fill: transparent;
  cursor: pointer;
}
</style>
