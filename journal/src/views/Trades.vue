<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Icon from '../../../src/components/Icon.vue'
import { dayStart } from '../core/stats'
import { netOf, type Trade } from '../core/types'
import { fmtDate, fmtMoney, fmtPrice, fmtQty, fmtShort, fmtSpan, fmtTime } from '../lib/format'
import { plural, t } from '../lib/i18n'
import { allTags, notes, state, tzMin } from '../store/journal'
import { accountOf, allTrades, clearListFilter, hasListFilter, listTrades, ui } from '../store/view'

type SortKey = 'time' | 'sym' | 'net' | 'vol' | 'hold'
const sort = ref<{ key: SortKey; dir: 1 | -1 }>({ key: 'time', dir: -1 })
const shown = ref(100)

const value = (tr: Trade, key: SortKey): number | string => {
  if (key === 'sym') return tr.sym
  if (key === 'net') return netOf(tr)
  if (key === 'vol') return tr.vol
  if (key === 'hold') return (tr.close || ui.now) - tr.open
  // открытые сделки — сверху при сортировке «сначала новые»
  return tr.close || Number.MAX_SAFE_INTEGER
}

const sorted = computed(() => {
  const { key, dir } = sort.value
  return listTrades.value.slice().sort((a, b) => {
    const x = value(a, key)
    const y = value(b, key)
    return (x < y ? -1 : x > y ? 1 : 0) * dir || b.open - a.open
  })
})
const page = computed(() => sorted.value.slice(0, shown.value))
watch([listTrades, sort], () => (shown.value = 100))

function sortBy(key: SortKey) {
  sort.value = sort.value.key === key ? { key, dir: sort.value.dir === 1 ? -1 : 1 } : { key, dir: key === 'sym' ? 1 : -1 }
}
const arrow = (key: SortKey) => (sort.value.key === key ? (sort.value.dir === 1 ? 'sortUp' : 'sortDown') : '')

const symbols = computed(() => [...new Set(allTrades.value.map((x) => x.sym))].sort())
const total = computed(() => listTrades.value.reduce((s, x) => s + (x.close && !x.partial ? netOf(x) : 0), 0))
const multi = computed(() => state.accounts.length > 1)

/** Результат в процентах от стоимости позиции на входе */
const pct = (tr: Trade) => (tr.entry > 0 && tr.qty > 0 ? (netOf(tr) / (tr.entry * tr.qty)) * 100 : 0)
const tone = (v: number) => (v > 0 ? 'up' : v < 0 ? 'down' : '')

