<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import Icon from './Icon.vue'

defineProps<{ title: string; width?: number }>()
const emit = defineEmits<{ close: [] }>()

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.stopPropagation()
    emit('close')
  }
}
onMounted(() => window.addEventListener('keydown', onKey, true))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey, true))
</script>

<template>
  <div class="modal-back" @pointerdown.self="emit('close')">
    <div class="modal" role="dialog" :aria-label="title" :style="{ width: (width ?? 520) + 'px' }">
      <header class="modal-head">
        <span class="modal-title">{{ title }}</span>
        <button class="btn" aria-label="Закрыть" @click="emit('close')"><Icon name="x" /></button>
      </header>
      <slot />
    </div>
  </div>
</template>

<style>
.modal-back {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 8vh 12px 12px;
  background: rgba(0, 0, 0, 0.5);
}
.modal {
  display: flex;
  flex-direction: column;
  max-width: 100%;
  max-height: 100%;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: var(--shadow);
  overflow: hidden;
}
.modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 6px 6px 14px;
  border-bottom: 1px solid var(--border);
  flex: none;
}
.modal-title {
  font-weight: 600;
  font-size: 14px;
}
@media (max-width: 719px) {
  .modal-back {
    padding: 0;
  }
  .modal {
    width: 100% !important;
    height: 100%;
    border: 0;
    border-radius: 0;
    padding-top: env(safe-area-inset-top);
    padding-bottom: env(safe-area-inset-bottom);
  }
}
</style>
