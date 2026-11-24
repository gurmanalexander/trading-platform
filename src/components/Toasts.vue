<script setup lang="ts">
import Icon from './Icon.vue'
import { toasts, dismissToast } from '../stores/app'
import { t } from '../lib/i18n'
</script>

<template>
  <div class="toasts" aria-live="polite">
    <div v-for="item in toasts" :key="item.id" class="toast" :class="item.kind">
      <Icon v-if="item.kind === 'alert'" name="bell" :size="16" />
      <span>{{ item.text }}</span>
      <button class="btn sm" :aria-label="t('Закрыть')" @click="dismissToast(item.id)"><Icon name="x" :size="14" /></button>
    </div>
  </div>
</template>

<style scoped>
.toasts {
  position: fixed;
  left: 50%;
  bottom: calc(70px + env(safe-area-inset-bottom));
  transform: translateX(-50%);
  z-index: 100;
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: min(440px, calc(100vw - 24px));
  pointer-events: none;
}
.toast {
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 8px 8px 12px;
  background: var(--panel-2);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: var(--shadow);
}
.toast span {
  flex: 1;
  user-select: text;
}
.toast.alert {
  border-color: var(--warn);
}
.toast.alert .icon {
  color: var(--warn);
}
.toast.error {
  border-color: var(--down);
}
</style>