function exportCsv() {
  const head = ['account', 'exchange', 'symbol', 'side', 'opened', 'closed', 'entry', 'exit', 'qty', 'volume', 'gross', 'fees', 'funding', 'net', 'fills', 'tags', 'note']
  const esc = (v: unknown) => {
    const s = String(v ?? '')
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const rows = sorted.value.map((x) => {
    const a = accountOf(x.acct)
    const n = notes[x.id]
    return [a?.label, a?.exchange, x.sym, x.side > 0 ? 'long' : 'short', new Date(x.open).toISOString(), x.close ? new Date(x.close).toISOString() : '', x.entry, x.exit || '', x.qty, x.vol.toFixed(2), x.gross.toFixed(4), x.fee.toFixed(4), x.funding.toFixed(4), netOf(x).toFixed(4), x.fills, n?.tags.join(' ') ?? '', n?.text ?? '']
      .map(esc)
      .join(',')
  })
  const blob = new Blob(['﻿' + [head.join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'tvx-journal.csv'
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
}
</script>

<template>
  <div class="tr">
    <div class="tr-bar">
      <select v-model="ui.sym" class="field sel" :aria-label="t('Монета')">
        <option value="">{{ t('Все монеты') }}</option>
        <option v-for="x in symbols" :key="x" :value="x">{{ x }}</option>
      </select>
      <div class="segs" role="group" :aria-label="t('Сторона')">
        <button class="sg" :class="{ on: ui.side === 0 }" @click="ui.side = 0">{{ t('Все') }}</button>
        <button class="sg" :class="{ on: ui.side === 1 }" @click="ui.side = 1">{{ t('Лонг') }}</button>
        <button class="sg" :class="{ on: ui.side === -1 }" @click="ui.side = -1">{{ t('Шорт') }}</button>
      </div>
      <select v-if="allTags.length" v-model="ui.tag" class="field sel" :aria-label="t('Метка')">
        <option value="">{{ t('Все метки') }}</option>
        <option v-for="x in allTags" :key="x" :value="x">{{ x }}</option>
      </select>
      <button v-if="ui.day != null" class="chip" @click="ui.day = null">{{ fmtDate(dayStart(ui.day, tzMin), true) }} <Icon name="x" :size="14" /></button>
      <button v-if="hasListFilter" class="btn sm" @click="clearListFilter">{{ t('Сбросить') }}</button>
      <span class="grow" />
      <span class="muted tr-total">
        {{ plural(listTrades.length, ['сделка', 'сделки', 'сделок'], ['trade', 'trades']) }} · <b :class="tone(total)">{{ fmtMoney(total) }}</b>
      </span>
      <button class="btn sm" :title="t('Скачать список в CSV')" :aria-label="t('Скачать список в CSV')" :disabled="!listTrades.length" @click="exportCsv"><Icon name="download" :size="16" /></button>
    </div>

    <div v-if="page.length" class="card tbl-card">
      <table class="tbl">
        <thead>
          <tr>
            <th class="l"><button @click="sortBy('time')">{{ t('Закрыта') }} <Icon v-if="arrow('time')" :name="arrow('time')" :size="13" /></button></th>
            <th class="l"><button @click="sortBy('sym')">{{ t('Монета') }} <Icon v-if="arrow('sym')" :name="arrow('sym')" :size="13" /></button></th>
            <th class="l hide-s">{{ t('Вход → выход') }}</th>
            <th class="hide-s"><button @click="sortBy('vol')">{{ t('Оборот') }} <Icon v-if="arrow('vol')" :name="arrow('vol')" :size="13" /></button></th>
            <th class="hide-s"><button @click="sortBy('hold')">{{ t('Длилась') }} <Icon v-if="arrow('hold')" :name="arrow('hold')" :size="13" /></button></th>
            <th><button @click="sortBy('net')">{{ t('Результат') }} <Icon v-if="arrow('net')" :name="arrow('net')" :size="13" /></button></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="x in page" :key="x.id" :class="{ sel: ui.open === x.id }" tabindex="0" @click="ui.open = x.id" @keydown.enter="ui.open = x.id">
            <td class="l when">
              <template v-if="x.close">
                <span>{{ fmtDate(x.close) }}</span> <span class="muted">{{ fmtTime(x.close) }}</span>
              </template>
              <span v-else class="open-badge">{{ t('открыта') }}</span>
            </td>
            <td class="l">
              <div class="sym">
                <b>{{ x.sym }}</b>
                <span class="pill" :class="x.side > 0 ? 'long' : 'short'">{{ x.side > 0 ? 'Long' : 'Short' }}</span>
                <span v-if="x.partial" class="tag" :title="t('Начало сделки не попало в загруженную историю — в статистике она не учитывается')">{{ t('неполная') }}</span>
                <Icon v-if="notes[x.id]?.text" name="note" :size="13" class="muted" />
              </div>
              <div class="sub muted">
                <span v-if="multi">{{ accountOf(x.acct)?.label }}</span>
                <span v-for="tag in notes[x.id]?.tags ?? []" :key="tag" class="tg">#{{ tag }}</span>
                <span class="show-s">{{ fmtSpan(((x.close || ui.now) - x.open) / 1000) }}</span>
              </div>
            </td>
            <td class="l hide-s">
              <div>{{ x.entry ? fmtPrice(x.entry) : '—' }} → {{ x.exit ? fmtPrice(x.exit) : '…' }}</div>
              <div class="sub muted">{{ fmtQty(x.qty) }}</div>
            </td>
            <td class="hide-s">{{ fmtShort(x.vol, false) }}</td>
            <td class="hide-s">{{ fmtSpan(((x.close || ui.now) - x.open) / 1000) }}</td>
            <td>
              <div :class="tone(netOf(x))">
                <b>{{ fmtMoney(netOf(x)) }}</b>
              </div>
              <div class="sub muted">{{ x.entry ? (pct(x) > 0 ? '+' : pct(x) < 0 ? '−' : '') + Math.abs(pct(x)).toFixed(2) + '%' : '' }}</div>
            </td>
          </tr>
        </tbody>
      </table>
      <button v-if="sorted.length > shown" class="btn more" @click="shown += 200">{{ t('Показать ещё {n}', { n: Math.min(200, sorted.length - shown) }) }}</button>
    </div>
    <p v-else class="card muted none">{{ hasListFilter ? t('Под этот отбор сделок нет') : t('За этот период сделок нет') }}</p>
  </div>
</template>

<style>
.tr {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.tr-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.sel {
  width: auto;
  max-width: 180px;
  background: var(--panel);
}
.segs {
  display: inline-flex;
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow: hidden;
  background: var(--panel);
}
.sg {
  height: calc(var(--ctl) - 2px);
  padding: 0 11px;
  color: var(--muted);
  white-space: nowrap;
}
.sg:hover {
  color: var(--text);
}
.sg.on {
  color: var(--sel);
  background: var(--sel-bg);
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: var(--ctl);
  padding: 0 8px 0 10px;
  border-radius: 6px;
  background: var(--accent-soft);
  color: var(--text);
}
.tr-total {
  white-space: nowrap;
}
.tbl-card {
  padding: 0;
  overflow: hidden;
}
.tbl {
  width: 100%;
  border-collapse: collapse;
}
.tbl th,
.tbl td {
  text-align: right;
  padding: 5px 12px;
  white-space: nowrap;
  vertical-align: middle;
}
.tbl th {
  position: sticky;
  top: 0;
  font-weight: 500;
  font-size: 12px;
  color: var(--muted);
  background: var(--panel);
  border-bottom: 1px solid var(--border);
  z-index: 1;
}
.tbl th button {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  color: inherit;
}
.tbl th button:hover {
  color: var(--text);
}
.tbl .l {
  text-align: left;
}
.tbl tbody tr {
  cursor: pointer;
  border-top: 1px solid color-mix(in srgb, var(--border) 55%, transparent);
}
.tbl tbody tr:first-child {
  border-top: 0;
}
.tbl tbody tr:hover,
.tbl tbody tr.sel {
  background: var(--hover);
}
.sym {
  display: flex;
  align-items: center;
  gap: 6px;
}
.sub {
  display: flex;
  gap: 6px;
  font-size: 11.5px;
  justify-content: inherit;
}
td:not(.l) .sub {
  justify-content: flex-end;
}
.tg {
  color: var(--accent);
}
.open-badge {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--accent-soft);
  color: var(--text);
}
.more {
  width: 100%;
  border-top: 1px solid var(--border);
  border-radius: 0;
  color: var(--muted);
}
.show-s {
  display: none;
}
@media (max-width: 719px) {
  .hide-s {
    display: none;
  }
  .show-s {
    display: inline;
  }
  .tbl th,
  .tbl td {
    padding: 8px 10px;
  }
  .when {
    width: 1%;
  }
  .when .muted {
    display: block;
    font-size: 11.5px;
  }
  .tr-total {
    order: 9;
    width: 100%;
  }
}
</style>
