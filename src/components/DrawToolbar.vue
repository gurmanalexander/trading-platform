<script setup lang="ts">
import Icon from './Icon.vue'
import Dropdown from './Dropdown.vue'
import { app, activePane, showPanel, type MagnetMode, type Tool } from '../stores/app'
import { pasteFromClipboard } from '../chart/setup'
import { symbolKey } from '../types'
import { clearDrawings, drawings, redo, selection, undo } from '../stores/drawings'

// На телефоне панель лежит горизонтальной полосой под графиком: ширина экрана там дороже высоты
defineProps<{ horizontal?: boolean }>()

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
  { id: 'text', label: 'Текст' },
  { id: 'long', label: 'Длинная позиция', sep: true },
  { id: 'short', label: 'Короткая позиция' },
  { id: 'measure', label: 'Линейка (Alt+M или Shift+щелчок)', sep: true },
]

const MAGNETS: { id: MagnetMode; label: string; hint: string }[] = [
  { id: 'off', label: 'Без магнита', hint: 'Точки ставятся точно под курсором' },
  { id: 'weak', label: 'Слабый магнит', hint: 'Притягивает, только если курсор рядом с ценой свечи' },
  { id: 'strong', label: 'Сильный магнит', hint: 'Всегда притягивает к ближайшей цене свечи: открытие, хай, лоу, закрытие' },
]
const magnetTitle = () =>
  `${MAGNETS.find((m) => m.id === app.magnet)?.label ?? 'Магнит'}${app.crossMagnet ? ' · перекрестие притягивается' : ''} (Alt+Shift+M — перекрестие с магнитом)`

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
  <nav class="drawbar scroll" :class="{ horizontal }" aria-label="Инструменты рисования">
    <template v-for="t in TOOLS" :key="t.id">
      <span v-if="t.sep" class="sep" />
      <button class="btn" :class="{ on: app.tool === t.id }" :title="t.label" :aria-label="t.label" @click="app.tool = t.id">
        <Icon :name="t.id" />
      </button>
    </template>
    <span class="sep" />
    <button class="btn" title="Чеклист сделки (Alt+K)" @click="showPanel('checklist')"><Icon name="checklist" /></button>
    <button class="btn" title="Вставить из буфера: сделка (ТВХ / SL / TP) или сетапы — то же, что Ctrl+V" @click="pasteFromClipboard()"><Icon name="paste" /></button>
    <span class="sep" />
    <button class="btn" title="Отменить (Ctrl+Z)" @click="undo()"><Icon name="undo" /></button>
    <button class="btn" title="Вернуть (Ctrl+Y)" @click="redo()"><Icon name="redo" /></button>
    <Dropdown :side="!horizontal">
      <template #trigger="{ toggle }">
        <button class="btn magnet" :class="{ on: app.magnet !== 'off', strong: app.magnet === 'strong' }" :title="magnetTitle()" @click="toggle">
          <Icon name="magnet" />
          <i v-if="app.crossMagnet" class="cross-dot" />
        </button>
      </template>
      <template #default="{ close }">
        <button v-for="m in MAGNETS" :key="m.id" class="menu-item" :class="{ on: app.magnet === m.id }" :title="m.hint" @click="(app.magnet = m.id), close()">
          {{ m.label }}
        </button>
        <div class="menu-sep" />
        <label class="menu-item check" title="Горизонтальная линия перекрестия притягивается к цене свечи под курсором — на шкале видна точная цена уровня">
          <input v-model="app.crossMagnet" type="checkbox" />
          Перекрестие с магнитом <span class="muted">Alt+Shift+M</span>
        </label>
      </template>
    </Dropdown>
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
.magnet {
  position: relative;
}
.check {
  cursor: pointer;
}
.check input {
  accent-color: var(--accent);
  width: 15px;
  height: 15px;
  margin: 0;
}
.check .muted {
  margin-left: auto;
  padding-left: 12px;
  font-size: 11px;
}
/* сильный магнит — кнопка залита ярче */
.magnet.strong {
  color: #fff;
  background: var(--accent);
}
/* перекрестие с магнитом — точка в углу кнопки */
.cross-dot {
  position: absolute;
  right: 4px;
  bottom: 4px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 0 1.5px var(--panel);
}
.magnet.strong .cross-dot {
  background: #fff;
}
.drawbar.horizontal {
  flex-direction: row;
  width: auto;
  height: calc(var(--ctl) + 8px);
  padding: 0 5px;
  border-right: 0;
  border-top: 1px solid var(--border);
  overflow-x: auto;
  overflow-y: hidden;
}
.drawbar.horizontal .sep {
  width: 1px;
  height: 20px;
  margin: 0 4px;
}
</style>
