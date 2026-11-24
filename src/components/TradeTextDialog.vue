<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import Modal from './Modal.vue'
import { app, toast } from '../stores/app'
import { activeList } from '../stores/watchlist'
import { applyPastedText, recognize } from '../chart/setup'
import { formatSetup } from '../lib/setup'
import { plural, t } from '../lib/i18n'

// Вставка текстом: то же, что Ctrl+V на графике, но кнопкой — на телефоне клавиатуры с Ctrl нет.
// Понимает сделку (ТВХ / SL / TP), строку сетапа и несколько строк сетапов.
const text = ref(app.pasteDraft)
app.pasteDraft = ''
const area = ref<HTMLTextAreaElement>()
const rec = computed(() => recognize(text.value))
const canRead = !!navigator.clipboard?.readText
// пример в поле: английское «Entry» разбор тоже понимает
const placeholder = computed(() =>
  ['ARBUSDT SHORT', t('ТВХ: {price}', { price: '0.14991' }), 'SL: 0.15165', 'TP: 0.1379', '', t('или'), '10.11.2026 #1000PEPEUSDT Long 0,0053656'].join('\n'),
)

onMounted(() => nextTick(() => area.value?.focus()))

async function fromClipboard() {
  try {
    text.value = await navigator.clipboard.readText()
  } catch {
    toast(t('Браузер не дал прочитать буфер — вставьте текст в поле вручную'), 'error')
  }
}
function close() {
  app.tradeTextOpen = false
}
function apply() {
  if (applyPastedText(text.value)) close()
}
</script>

<template>
  <Modal :title="t('Вставить текстом')" :width="440" @close="close">
    <form class="tt" @submit.prevent="apply">
      <textarea ref="area" v-model="text" class="field" rows="7" :placeholder="placeholder" />
      <p v-if="rec?.kind === 'signal'" class="found">
        <b>{{ t('Сделка: {symbol}', { symbol: rec.signal.symbol ?? t('текущий инструмент') }) }}</b>
        <span v-if="rec.signal.side" :class="rec.signal.side === 'long' ? 'up' : 'down'">{{ rec.signal.side === 'long' ? t('лонг') : t('шорт') }}</span>
        <span>{{ t('вход {price}', { price: rec.signal.entry ?? '—' }) }}</span>
        <span class="down">{{ t('стоп {price}', { price: rec.signal.stop ?? '—' }) }}</span>
        <span class="up">{{ t('тейк {price}', { price: rec.signal.target ?? '—' }) }}</span>
      </p>
      <p v-else-if="rec?.kind === 'setup'" class="found"><b>{{ t('Сетап:') }}</b> {{ formatSetup(rec.setup) }}</p>
      <p v-else-if="rec?.kind === 'batch'" class="found">
        <b>{{ t('{coins} в список «{list}»:', { coins: plural(rec.list.length, ['монета', 'монеты', 'монет'], ['coin', 'coins']), list: activeList.name }) }}</b>
        <span v-for="s in rec.list" :key="s.symbol">{{ formatSetup(s) }}</span>
        <span v-if="rec.skipped.length" class="down">{{ t('не разобрано строк: {n} — {lines}', { n: rec.skipped.length, lines: rec.skipped.slice(0, 3).join(' · ') }) }}</span>
      </p>
      <p v-else class="muted hint">
        {{ t('Сделка — цены ТВХ, SL, TP. Сетап — монета и, если нужно, дата, направление и уровень. Несколько сетапов — по одному в строке: монеты попадут в текущий список.') }}
      </p>
      <div class="tt-actions">
        <button v-if="canRead" type="button" class="btn" @click="fromClipboard">{{ t('Из буфера') }}</button>
        <span class="grow" />
        <button class="btn primary" type="submit" :disabled="!rec">{{ t('Применить') }}</button>
      </div>
    </form>
  </Modal>
</template>

<style scoped>
.tt {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px 14px;
}
textarea {
  height: auto;
  min-height: 150px;
  padding: 8px 10px;
  resize: vertical;
  font: inherit;
  line-height: 1.4;
  user-select: text;
  -webkit-user-select: text;
}
.found {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  margin: 0;
}
.hint {
  margin: 0;
  font-size: 12px;
}
.tt-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.grow {
  flex: 1;
}
</style>
