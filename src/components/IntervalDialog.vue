<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import Modal from './Modal.vue'
import { app, openSearch, setTf } from '../stores/app'
import { parseTf } from '../lib/timeframes'

// Интервал с клавиатуры: окно открывается первой набранной цифрой
const input = ref<HTMLInputElement>()
const text = computed({
  get: () => app.intervalInput?.text ?? '',
  set: (v) => {
    if (app.intervalInput) app.intervalInput.text = v
  },
})
const parsed = computed(() => parseTf(text.value))

onMounted(() => nextTick(() => input.value?.focus()))

// «1000PEPE» тоже начинается с цифры: как только набранное перестаёт быть началом интервала, это монета
const UNIT_PREFIX = /^\d*\s*(?:m|mi|min|mo|h|d|w|м|ми|мин|ме|мес|ч|д|н)?$/i
watch(
  text,
  (v) => {
    if (v && !UNIT_PREFIX.test(v.trim())) {
      app.intervalInput = null
      openSearch(v.trim().toUpperCase())
    }
  },
  // буквы могли набрать ещё до появления окна
  { immediate: true },
)

function close() {
  app.intervalInput = null
}
function apply() {
  if (!parsed.value) return
  setTf(parsed.value.id)
  close()
}
</script>

<template>
  <Modal title="Интервал" :width="300" @close="close">
    <form class="iv" @submit.prevent="apply">
      <input ref="input" v-model="text" class="field" autocomplete="off" spellcheck="false" placeholder="5, 15, 1h, 4h, D, W" />
      <p :class="parsed ? '' : 'muted'">{{ parsed ? 'Интервал: ' + parsed.label : 'Такого интервала нет' }}</p>
      <p class="muted hint">Число — минуты, h — часы, D — день, W — неделя, M — месяц</p>
      <button class="btn primary" type="submit" :disabled="!parsed">Применить</button>
    </form>
  </Modal>
</template>

<style scoped>
.iv {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px 14px;
}
.iv p {
  margin: 0;
}
.hint {
  font-size: 12px;
}
</style>
