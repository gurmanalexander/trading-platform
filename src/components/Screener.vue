<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import Icon from './Icon.vue'
import { sameSymbol, symbolKey, EXCHANGE_NAMES, MARKET_NAMES } from '../types'
import { activePane, setSymbol } from '../stores/app'
import { settings, state, view, total, sortBy, refresh, resetSettings, startAutoRefresh, MAX_ROWS, type SortKey } from '../stores/screener'
import { activeList, inActiveList, toggleWatch } from '../stores/watchlist'
import { fmtPct, fmtPriceShort, fmtVolume } from '../lib/format'

const showSettings = ref(false)
const stop = startAutoRefresh()
onBeforeUnmount(stop)

// другая биржа или рынок — другой список: запрашиваем сразу
watch(() => [settings.exchange, settings.market], () => refresh())

const COLS: { id: SortKey; label: string }[] = [
  { id: 'symbol', label: 'Инструмент' },
  { id: 'price', label: 'Цена' },
  { id: 'change', label: '24ч' },
  { id: 'volume', label: 'Объём' },
]
</script>

<template>
  <div class="sc">
    <div class="sc-top">
      <button class="btn sm filter" :class="{ on: showSettings }" title="Настройки отбора" @click="showSettings = !showSettings">
        <Icon name="filter" :size="15" />
        <span>{{ EXCHANGE_NAMES[settings.exchange] }} · {{ MARKET_NAMES[settings.market] }} · от {{ settings.minVolume }} млн $</span>
      </button>
      <span class="muted count" :title="state.updatedAt ? 'Обновлено ' + new Date(state.updatedAt).toLocaleTimeString('ru-RU') : ''">{{ total.length }}</span>
      <button class="btn sm" title="Обновить" :disabled="state.loading" @click="refresh()"><Icon name="refresh" :size="15" /></button>
    </div>

    <form v-if="showSettings" class="sc-form" @submit.prevent>
      <label>
        <span>Биржа</span>
        <select v-model="settings.exchange" class="field">
          <option value="binance">Binance</option>
          <option value="bybit">Bybit</option>
        </select>
      </label>
      <label>
        <span>Рынок</span>
        <select v-model="settings.market" class="field">
          <option value="futures">Фьючерсы</option>
          <option value="spot">Спот</option>
        </select>
      </label>
      <label>
        <span>Объём за 24ч от, млн $</span>
        <input v-model.number="settings.minVolume" class="field" type="number" min="0" step="5" inputmode="decimal" />
      </label>
      <label>
        <span>Изменение за 24ч от, % (по модулю)</span>
        <input v-model.number="settings.minChange" class="field" type="number" min="0" step="1" inputmode="decimal" />
      </label>
      <label>
        <span>Валюта котировки</span>
        <select v-model="settings.quote" class="field">
          <option value="USDT">Только USDT</option>
          <option value="all">Любая</option>
        </select>
      </label>
      <label>
        <span>Сортировка</span>
        <span class="pair">
          <select v-model="settings.sort" class="field">
            <option value="volume">Объём</option>
            <option value="change">Изменение за 24ч</option>
            <option value="price">Цена</option>
            <option value="symbol">Название</option>
          </select>
          <select v-model="settings.dir" class="field">
            <option value="desc">По убыванию</option>
            <option value="asc">По возрастанию</option>
          </select>
        </span>
      </label>
      <button type="button" class="btn sm reset" @click="resetSettings">Сбросить настройки</button>
    </form>

    <div class="sc-head">
      <button v-for="c in COLS" :key="c.id" class="muted" :class="{ on: settings.sort === c.id, num: c.id !== 'symbol' }" @click="sortBy(c.id)">
        {{ c.label }}
        <Icon v-if="settings.sort === c.id" :name="settings.dir === 'asc' ? 'sortUp' : 'sortDown'" :size="12" />
      </button>
      <span />
    </div>

    <div class="sc-list scroll">
      <div
        v-for="r in view"
        :key="symbolKey(r)"
        class="sc-row"
        :class="{ active: sameSymbol(r, activePane.symbol) }"
        role="button"
        tabindex="0"
        @click="setSymbol(r)"
        @keydown.enter="setSymbol(r)"
      >
        <b>{{ r.symbol }}</b>
        <span class="num">{{ fmtPriceShort(r.last) }}</span>
        <span class="num" :class="r.changePct >= 0 ? 'up' : 'down'">{{ fmtPct(r.changePct) }}</span>
        <span class="num muted">{{ fmtVolume(r.usdVolume) }}</span>
        <button
          class="btn sm star"
          :class="{ on: inActiveList(r) }"
          :title="(inActiveList(r) ? 'Убрать из списка «' : 'В список «') + activeList.name + '»'"
          @click.stop="toggleWatch(r)"
        >
          <Icon name="star" :size="14" />
        </button>
      </div>
      <p v-if="state.error" class="note muted">{{ state.error }}</p>
      <div v-else-if="state.loading && !view.length" class="note"><div class="spinner" /></div>
      <p v-else-if="!view.length" class="note muted">Под условия ничего не подходит. Смягчите фильтры.</p>
      <p v-else-if="total.length > MAX_ROWS" class="note muted">Показаны первые {{ MAX_ROWS }} из {{ total.length }}.</p>
    </div>
  </div>
</template>

<style scoped>
.sc {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.sc-top {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 6px 5px 8px;
  border-bottom: 1px solid var(--border);
  flex: none;
}
.filter {
  flex: 1;
  min-width: 0;
  justify-content: flex-start;
  font-size: 12px;
}
.filter span {
  overflow: hidden;
  text-overflow: ellipsis;
}
.count {
  font-size: 12px;
  padding: 0 4px;
}
.sc-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
  flex: none;
  max-height: 60%;
  overflow-y: auto;
}
.sc-form label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--muted);
}
.sc-form .field {
  height: 30px;
  color: var(--text);
}
.pair {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}
.reset {
  align-self: flex-start;
  color: var(--muted);
}
.sc-head,
.sc-row {
  display: grid;
  grid-template-columns: minmax(84px, 1fr) minmax(0, auto) 52px 52px 22px;
  align-items: center;
  column-gap: 6px;
  padding: 0 4px 0 10px;
  font-size: 12.5px;
}
.sc-head {
  height: 30px;
  font-size: 11px;
  border-bottom: 1px solid var(--border);
  flex: none;
}
.sc-head button {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  height: 100%;
  white-space: nowrap;
}
.sc-head button.num {
  justify-content: flex-end;
}
.sc-head button:hover,
.sc-head button.on {
  color: var(--text);
}
.sc-list {
  flex: 1;
  min-height: 0;
}
.sc-row {
  height: 34px;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 55%, transparent);
  cursor: pointer;
}
.sc-row:hover {
  background: var(--hover);
}
.sc-row.active {
  background: var(--accent-soft);
  box-shadow: inset 2px 0 0 var(--accent);
}
.sc-row b {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
}
.num {
  text-align: right;
  white-space: nowrap;
}
.star {
  color: var(--muted);
  min-width: 22px;
  padding: 0;
}
.star.on {
  background: none;
  color: var(--warn);
}
.star.on :deep(path) {
  fill: currentColor;
}
.note {
  display: grid;
  place-items: center;
  margin: 0;
  padding: 18px 14px;
  text-align: center;
}
@media (max-width: 719px) {
  .sc-row {
    height: 44px;
  }
}
</style>
