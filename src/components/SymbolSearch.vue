<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, shallowRef, toRef, watch } from 'vue'
import Icon from './Icon.vue'
import Modal from './Modal.vue'
import { EXCHANGE_NAMES, MARKET_NAMES, symbolKey, type ExchangeId, type MarketId, type SymbolInfo } from '../types'
import { app, setSymbol } from '../stores/app'
import ListPicker from './ListPicker.vue'
import { SOURCES, loadSymbols, withUsdVolume, type SymbolVolume } from '../exchanges'
import { autoPrecision, fmtCompact, fmtPct, fmtPrice } from '../lib/format'

type Item = SymbolVolume

const MAX_SHOWN = 80

// строка поиска живёт в общем состоянии: туда же попадают буквы, набранные до появления окна
const query = computed({
  get: () => app.search?.query ?? '',
  set: (v) => {
    if (app.search) app.search.query = v
  },
})
// выбранные биржа и рынок запоминаются между открытиями
const exchange = toRef(app.searchFilter, 'exchange')
const market = toRef(app.searchFilter, 'market')
const input = ref<HTMLInputElement>()
const cursor = ref(0)
const items = shallowRef<Item[]>([])
const state = reactive<Record<string, 'loading' | 'ok' | 'error'>>({})

onMounted(() => {
  nextTick(() => input.value?.focus())
  for (const src of SOURCES) {
    const key = `${src.exchange}:${src.market}`
    state[key] = 'loading'
    loadSymbols(src.exchange, src.market)
      .then((list) => {
        state[key] = 'ok'
        items.value = items.value.concat(withUsdVolume(list)).sort((a, b) => b.usdVolume - a.usdVolume)
      })
      .catch(() => (state[key] = 'error'))
  }
})

const loading = computed(() => Object.values(state).some((s) => s === 'loading'))
const failed = computed(() =>
  SOURCES.filter((s) => state[`${s.exchange}:${s.market}`] === 'error').map((s) => `${EXCHANGE_NAMES[s.exchange]} ${MARKET_NAMES[s.market]}`),
)

const results = computed(() => {
  const q = query.value.toUpperCase().replace(/[^A-Z0-9]/g, '')
  const starts: Item[] = []
  const rest: Item[] = []
  for (const it of items.value) {
    if (exchange.value !== 'all' && it.exchange !== exchange.value) continue
    if (market.value !== 'all' && it.market !== market.value) continue
    if (q) {
      const at = it.symbol.indexOf(q)
      if (at < 0) continue
      if (at === 0) starts.push(it)
      else rest.push(it)
    } else starts.push(it)
    if (starts.length >= MAX_SHOWN) break
  }
  return starts.concat(rest).slice(0, MAX_SHOWN)
})

watch([query, exchange, market], () => (cursor.value = 0))

function close() {
  app.search = null
}
function pick(it: SymbolInfo) {
  setSymbol(it)
  close()
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    cursor.value = Math.min(results.value.length - 1, cursor.value + 1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    cursor.value = Math.max(0, cursor.value - 1)
  } else if (e.key === 'Enter') {
    const it = results.value[cursor.value]
    if (it) pick(it)
  } else return
  nextTick(() => document.querySelector('.ss-row.cursor')?.scrollIntoView({ block: 'nearest' }))
}

const EXCHANGES: { id: ExchangeId | 'all'; label: string }[] = [
  { id: 'all', label: 'Все биржи' },
  { id: 'binance', label: 'Binance' },
  { id: 'bybit', label: 'Bybit' },
]
const MARKETS: { id: MarketId | 'all'; label: string }[] = [
  { id: 'all', label: 'Все рынки' },
  { id: 'spot', label: 'Спот' },
  { id: 'futures', label: 'Фьючерсы' },
]
</script>

<template>
  <Modal title="Поиск инструмента" :width="560" @close="close">
    <div class="ss-top">
      <div class="ss-input">
        <Icon name="search" :size="16" />
        <input
          ref="input"
          v-model="query"
          class="field"
          placeholder="Например, BTC или ETHUSDT"
          autocomplete="off"
          autocapitalize="characters"
          spellcheck="false"
          @keydown="onKey"
        />
      </div>
      <div class="ss-filters">
        <button v-for="e in EXCHANGES" :key="e.id" class="btn sm" :class="{ on: exchange === e.id }" @click="exchange = e.id">{{ e.label }}</button>
        <span class="gap" />
        <button v-for="m in MARKETS" :key="m.id" class="btn sm" :class="{ on: market === m.id }" @click="market = m.id">{{ m.label }}</button>
      </div>
    </div>
    <div class="ss-list scroll">
      <div
        v-for="(it, i) in results"
        :key="symbolKey(it)"
        class="ss-row"
        :class="{ cursor: i === cursor }"
        role="button"
        @click="pick(it)"
      >
        <span class="ss-name">
          <b>{{ it.symbol }}</b>
          <span class="tag" :class="it.exchange">{{ EXCHANGE_NAMES[it.exchange] }} · {{ MARKET_NAMES[it.market] }}</span>
        </span>
        <span class="ss-num">{{ fmtPrice(it.last, autoPrecision(it.last)) }}</span>
        <span class="ss-num" :class="it.changePct >= 0 ? 'up' : 'down'">{{ fmtPct(it.changePct) }}</span>
        <span class="ss-num muted vol">{{ it.usdVolume ? '$' + fmtCompact(it.usdVolume) : '' }}</span>
        <ListPicker :item="it" />
      </div>
      <div v-if="loading" class="ss-note"><div class="spinner" /></div>
      <p v-else-if="!results.length" class="ss-note muted">Ничего не найдено</p>
      <p v-if="failed.length" class="ss-note muted">Не удалось получить список: {{ failed.join(', ') }}</p>
    </div>
  </Modal>
</template>

<style scoped>
.ss-top {
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
  flex: none;
}
.ss-input {
  position: relative;
  color: var(--muted);
}
.ss-input .icon {
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
}
.ss-input .field {
  padding-left: 32px;
  text-transform: uppercase;
}
.ss-input .field::placeholder {
  text-transform: none;
}
.ss-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 8px;
}
.ss-filters .btn {
  padding: 0 9px;
  color: var(--muted);
}
.ss-filters .btn.on {
  color: var(--accent);
}
.gap {
  width: 10px;
}
.ss-list {
  flex: 1;
  min-height: 120px;
  height: 56vh;
}
.ss-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto 64px 70px 30px;
  align-items: center;
  column-gap: 10px;
  height: 44px;
  padding: 0 8px 0 14px;
  cursor: pointer;
}
.ss-row:hover,
.ss-row.cursor {
  background: var(--hover);
}
.ss-name {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.ss-name b {
  overflow: hidden;
  text-overflow: ellipsis;
}
.ss-num {
  text-align: right;
  white-space: nowrap;
}
.star {
  color: var(--muted);
}
.star.on {
  background: none;
  color: var(--warn);
}
.star.on :deep(path) {
  fill: currentColor;
}
.ss-note {
  display: grid;
  place-items: center;
  padding: 18px;
  margin: 0;
  text-align: center;
}
@media (max-width: 719px) {
  .ss-list {
    height: auto;
  }
  .ss-row {
    grid-template-columns: minmax(0, 1fr) auto 60px 30px;
    height: 50px;
  }
  .vol {
    display: none;
  }
  .ss-name {
    flex-direction: column;
    align-items: flex-start;
    gap: 3px;
  }
}
</style>
