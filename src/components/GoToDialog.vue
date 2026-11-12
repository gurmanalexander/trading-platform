<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'
import Modal from './Modal.vue'
import { app, activeIndex } from '../stores/app'
import { chartAt } from '../chart/registry'

const input = ref<HTMLInputElement>()
// значение по умолчанию — сейчас, в местном времени
const pad = (n: number) => String(n).padStart(2, '0')
const now = new Date()
const value = ref(`${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`)

onMounted(() => nextTick(() => input.value?.focus()))

function close() {
  app.gotoOpen = false
}
function go() {
  const ms = new Date(value.value).getTime()
  if (!isFinite(ms)) return
  chartAt(activeIndex.value)?.goToTime(Math.floor(ms / 1000))
  close()
}
</script>

<template>
  <Modal title="Перейти к дате" :width="300" @close="close">
    <form class="gt" @submit.prevent="go">
      <input ref="input" v-model="value" class="field" type="datetime-local" />
      <button class="btn primary" type="submit">Перейти</button>
    </form>
  </Modal>
</template>

<style scoped>
.gt {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px 14px;
}
</style>
