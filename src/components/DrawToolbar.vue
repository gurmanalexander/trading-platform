<script setup lang="ts">
import Icon from './Icon.vue'
import { app, activePane, type Tool } from '../stores/app'
import { symbolKey } from '../types'
import { clearDrawings, drawings, selection } from '../stores/drawings'

const TOOLS: { id: Tool; label: string; sep?: boolean }[] = [
  { id: 'cursor', label: 'Курсор (Esc)' },
  { id: 'trend', label: 'Линия тренда (Alt+T)' },
  { id: 'ray', label: 'Луч' },
  { id: 'hline', label: 'Горизонтальная линия (Alt+H)' },
  { id: 'hray', label: 'Горизонтальный луч (Alt+J)' },
  { id: 'vline', label: 'Вертикальная линия (Alt+V)' },
  { id: 'cross', label: 'Перекрестие (Alt+C)' },
  { id: 'rect', label: 'Прямоугольник (Alt+Shift+R)' },
  { id: 'fib', label: 'Уровни Фибоначчи (Alt+F)' },
  { id: 'long', label: 'Длинная позиция', sep: true },
  { id: 'short', label: 'Короткая позиция' },
  { id: 'measure', label: 'Линейка (Shift+щелчок)', sep: true },
]

function clearAll() {
  const key = symbolKey(activePane.value.symbol)
  const n = drawings[key]?.length ?? 0
  if (!n) return
  if (confirm(`Удалить все рисунки (${n}) на ${activePane.value.symbol.symbol}? Отменить можно через Ctrl+Z.`)) {
    clearDrawings(key)
    selection.value = null
  }
}
</script>

<template>
  <nav class="drawbar scroll" aria-label="Инструменты рисования">
    <template v-for="t in TOOLS" :key="t.id">
      <span v-if="t.sep" class="sep" />
      <button class="btn" :class="{ on: app.tool === t.id }" :title="t.label" :aria-label="t.label" @click="app.tool = t.id">
        <Icon :name="t.id" />
      </button>
    </template>
    <span class="sep" />
    <button class="btn" :class="{ on: app.magnet }" title="Магнит: привязка к ценам свечи" @click="app.magnet = !app.magnet">
      <Icon name="magnet" />
    </button>
    <button
      class="btn"
      :class="{ on: app.drawingsHidden }"
      :title="app.drawingsHidden ? 'Показать рисунки (Ctrl+Alt+H)' : 'Скрыть рисунки (Ctrl+Alt+H)'"
      @click="app.drawingsHidden = !app.drawingsHidden"
    >
      <Icon :name="app.drawingsHidden ? 'eyeOff' : 'eye'" />
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
.drawbar::-webkit-scrollbar {
  display: none;
}
.sep {
  width: 20px;
  height: 1px;
  margin: 4px 0;
  background: var(--border);
  flex: none;
}
</style>
