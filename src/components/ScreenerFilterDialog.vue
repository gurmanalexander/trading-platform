<script setup lang="ts">
import Modal from './Modal.vue'
import { app } from '../stores/app'
import { t } from '../lib/i18n'
import { settings, state, total, universe, resetSettings } from '../stores/screener'

// Условия отбора — в отдельном окне: биржа и рынок, пороги по обороту и изменению цены, сортировка.
const close = () => (app.screenerFilterOpen = false)
const VOLUMES = [10, 30, 50, 100, 300]
</script>

<template>
  <Modal :title="t('Условия отбора')" :width="420" @close="close">
    <form class="sf" @submit.prevent="close">
      <div class="pair">
        <label>
          <span>{{ t('Биржа') }}</span>
          <select v-model="settings.exchange" class="field">
            <option value="binance">Binance</option>
            <option value="bybit">Bybit</option>
          </select>
        </label>
        <label>
          <span>{{ t('Рынок') }}</span>
          <select v-model="settings.market" class="field">
            <option value="futures">{{ t('Фьючерсы') }}</option>
            <option value="spot">{{ t('Спот') }}</option>
          </select>
        </label>
      </div>
      <label>
        <span>{{ t('Объём за 24 часа — от, млн $') }}</span>
        <input v-model.number="settings.minVolume" class="field" type="number" min="0" step="5" inputmode="decimal" />
      </label>
      <div class="chips">
        <button v-for="v in VOLUMES" :key="v" type="button" class="chip" :class="{ on: settings.minVolume === v }" @click="settings.minVolume = v">{{ v }}</button>
        <button type="button" class="chip" :class="{ on: settings.minVolume === 0 }" @click="settings.minVolume = 0">{{ t('любой') }}</button>
      </div>
      <label>
        <span>{{ t('Изменение за 24 часа — от, % (в любую сторону)') }}</span>
        <input v-model.number="settings.minChange" class="field" type="number" min="0" step="1" inputmode="decimal" />
      </label>
      <label>
        <span>{{ t('Что показывать') }}</span>
        <select v-model="settings.assets" class="field">
          <option value="crypto">{{ t('Только криптовалюты') }}</option>
          <option value="tradfi">{{ t('Только акции и TradFi (сырьё, валюты, до IPO)') }}</option>
          <option value="all">{{ t('Всё вместе') }}</option>
        </select>
      </label>
      <p v-if="settings.exchange === 'binance' && settings.market === 'spot'" class="muted hint">
        {{ t('На споте Binance биржа не помечает токенизированные акции (bStocks) в открытых данных — здесь они идут как криптовалюты.') }}
      </p>
      <p v-else-if="state.kindsError" class="muted hint">{{ t('Не удалось получить с биржи список акций — сейчас все инструменты считаются криптовалютами.') }}</p>
      <label>
        <span>{{ t('Валюта котировки') }}</span>
        <select v-model="settings.quote" class="field">
          <option value="USDT">{{ t('Только USDT') }}</option>
          <option value="all">{{ t('Любая') }}</option>
        </select>
      </label>
      <label>
        <span>{{ t('Сортировка') }}</span>
        <span class="pair">
          <select v-model="settings.sort" class="field">
            <option value="volume">{{ t('Объём') }}</option>
            <option value="change">{{ t('Изменение за 24ч') }}</option>
            <option value="price">{{ t('Цена') }}</option>
            <option value="symbol">{{ t('Название') }}</option>
          </select>
          <select v-model="settings.dir" class="field">
            <option value="desc">{{ t('По убыванию') }}</option>
            <option value="asc">{{ t('По возрастанию') }}</option>
          </select>
        </span>
      </label>
      <footer>
        <span class="muted">{{ t('Подходит {n} из {total}', { n: total.length, total: universe }) }}</span>
        <span class="grow" />
        <button type="button" class="btn" @click="resetSettings">{{ t('Сбросить') }}</button>
        <button class="btn primary" type="submit">{{ t('Готово') }}</button>
      </footer>
    </form>
  </Modal>
</template>

<style scoped>
.sf {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px 16px 16px;
  overflow-y: auto;
}
.hint {
  margin: -6px 0 0;
  font-size: 12px;
}
label {
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-size: 12px;
  color: var(--muted);
}
.field {
  color: var(--text);
}
.pair {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: -6px;
}
.chip {
  padding: 4px 11px;
  border: 1px solid var(--border);
  border-radius: 999px;
  font-size: 12px;
}
.chip:hover {
  background: var(--hover);
}
.chip.on {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--accent-soft);
}
footer {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
}
.grow {
  flex: 1;
}
footer .btn:not(.primary) {
  border: 1px solid var(--border);
}
</style>
