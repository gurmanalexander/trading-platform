<script setup lang="ts">
import { computed, onBeforeUnmount, shallowRef, watch } from 'vue'
import { symbolKey, type OrderBook } from '../types'
import { activePane } from '../stores/app'
import { adapters } from '../exchanges'
import { fmtCompact, fmtPrice, precisionOf } from '../lib/format'

const book = shallowRef<OrderBook | null>(null)
let off: (() => void) | null = null

watch(
  () => symbolKey(activePane.value.symbol),
  () => {
    off?.()
    book.value = null
    const s = activePane.value.symbol
    off = adapters[s.exchange].subscribeBook(s.market, s.symbol, (b) => (book.value = b))
  },
  { immediate: true },
)
onBeforeUnmount(() => off?.())

interface Row {
  price: string
  size: string
  total: string
  fill: string
}

const view = computed(() => {
  const b = book.value
  if (!b || !b.bids.length || !b.asks.length) return null
  const key = symbolKey(activePane.value.symbol)
  const p = precisionOf(key, b.bids[0][0])
  const build = (levels: [number, number][]) => {
    let cum = 0
    return levels.map(([price, size]) => ({ price, size, cum: (cum += size) }))
  }
  const bids = build(b.bids)
  const asks = build(b.asks)
  const max = Math.max(bids[bids.length - 1].cum, asks[asks.length - 1].cum) || 1
  const fmt = (r: { price: number; size: number; cum: number }): Row => ({
    price: fmtPrice(r.price, p),
    size: fmtCompact(r.size),
    total: fmtCompact(r.cum),
    fill: ((r.cum / max) * 100).toFixed(1) + '%',
  })
  const spread = b.asks[0][0] - b.bids[0][0]
  return {
    bids: bids.map(fmt),
    asks: asks.map(fmt),
    spread: fmtPrice(spread, p),
    spreadPct: ((spread / b.asks[0][0]) * 100).toFixed(3) + '%',
  }
})
</script>

<template>
  <div class="ob">
    <div class="ob-head muted"><span>Цена</span><span>Объём</span><span>Сумма</span></div>
    <template v-if="view">
      <div class="side asks">
        <div v-for="(r, i) in view.asks" :key="i" class="ob-row" :style="{ '--fill': r.fill }">
          <span class="down">{{ r.price }}</span><span>{{ r.size }}</span><span class="muted">{{ r.total }}</span>
        </div>
      </div>
      <div class="spread"><span class="muted">Спред</span> {{ view.spread }} <span class="muted">({{ view.spreadPct }})</span></div>
      <div class="side bids">
        <div v-for="(r, i) in view.bids" :key="i" class="ob-row" :style="{ '--fill': r.fill }">
          <span class="up">{{ r.price }}</span><span>{{ r.size }}</span><span class="muted">{{ r.total }}</span>
        </div>
      </div>
    </template>
    <div v-else class="wait"><div class="spinner" /></div>
  </div>
</template>

<style scoped>
.ob {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  font-size: 12px;
}
.ob-head,
.ob-row {
  display: grid;
  grid-template-columns: 1.2fr 1fr 1fr;
  padding: 0 12px;
}
.ob-head {
  height: 32px;
  align-items: center;
  font-size: 11px;
  border-bottom: 1px solid var(--border);
  flex: none;
}
.ob-head span:not(:first-child),
.ob-row span:not(:first-child) {
  text-align: right;
}
.side {
  flex: 1 1 0;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
/* продажи растут вверх от спреда: лучшая цена — у середины */
.asks {
  flex-direction: column-reverse;
}
.ob-row {
  height: 21px;
  line-height: 21px;
  flex: none;
  background: linear-gradient(to left, var(--row-bg) var(--fill), transparent var(--fill));
}
.asks .ob-row {
  --row-bg: color-mix(in srgb, var(--down) 14%, transparent);
}
.bids .ob-row {
  --row-bg: color-mix(in srgb, var(--up) 14%, transparent);
}
.spread {
  flex: none;
  padding: 6px 12px;
  border-block: 1px solid var(--border);
  text-align: center;
}
.wait {
  flex: 1;
  display: grid;
  place-items: center;
}
</style>
