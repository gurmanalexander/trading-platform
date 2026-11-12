<script setup lang="ts">
import Icon from './Icon.vue'
import { app, activePane, type Tool } from '../stores/app'
import { symbolKey } from '../types'
import { clearDrawings, drawings, selection } from '../stores/drawings'

const TOOLS: { id: Tool; label: string }[] = [
  { id: 'cursor', label: 'Курсор' },
  { id: 'trend', label: 'Линия тренда' },
  { id: 'ray', label: 'Луч' },
  { id: 'hline', label: 'Горизонтальная линия' },
  { id: 'vline', label: 'Вертикальная линия' },
  { id: 'rect', label: 'Прямоугольник' },
  { id: 'fib', label: 'Уровни Фибоначчи' },
  { id: 'measure', label: 'Линейка' },
]

function clearAll() {
  const key = symbolKey(activePane.value.symbol)
  const n = drawings[key]?.length ?? 0
  if (!n) return
  if (confirm(`Удалить все рисунки (${n}) на ${activePane.value.symbol.symbol}?`)) {
    clearDrawings(key)
    selection.value = null
  }
}
</script>

<template>
  <nav class="drawbar scroll" aria-label="Инструменты рисования">
    <button
      v-for="t in TOOLS"
      :key="t.id"
      class="btn"
      :class="{ on: app.tool === t.id }"
      :title="t.label"
      :aria-label="t.label"
      @click="app.tool = t.id"
    >
      <Icon :name="t.id" />
    </button>
    <span class="sep" />
    <button class="btn" :class="{ on: app.magnet }" title="Магнит: привязка к ценам свечи" @click="app.magnet = !app.magnet">
      <Icon name="magnet" />
    </button>
    <button class="btn" title="Удалить все рисунки" @click="clearAll"><Icon name="trash" /></button>
  </nav>
</template>

<style scoped>
.drawbar {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  width: calc(var(--ctl) + 10px);
  padding: 5px 0;
  background: var(--panel);
  border-right: 1px solid var(--border);
  flex: none;
  scrollbar-width: none;
}
.sep {
  width: 20px;
  height: 1px;
  margin: 4px 0;
  background: var(--border);
  flex: none;
}
</style>
