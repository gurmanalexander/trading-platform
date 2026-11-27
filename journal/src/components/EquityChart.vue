<script setup lang="ts">
import { computed, ref } from 'vue'
import type { EquityPoint } from '../core/stats'
import { fmtDateTime, fmtMoney, fmtShort } from '../lib/format'
import { locale, t } from '../lib/i18n'
import { niceTicks, useWidth } from './useSize'

/** Накопленный результат: ступенчатая линия (итог меняется в момент закрытия сделки) с заливкой до нуля */
const props = defineProps<{ points: EquityPoint[]; height?: number }>()

const box = ref<HTMLElement | null>(null)
const width = useWidth(box)
const H = computed(() => props.height ?? 240)
const PAD = { top: 12, right: 52, bottom: 22, left: 4 }

const scale = computed(() => {
  const pts = props.points
  const t0 = pts[0]?.t ?? 0
  const t1 = pts[pts.length - 1]?.t ?? 1
  let lo = 0
  let hi = 0
  for (const p of pts) {
    if (p.v < lo) lo = p.v
    if (p.v > hi) hi = p.v
  }
  if (lo === hi) hi = lo + 1
  const padV = (hi - lo) * 0.08
  lo -= lo < 0 ? padV : 0
  hi += hi > 0 ? padV : 0
  const w = Math.max(10, width.value - PAD.left - PAD.right)
  const h = H.value - PAD.top - PAD.bottom
  const x = (ms: number) => PAD.left + (t1 === t0 ? w : ((ms - t0) / (t1 - t0)) * w)
  const y = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo)) * h
  return { x, y, lo, hi, t0, t1, w, h }
})

const path = computed(() => {
  const { x, y } = scale.value
  const pts = props.points
  if (pts.length < 2) return { line: '', area: '' }
  let d = `M${x(pts[0].t).toFixed(1)},${y(pts[0].v).toFixed(1)}`
  for (let i = 1; i < pts.length; i++) d += `H${x(pts[i].t).toFixed(1)}V${y(pts[i].v).toFixed(1)}`
  const zero = y(0).toFixed(1)
  return { line: d, area: `${d}V${zero}H${x(pts[0].t).toFixed(1)}Z` }
})

const yTicks = computed(() => niceTicks(scale.value.lo, scale.value.hi, 5).map((v) => ({ v, y: scale.value.y(v) })))

const xTicks = computed(() => {
  const { t0, t1, x } = scale.value
  const n = Math.max(2, Math.min(6, Math.floor(width.value / 130)))
  const span = t1 - t0
  if (span <= 0) return []
  const fmt: Intl.DateTimeFormatOptions = span < 2 * 86_400_000 ? { hour: '2-digit', minute: '2-digit' } : { day: 'numeric', month: 'short' }
  return Array.from({ length: n }, (_, i) => {
    const ms = t0 + (span * (i + 0.5)) / n
    return { x: x(ms), label: new Date(ms).toLocaleString(locale(), fmt) }
  })
})

const last = computed(() => props.points[props.points.length - 1]?.v ?? 0)
const tone = computed(() => (last.value >= 0 ? 'pos' : 'neg'))

// ---------- наведение ----------

const hover = ref<number | null>(null)
function move(e: PointerEvent) {
  const rect = box.value!.getBoundingClientRect()
  const px = e.clientX - rect.left
  const { t0, t1, w } = scale.value
  const ms = t0 + ((px - PAD.left) / w) * (t1 - t0)
  // последняя точка не позже указателя: итог держится до следующей сделки
  const pts = props.points
  let lo = 0
  let hi = pts.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (pts[mid].t <= ms) lo = mid
    else hi = mid - 1
  }
  hover.value = lo
}
const tip = computed(() => {
  if (hover.value == null) return null
  const p = props.points[hover.value]
  if (!p) return null
  const prev = props.points[hover.value - 1]
  const { x, y } = scale.value
  const px = x(p.t)
  return { x: px, y: y(p.v), p, delta: prev ? p.v - prev.v : 0, flip: px > width.value * 0.6 }
})
</script>

<template>
  <div ref="box" class="eq" :class="tone" :style="{ height: H + 'px' }" @pointermove="move" @pointerleave="hover = null">
    <svg v-if="points.length > 1" :width="width" :height="H" role="img" :aria-label="t('График накопленного результата')">
      <defs>
        <linearGradient id="eq-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" class="g0" />
          <stop offset="1" class="g1" />
        </linearGradient>
      </defs>
      <g class="grid">
        <line v-for="k in yTicks" :key="k.v" :x1="PAD.left" :x2="width - PAD.right" :y1="k.y" :y2="k.y" :class="{ zero: k.v === 0 }" />
      </g>
      <path class="area" :d="path.area" fill="url(#eq-fill)" />
      <path class="line" :d="path.line" />
      <g class="axis">
        <text v-for="k in yTicks" :key="k.v" :x="width - PAD.right + 6" :y="k.y + 4">{{ fmtShort(k.v, false) }}</text>
        <text v-for="(k, i) in xTicks" :key="i" :x="k.x" :y="H - 6" text-anchor="middle">{{ k.label }}</text>
      </g>
      <g v-if="tip">
        <line class="cross" :x1="tip.x" :x2="tip.x" :y1="PAD.top" :y2="H - PAD.bottom" />
        <circle class="dot" :cx="tip.x" :cy="tip.y" r="4.5" />
      </g>
    </svg>
    <p v-else class="muted none">{{ t('За этот период закрытых сделок нет') }}</p>
    <div v-if="tip" class="tip" :class="{ flip: tip.flip }" :style="{ left: tip.x + 'px', top: Math.max(4, tip.y - 58) + 'px' }">
      <b>{{ fmtMoney(tip.p.v) }}</b>
      <span v-if="hover" class="delta" :class="tip.delta >= 0 ? 'up' : 'down'">{{ fmtMoney(tip.delta) }}</span>
      <span class="muted">{{ fmtDateTime(tip.p.t) }}</span>
    </div>
  </div>
</template>

<style>
.eq {
  position: relative;
  width: 100%;
  touch-action: pan-y;
}
.eq svg {
  display: block;
}
.eq.pos {
  --tone: var(--up);
}
.eq.neg {
  --tone: var(--down);
}
.eq .line {
  fill: none;
  stroke: var(--tone);
  stroke-width: 2;
  stroke-linejoin: round;
}
.eq .g0 {
  stop-color: var(--tone);
  stop-opacity: 0.22;
}
.eq .g1 {
  stop-color: var(--tone);
  stop-opacity: 0.02;
}
.eq .grid line {
  stroke: var(--border);
  stroke-width: 1;
  stroke-dasharray: 2 4;
  opacity: 0.7;
}
.eq .grid line.zero {
  stroke-dasharray: none;
  opacity: 1;
}
.eq .axis text {
  fill: var(--muted);
  font-size: 11px;
}
.eq .cross {
  stroke: var(--muted);
  stroke-width: 1;
  opacity: 0.6;
}
.eq .dot {
  fill: var(--tone);
  stroke: var(--panel);
  stroke-width: 2;
}
.eq .none {
  display: grid;
  place-items: center;
  height: 100%;
  margin: 0;
}
.tip {
  position: absolute;
  z-index: 5;
  transform: translateX(10px);
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 6px 9px;
  border-radius: 7px;
  border: 1px solid var(--border);
  background: var(--panel-2);
  box-shadow: var(--shadow);
  white-space: nowrap;
  pointer-events: none;
  font-size: 12px;
}
.tip.flip {
  transform: translateX(calc(-100% - 10px));
}
.tip b {
  font-size: 14px;
}
</style>
