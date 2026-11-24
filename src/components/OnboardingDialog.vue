<script setup lang="ts">
import { computed, ref } from 'vue'
import Icon from './Icon.vue'
import { app, finishOnboarding, type ThemePref } from '../stores/app'
import { i18n, LANGS, t, type Lang } from '../lib/i18n'
import { TIMEZONES, tzMenuLabel } from '../lib/timezone'
import { EXCHANGE_NAMES, MARKET_NAMES, type ExchangeId, type MarketId } from '../types'

// Первый запуск: язык, тема, часовой пояс (по умолчанию — как на устройстве) и биржа.
// Всё можно поменять потом в настройках; окно показывается один раз.
const THEMES: { id: ThemePref; label: string; icon: string }[] = [
  { id: 'system', label: 'Как в системе', icon: 'monitor' },
  { id: 'dark', label: 'Тёмная', icon: 'moon' },
  { id: 'light', label: 'Светлая', icon: 'sun' },
]
const base = import.meta.env.BASE_URL
const EXCHANGES: ExchangeId[] = ['binance', 'bybit']
const MARKETS: MarketId[] = ['futures', 'spot']

const exchange = ref<ExchangeId>(app.defaults.exchange)
const market = ref<MarketId>(app.defaults.market)
const tzOptions = computed(() => TIMEZONES.map((z) => ({ id: z.id, label: tzMenuLabel(z) })))

function setLang(lang: Lang) {
  i18n.lang = lang
}

function start() {
  finishOnboarding({ exchange: exchange.value, market: market.value })
}
</script>

<template>
  <div class="ob-back">
    <div class="ob" role="dialog" :aria-label="t('Добро пожаловать в tvx')">
      <div class="ob-hero">
        <img class="ob-logo" :src="base + 'icon-192.png'" alt="" />
        <div>
          <h1>{{ t('Добро пожаловать в tvx') }}</h1>
          <p>{{ t('Бесплатный терминал для графиков Binance и Bybit. Пара настроек — и можно работать.') }}</p>
        </div>
      </div>

      <section class="ob-row">
        <span class="ob-label">Language / Язык</span>
        <div class="seg">
          <button v-for="l in LANGS" :key="l.id" :class="{ on: i18n.lang === l.id }" @click="setLang(l.id)">{{ l.label }}</button>
        </div>
      </section>

      <section class="ob-row">
        <span class="ob-label">{{ t('Тема') }}</span>
        <div class="seg">
          <button v-for="th in THEMES" :key="th.id" :class="{ on: app.themePref === th.id }" @click="app.themePref = th.id">
            <Icon :name="th.icon" :size="15" />{{ t(th.label) }}
          </button>
        </div>
      </section>

      <section class="ob-row">
        <span class="ob-label">{{ t('Часовой пояс') }}</span>
        <select v-model="app.view.tz" class="field">
          <option v-for="z in tzOptions" :key="z.id" :value="z.id">{{ z.label }}</option>
        </select>
      </section>

      <section class="ob-row">
        <span class="ob-label">{{ t('Биржа') }}</span>
        <div class="seg-pair">
          <div class="seg">
            <button v-for="ex in EXCHANGES" :key="ex" :class="{ on: exchange === ex }" @click="exchange = ex">{{ EXCHANGE_NAMES[ex] }}</button>
          </div>
          <div class="seg">
            <button v-for="m in MARKETS" :key="m" :class="{ on: market === m }" @click="market = m">{{ MARKET_NAMES[m] }}</button>
          </div>
        </div>
      </section>

      <p class="ob-note">{{ t('Всё это можно изменить позже в настройках.') }}</p>
      <button class="ob-start" @click="start">{{ t('Начать') }}<Icon name="next" :size="18" /></button>
    </div>
  </div>
</template>

<style scoped>
.ob-back {
  position: fixed;
  inset: 0;
  z-index: 85;
  display: grid;
  place-items: center;
  padding: 16px;
  background: color-mix(in srgb, var(--bg) 70%, transparent);
  backdrop-filter: blur(6px);
}
.ob {
  width: min(460px, 100%);
  max-height: calc(100dvh - 32px);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 22px 22px 20px;
  border: 1px solid var(--border);
  border-radius: 16px;
  background: var(--panel);
  box-shadow: var(--shadow);
}
.ob-hero {
  display: flex;
  gap: 14px;
  align-items: center;
}
.ob-logo {
  width: 52px;
  height: 52px;
  border-radius: 12px;
  flex: none;
}
h1 {
  margin: 0 0 4px;
  font-size: 19px;
  font-weight: 700;
}
.ob-hero p {
  margin: 0;
  color: var(--muted);
  line-height: 1.4;
}
.ob-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.ob-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--muted);
}
/* переключатель-сегменты: выбранный — светлая подложка */
.seg {
  display: flex;
  gap: 4px;
  padding: 3px;
  border-radius: 10px;
  background: var(--bg);
  border: 1px solid var(--border);
}
.seg button {
  flex: 1 1 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-width: 0;
  height: 34px;
  padding: 0 8px;
  border-radius: 7px;
  color: var(--muted);
  white-space: nowrap;
  transition:
    background 0.15s,
    color 0.15s;
}
.seg button:hover {
  color: var(--text);
}
.seg button.on {
  color: var(--sel);
  background: var(--sel-bg);
  font-weight: 600;
}
.seg-pair {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.ob-row .field {
  height: 40px;
}
.ob-note {
  margin: 0;
  font-size: 12px;
  color: var(--muted);
  text-align: center;
}
.ob-start {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 46px;
  border-radius: 11px;
  background: var(--accent);
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  transition: filter 0.15s;
}
.ob-start:hover {
  filter: brightness(1.08);
}
@media (max-width: 420px) {
  .seg-pair {
    grid-template-columns: 1fr;
  }
}
</style>
