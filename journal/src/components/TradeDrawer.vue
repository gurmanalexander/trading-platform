<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Icon from '../../../src/components/Icon.vue'
import { EXCHANGES } from '../core/protocol'
import { netOf } from '../core/types'
import { fmtDateTime, fmtMoney, fmtPrice, fmtQty, fmtSpan } from '../lib/format'
import { t } from '../lib/i18n'
import { allTags, notes, setNote } from '../store/journal'
import { accountOf, allTrades, tvxLink, ui } from '../store/view'

/** Боковая карточка сделки: цифры, метки, заметка, переход на график tvx */
const trade = computed(() => allTrades.value.find((x) => x.id === ui.open) ?? null)
const account = computed(() => (trade.value ? accountOf(trade.value.acct) : undefined))
const note = computed(() => (trade.value ? notes[trade.value.id] : undefined))
const tone = (v: number) => (v > 0 ? 'up' : v < 0 ? 'down' : '')

const text = ref('')
const tagInput = ref('')
watch(
  trade,
  (x) => {
    text.value = x ? (notes[x.id]?.text ?? '') : ''
    tagInput.value = ''
  },
  { immediate: true },
)

let timer = 0
function saveText() {
  clearTimeout(timer)
  const x = trade.value
  if (!x) return
  timer = window.setTimeout(() => setNote(x, { text: text.value }), 400)
}
function flushText() {
  clearTimeout(timer)
  if (trade.value && (note.value?.text ?? '') !== text.value) setNote(trade.value, { text: text.value })
}
function addTag(raw = tagInput.value) {
  const tag = raw.replace(/^#/, '').trim().slice(0, 24)
  if (!tag || !trade.value) return
  setNote(trade.value, { tags: [...(note.value?.tags ?? []), tag] })
  tagInput.value = ''
}
function removeTag(tag: string) {
  if (trade.value) setNote(trade.value, { tags: (note.value?.tags ?? []).filter((x) => x !== tag) })
}
const suggestions = computed(() => allTags.value.filter((x) => !note.value?.tags.includes(x)).slice(0, 8))

function close() {
  flushText()
  ui.open = ''
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && ui.open) close()
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  flushText()
})
</script>

<template>
  <div v-if="trade" class="dr-back" @pointerdown.self="close">
    <aside class="dr" role="dialog" :aria-label="t('Сделка')">
      <header class="dr-head">
        <div class="dr-title">
          <b>{{ trade.sym }}</b>
          <span class="pill" :class="trade.side > 0 ? 'long' : 'short'">{{ trade.side > 0 ? 'Long' : 'Short' }}</span>
        </div>
        <button class="btn" :aria-label="t('Закрыть')" @click="close"><Icon name="x" /></button>
      </header>
      <div class="dr-body scroll">
        <div class="dr-net">
          <div class="cap">{{ trade.close ? t('Результат сделки') : t('Зафиксировано к этому моменту') }}</div>
          <div class="hero-num" :class="tone(netOf(trade))">{{ fmtMoney(netOf(trade)) }} <small>USD</small></div>
          <div class="muted dr-acct">
            <span class="tag" :class="account?.exchange">{{ EXCHANGES.find((x) => x.id === account?.exchange)?.name }}</span>
            {{ account?.label }}
          </div>
        </div>

        <p v-if="trade.partial" class="warn">{{ t('Начало этой сделки не попало в загруженную историю: цена входа неизвестна, результат неполный. В статистике она не учитывается.') }}</p>

        <a class="btn primary dr-chart" :href="tvxLink(trade)" target="_blank" rel="noopener"><Icon name="chart" :size="18" /> {{ t('Открыть на графике tvx') }}</a>

        <dl class="dr-grid">
          <div>
            <dt>{{ t('Вход') }}</dt>
            <dd>{{ trade.entry ? fmtPrice(trade.entry) : '—' }}</dd>
          </div>
          <div>
            <dt>{{ t('Выход') }}</dt>
            <dd>{{ trade.exit ? fmtPrice(trade.exit) : '—' }}</dd>
          </div>
          <div>
            <dt>{{ t('Объём') }}</dt>
            <dd>{{ fmtQty(trade.qty) }}</dd>
          </div>
          <div>
            <dt>{{ t('Стоимость позиции') }}</dt>
            <dd>{{ fmtMoney(trade.entry * trade.qty, { sign: false }) }}</dd>
          </div>
          <div>
            <dt>{{ t('Открыта') }}</dt>
            <dd>{{ fmtDateTime(trade.open) }}</dd>
          </div>
          <div>
            <dt>{{ t('Закрыта') }}</dt>
            <dd>{{ trade.close ? fmtDateTime(trade.close) : t('ещё открыта') }}</dd>
          </div>
          <div>
            <dt>{{ t('Длилась') }}</dt>
            <dd>{{ fmtSpan(((trade.close || ui.now) - trade.open) / 1000) }}</dd>
          </div>
          <div>
            <dt>{{ t('Исполнений') }}</dt>
            <dd>{{ trade.fills }}</dd>
          </div>
        </dl>

        <dl class="dr-sum">
          <div>
            <dt>{{ t('По ценам') }}</dt>
            <dd :class="tone(trade.gross)">{{ fmtMoney(trade.gross) }}</dd>
          </div>
          <div>
            <dt>{{ t('Комиссии') }}</dt>
            <dd>{{ fmtMoney(-trade.fee) }}</dd>
          </div>
          <div>
            <dt>{{ t('Фандинг') }}</dt>
            <dd>{{ fmtMoney(trade.funding) }}</dd>
          </div>
          <div class="sum-total">
            <dt>{{ t('Итого') }}</dt>
            <dd :class="tone(netOf(trade))">{{ fmtMoney(netOf(trade)) }}</dd>
          </div>
        </dl>

        <section>
          <h4>{{ t('Метки') }}</h4>
          <div class="tags">
            <button v-for="tag in note?.tags ?? []" :key="tag" class="tagchip on" :title="t('Убрать метку')" @click="removeTag(tag)">#{{ tag }} <Icon name="x" :size="12" /></button>
            <input v-model="tagInput" class="field tag-in" maxlength="24" :placeholder="t('новая метка')" :aria-label="t('Новая метка')" @keydown.enter.prevent="addTag()" @blur="addTag()" />
          </div>
          <div v-if="suggestions.length" class="tags sug">
            <button v-for="tag in suggestions" :key="tag" class="tagchip" @click="addTag(tag)">#{{ tag }}</button>
          </div>
        </section>

        <section>
          <h4>{{ t('Заметка') }}</h4>
          <textarea v-model="text" class="field note" rows="5" maxlength="4000" :placeholder="t('Почему вошёл, что пошло не так, что повторить в следующий раз')" @input="saveText" @blur="flushText" />
        </section>
      </div>
    </aside>
  </div>
