<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import Modal from './Modal.vue'
import { app, toast } from '../stores/app'
import { activeList } from '../stores/watchlist'
import { applyPastedText, recognize } from '../chart/setup'
import { formatSetup } from '../lib/setup'

// Вставка текстом: то же, что Ctrl+V на графике, но кнопкой — на телефоне клавиатуры с Ctrl нет.
// Понимает сделку (ТВХ / SL / TP), строку сетапа и несколько строк сетапов.
const text = ref('')
const area = ref<HTMLTextAreaElement>()
const rec = computed(() => recognize(text.value))
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
  if (applyPastedText(text.value)) close()
}
</script>

<template>
  <Modal title="Вставить текстом" :width="440" @close="close">
    <form class="tt" @submit.prevent="apply">
      <textarea ref="area" v-model="text" class="field" rows="7" placeholder="ARBUSDT SHORT&#10;ТВХ: 0.14991&#10;SL: 0.15165&#10;TP: 0.1379&#10;&#10;или&#10;10.11.2026 #1000PEPEUSDT Long 0,0053656" />
      <p v-if="rec?.kind === 'signal'" class="found">
        <b>Сделка: {{ rec.signal.symbol ?? 'текущий инструмент' }}</b>
        <span v-if="rec.signal.side" :class="rec.signal.side === 'long' ? 'up' : 'down'">{{ rec.signal.side === 'long' ? 'лонг' : 'шорт' }}</span>
        <span>вход {{ rec.signal.entry ?? '—' }}</span>
        <span class="down">стоп {{ rec.signal.stop ?? '—' }}</span>
        <span class="up">тейк {{ rec.signal.target ?? '—' }}</span>
      </p>
      <p v-else-if="rec?.kind === 'setup'" class="found"><b>Сетап:</b> {{ formatSetup(rec.setup) }}</p>
      <p v-else-if="rec?.kind === 'batch'" class="found">
        <b>{{ rec.list.length }} монет в список «{{ activeList.name }}»:</b>
        <span v-for="s in rec.list" :key="s.symbol">{{ formatSetup(s) }}</span>
      </p>
      <p v-else class="muted hint">
        Сделка — цены ТВХ, SL, TP. Сетап — монета и, если нужно, дата, направление и уровень. Несколько сетапов — по одному в строке: монеты попадут в текущий список.
      </p>
      <div class="tt-actions">
        <button v-if="canRead" type="button" class="btn" @click="fromClipboard">Из буфера</button>
        <span class="grow" />
        <button class="btn primary" type="submit" :disabled="!rec">Применить</button>
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
