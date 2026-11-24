<script setup lang="ts">
import { computed } from 'vue'
import { symbolKey, type SymbolRef } from '../types'
import { tickers } from '../stores/tickers'
import { atr5, dayStats, useAtr5 } from '../stores/atr'
import { MIN_DAY_VOLUME, atrBounds, atrSpent, dailyRisk, fiveMinRisk, spentTone } from '../lib/atr'
import { fmtPrice, fmtVolume } from '../lib/format'
import { t } from '../lib/i18n'

// Таблица индикатора «Trader Assistant»: дневной ATR, насколько он исчерпан, расчётные стоп, тейк и люфт,
// границы дня по ATR. Формулы и значения по умолчанию — из индикатора (см. lib/atr.ts).
const props = defineProps<{ symbol: SymbolRef; precision: number }>()
useAtr5(() => props.symbol)

const v = computed(() => {
  const key = symbolKey(props.symbol)
  const s = dayStats[key]
  const tk = tickers[key]
  if (!s || !tk?.last) return null
  const f = (v: number) => fmtPrice(v, props.precision)
  const spent = atrSpent(s.atr, s, tk.last)
  const b = atrBounds(s.atr, s, tk.last)
  const day = dailyRisk(s.atr)
  const a5 = atr5[key]?.value
  const m5 = a5 ? fiveMinRisk(a5) : null
  return {
    atr: f(s.atr),
    atrPct: ((s.atr / tk.last) * 100).toFixed(2),
    fromOpen: spent.fromOpen.toFixed(0),
    fromOpenTone: spentTone(spent.fromOpen),
    traveled: spent.traveled.toFixed(0),
    traveledTone: spentTone(spent.traveled),
    maxOpen: f(b.maxFromOpen),
    maxLow: f(b.maxFromLow),
    minOpen: f(b.minFromOpen),
    minHigh: f(b.minFromHigh),
    stop: f(day.stop),
    take: f(day.take),
    slip: f(day.slip),
    stop5: m5 ? f(m5.stop) : '—',
    take5: m5 ? f(m5.take) : '—',
    slip5: m5 ? f(m5.slip) : '—',
    volume: tk.quoteVolume ? fmtVolume(tk.quoteVolume) : '—',
    lowVolume: !!tk.quoteVolume && tk.quoteVolume < MIN_DAY_VOLUME,
  }
})
</script>

<template>
  <table v-if="v" class="atr-table">
    <thead>
      <tr>
        <th />
        <th :title="t('По дневному ATR: стоп — 10% ATR, тейк — 4 стопа, люфт — 10% стопа')">{{ t('день') }}</th>
        <th :title="t('По пятиминутному графику: стоп — два ATR(30), тейк — 4 стопа, люфт — 10% стопа')">{{ t('5 мин') }}</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>{{ t('Стоп') }}</td>
        <td>{{ v.stop }}</td>
        <td>{{ v.stop5 }}</td>
      </tr>
      <tr>
        <td>{{ t('Тейк') }}</td>
        <td>{{ v.take }}</td>
        <td>{{ v.take5 }}</td>
      </tr>
      <tr>
        <td>{{ t('Люфт') }}</td>
        <td>{{ v.slip }}</td>
        <td>{{ v.slip5 }}</td>
      </tr>
    </tbody>
    <thead>
      <tr>
        <th />
        <th :title="t('От цены открытия дня')">{{ t('от open') }}</th>
        <th :title="t('От уже показанных минимума и максимума дня')">{{ t('от хай/лоу') }}</th>
      </tr>
    </thead>
    <tbody>
      <tr class="bound" :title="t('Куда цена может дойти вверх, если пройдёт весь ATR')">
        <td>{{ t('Max по ATR') }}</td>
        <td>{{ v.maxOpen }}</td>
        <td>{{ v.maxLow }}</td>
      </tr>
      <tr class="bound" :title="t('Куда цена может дойти вниз, если пройдёт весь ATR')">
        <td>{{ t('Min по ATR') }}</td>
        <td>{{ v.minOpen }}</td>
        <td>{{ v.minHigh }}</td>
      </tr>
      <tr class="main" :title="t('Насколько исчерпан дневной ATR: от открытия дня до текущей цены и по размаху дня. Меньше 30% — запас хода, больше 70% — ход на исходе')">
        <td>{{ t('ATR исчерпан') }}</td>
        <td :class="v.fromOpenTone">{{ v.fromOpen }}%</td>
        <td :class="v.traveledTone">{{ v.traveled }}%</td>
      </tr>
      <tr class="main" :title="t('Дневной ATR — средний диапазон пяти предыдущих дневных свечей')">
        <td>ATR</td>
        <td>{{ v.atr }}</td>
        <td class="muted">{{ v.atrPct }}%</td>
      </tr>
      <tr :class="{ down: v.lowVolume }" :title="t('Оборот за 24 часа. Красный — меньше 30 млн $')">
        <td>{{ t('Объём за день') }}</td>
        <td>{{ v.volume }}</td>
        <td />
      </tr>
    </tbody>
  </table>
</template>

<style scoped>
.atr-table {
  zoom: var(--legend-zoom, 1);
  border-collapse: collapse;
  font-size: 11px;
  line-height: 1.25;
  font-variant-numeric: tabular-nums;
  background: color-mix(in srgb, var(--panel) 86%, transparent);
  border: 1px solid var(--border);
  border-radius: 6px;
  backdrop-filter: blur(3px);
  pointer-events: auto;
}
th,
td {
  padding: 1.5px 7px;
  text-align: right;
  white-space: nowrap;
  font-weight: 400;
}
th {
  color: var(--muted);
  font-size: 10px;
  padding-top: 3px;
}
td:first-child {
  color: var(--muted);
}
.bound td:not(:first-child) {
  color: var(--accent);
}
.main td {
  font-weight: 600;
}
.main td:first-child {
  font-weight: 400;
  color: var(--text);
}
tr.down td {
  color: var(--down);
}
tbody:last-child tr:last-child td {
  padding-bottom: 4px;
}
</style>
