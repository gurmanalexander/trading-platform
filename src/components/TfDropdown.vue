<script setup lang="ts">
import Icon from './Icon.vue'
import Dropdown from './Dropdown.vue'
import { app, activePane, setTf, toggleFavTf } from '../stores/app'
import { TIMEFRAMES, getTf } from '../lib/timeframes'

// Выбор интервала активного окна и избранных интервалов.
// label — показывать на кнопке текущий интервал; side — меню сбоку (кнопка стоит в вертикальной колонке)
defineProps<{ label?: boolean; side?: boolean }>()
</script>

<template>
  <Dropdown :side="side">
    <template #trigger="{ toggle }">
      <button class="btn" :class="{ on: label }" title="Интервал: выбор и избранные" @click="toggle">
        <template v-if="label">{{ getTf(activePane.tf).label }}</template>
        <Icon v-if="!side" name="chevron" :size="14" />
      </button>
    </template>
    <template #default="{ close }">
      <div class="tf-menu" :class="{ cols: side }">
        <div v-for="t in TIMEFRAMES" :key="t.id" class="tf-row">
          <button class="menu-item" :class="{ on: activePane.tf === t.id }" @click="setTf(t.id), close()">{{ t.label }}</button>
          <button
            class="btn sm star"
            :class="{ on: app.favTfs.includes(t.id) }"
            :title="app.favTfs.includes(t.id) ? 'Убрать с панели' : 'Показывать на панели'"
            @click="toggleFavTf(t.id)"
          >
            <Icon name="star" :size="15" />
          </button>
        </div>
      </div>
    </template>
  </Dropdown>
</template>

<style scoped>
/* телефон набок: высоты мало — интервалы в два столбца */
.tf-menu.cols {
  display: grid;
  grid-template-columns: 1fr 1fr;
  column-gap: 6px;
}
.tf-row {
  display: flex;
  align-items: center;
  gap: 2px;
}
.tf-row .menu-item {
  flex: 1;
  min-width: 90px;
}
.star {
  color: var(--muted);
}
.star.on {
  background: none;
  color: var(--warn);
}
.star.on :deep(path) {
  fill: currentColor;
}
</style>