</template>

<style>
.dr-back {
  position: fixed;
  inset: 0;
  z-index: 60;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  justify-content: flex-end;
}
.dr {
  width: 400px;
  max-width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--panel);
  border-left: 1px solid var(--border);
  box-shadow: var(--shadow);
  padding-top: env(safe-area-inset-top);
  padding-bottom: env(safe-area-inset-bottom);
}
.dr-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 8px 8px 16px;
  border-bottom: 1px solid var(--border);
  flex: none;
}
.dr-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
}
.dr-body {
  flex: 1;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  user-select: text;
  -webkit-user-select: text;
}
.dr-acct {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
  font-size: 12px;
}
.dr-chart {
  height: 40px;
  text-decoration: none;
}
.dr-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px 16px;
  margin: 0;
}
.dr dt {
  color: var(--muted);
  font-size: 12px;
}
.dr dd {
  margin: 1px 0 0;
}
.dr-sum {
  margin: 0;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--panel-2);
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.dr-sum > div {
  display: flex;
  justify-content: space-between;
}
.dr-sum dt {
  font-size: 13px;
}
.dr-sum .sum-total {
  padding-top: 6px;
  border-top: 1px solid var(--border);
  font-weight: 600;
}
.dr-sum .sum-total dt {
  color: var(--text);
}
.dr h4 {
  margin: 0 0 8px;
  font-size: 13px;
}
.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}
.tags.sug {
  margin-top: 8px;
}
.tagchip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 26px;
  padding: 0 8px;
  border-radius: 13px;
  border: 1px solid var(--border);
  color: var(--muted);
  font-size: 12px;
}
.tagchip:hover {
  color: var(--text);
  border-color: var(--muted);
}
.tagchip.on {
  color: var(--text);
  background: var(--accent-soft);
  border-color: transparent;
}
.tag-in {
  width: 130px;
  height: 26px;
  font-size: 12px;
  border-radius: 13px;
}
.note {
  height: auto;
  padding: 8px 10px;
  resize: vertical;
  line-height: 1.45;
  font: inherit;
  user-select: text;
  -webkit-user-select: text;
}
.warn {
  margin: 0;
  padding: 9px 11px;
  border-radius: 8px;
  font-size: 12.5px;
  background: color-mix(in srgb, var(--warn) 14%, transparent);
  border: 1px solid color-mix(in srgb, var(--warn) 40%, transparent);
}
@media (max-width: 719px) {
  .dr {
    width: 100%;
    border-left: 0;
  }
}
</style>
