<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'
import Modal from './Modal.vue'
import { app } from '../stores/app'
import { chartAt } from '../chart/registry'

// Ввод и правка текста на графике
const edit = app.textEdit!
const text = ref(edit.text)
const area = ref<HTMLTextAreaElement>()
onMounted(() => nextTick(() => area.value?.focus()))

function close() {
  app.textEdit = null
}
function apply() {
  const layer = chartAt(edit.pane)?.draw
  if (layer) {
    if (edit.id) layer.setText(edit.id, text.value)
    else if (edit.pt) layer.addText(edit.pt, text.value)
  }
  close()
}
</script>

<template>
  <Modal :title="edit.id ? 'Текст' : 'Новый текст'" :width="420" @close="close">
    <form class="td" @submit.prevent="apply">
      <textarea ref="area" v-model="text" class="field" rows="6" placeholder="Текст на графике" @keydown.ctrl.enter="apply" @keydown.meta.enter="apply" />
      <div class="td-actions">
        <span class="muted hint">Ctrl+Enter — сохранить. Пустой текст удаляет надпись.</span>
        <button class="btn primary" type="submit">{{ edit.id ? 'Сохранить' : 'Добавить' }}</button>
      </div>
    </form>
  </Modal>
</template>

<style scoped>
.td {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px 14px;
  min-height: 0;
  flex: 1;
}
textarea {
  height: auto;
  min-height: 120px;
  flex: 1;
  padding: 8px 10px;
  resize: vertical;
  font: inherit;
  line-height: 1.4;
  user-select: text;
  -webkit-user-select: text;
}
.td-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.hint {
  font-size: 12px;
}
</style>
