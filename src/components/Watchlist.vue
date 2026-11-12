<script setup lang="ts">
import Icon from './Icon.vue'
import { EXCHANGE_NAMES, sameSymbol, symbolKey, type SymbolRef } from '../types'
import { activePane, openSearch, setSymbol } from '../stores/app'
import { tickers, useTickers } from '../stores/tickers'
import { watchlist, toggleWatch } from '../stores/watchlist'
import { fmtPct, fmtPrice, precisionOf } from '../lib/format'

useTickers(() => watchlist)

const MARKET_SHORT = { spot: 'спот', futures: 'фьюч' } as const

function price(r: SymbolRef) {
  const key = symbolKey(r)
  const t = tickers[key]
  return t ? fmtPrice(t.last, precisionOf(key, t.last)) : '—'
}
</script>

<template>
  <div class="wl">
    <div class="wl-head">
      <span class="muted">Инструмент</span>
      <span class="muted num">Цена</span>
      <span class="muted num">24ч</span>
      <button class="btn sm" title="Добавить инструмент" @click="openSearch()"><Icon name="plus" :size="16" /></button>
    </div>
    <div class="wl-list scroll">
      <div
        v-for="r in watchlist"
        :key="symbolKey(r)"
        class="wl-row"
        :class="{ active: sameSymbol(r, activePane.symbol) }"
        role="button"
        tabindex="0"
        @click="setSymbol(r)"
        @keydown.enter="setSymbol(r)"
      >
        <span class="name">
          <b>{{ r.symbol }}</b>
          <span class="tag" :class="r.exchange">{{ EXCHANGE_NAMES[r.exchange] }} {{ MARKET_SHORT[r.market] }}</span>
        </span>
        <span class="num">{{ price(r) }}</span>
        <span class="num" :class="(tickers[symbolKey(r)]?.changePct ?? 0) >= 0 ? 'up' : 'down'">
          {{ fmtPct(tickers[symbolKey(r)]?.changePct) }}
        </span>
        <button class="btn sm rm" title="Убрать из списка" @click.stop="toggleWatch(r)"><Icon name="x" :size="14" /></button>
      </div>
      <p v-if="!watchlist.length" class="empty muted">Список пуст. Нажмите «+», чтобы добавить инструменты.</p>
    </div>
  </div>
</template>

<style scoped>
.wl {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.wl-head,
.wl-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto 62px 26px;
  align-items: center;
  column-gap: 8px;
  padding: 0 6px 0 12px;
}
.wl-head {
  height: 32px;
  font-size: 11px;
  border-bottom: 1px solid var(--border);
  flex: none;
}
.wl-list {
  flex: 1;
  min-height: 0;
}
.wl-row {
  height: 44px;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 55%, transparent);
  cursor: pointer;
}
.wl-row:hover {
  background: var(--hover);
}
.wl-row.active {
  background: var(--accent-soft);
  box-shadow: inset 2px 0 0 var(--accent);
}
.name {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 3px;
  min-width: 0;
}
.name b {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}
.num {
  text-align: right;
  white-space: nowrap;
}
.rm {
  color: var(--muted);
}
@media (hover: hover) {
  .rm {
    visibility: hidden;
  }
  .wl-row:hover .rm {
    visibility: visible;
  }
}
.empty {
  padding: 20px 14px;
  text-align: center;
}
</style>
