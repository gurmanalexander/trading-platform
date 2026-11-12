<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import Modal from './Modal.vue'
import { app, toast } from '../stores/app'
import { parseSignal } from '../lib/signal'
import { applySignal } from '../chart/trade'

// Сделка текстом: то же, что Ctrl+V на графике, но кнопкой — на телефоне клавиатуры с Ctrl нет
const text = ref('')
const area = ref<HTMLTextAreaElement>()
const sig = computed(() => parseSignal(text.value))
const canRead = !!navigator.clipboard?.readText

onMounted(() => nextTick(() => area.value?.focus()))

async function fromClipboard() {
  try {
    text.value = await navigator.clipboard.readText()
  } catch {
    toast('Браузер не дал прочитать буфер — вставьте текст в поле вручную', 'error')
  }
}
function close() {
  app.tradeTextOpen = false
}
function apply() {
  if (sig.value && applySignal(sig.value)) close()
}
</script>

<template>
  <Modal title="Сделка текстом" :width="420" @close="close">
    <form class="tt" @submit.prevent="apply">
      <textarea ref="area" v-model="text" class="field" rows="7" placeholder="ARBUSDT SHORT&#10;ТВХ: 0.14991&#10;SL: 0.15165&#10;TP: 0.1379" />
      <p v-if="sig" class="found">
        <b>{{ sig.symbol ?? 'текущий инструмент' }}</b>
        <span v-if="sig.side" :class="sig.side === 'long' ? 'up' : 'down'">{{ sig.side === 'long' ? 'лонг' : 'шорт' }}</span>
        <span>вход {{ sig.entry ?? '—' }}</span>
        <span class="down">стоп {{ sig.stop ?? '—' }}</span>
        <span class="up">тейк {{ sig.target ?? '—' }}</span>
      </p>
      <p v-else class="muted hint">Вставьте текст сделки: нужны хотя бы две цены из трёх (ТВХ, SL, TP). Лишние строки не мешают.</p>
      <div class="tt-actions">
        <button v-if="canRead" type="button" class="btn" @click="fromClipboard">Из буфера</button>
        <span class="grow" />
        <button class="btn primary" type="submit" :disabled="!sig">На график</button>
      </div>
      <p class="muted hint">Если на графике выделена позиция, цены запишутся в неё; иначе появится новая.</p>
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
  min-height: 130px;
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
