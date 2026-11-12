<script setup lang="ts">
import Modal from './Modal.vue'
import { app, theme, type ColorKey } from '../stores/app'
import { defaultColor } from '../chart/theme'

// Свои цвета интерфейса и графиков — отдельно для тёмной и светлой темы
const ROWS: { key: ColorKey; label: string; hint: string }[] = [
  { key: 'up', label: 'Рост', hint: 'Растущие свечи и бары, положительные числа' },
  { key: 'down', label: 'Падение', hint: 'Падающие свечи и бары, отрицательные числа' },
  { key: 'bg', label: 'Фон', hint: 'Фон графиков и приложения' },
  { key: 'grid', label: 'Сетка', hint: 'Линии сетки на графике' },
  { key: 'text', label: 'Текст шкал', hint: 'Цены и время на шкалах графика' },
  { key: 'accent', label: 'Акцент', hint: 'Выделение, кнопки, линейный график' },
]

const value = (key: ColorKey) => app.colors[theme.value][key] ?? defaultColor(theme.value, key)
function set(key: ColorKey, v: string) {
  app.colors[theme.value][key] = v
}
function reset(key: ColorKey) {
  delete app.colors[theme.value][key]
}
function resetAll() {
  app.colors[theme.value] = {}
}
</script>

<template>
  <Modal :title="'Цвета · ' + (theme === 'dark' ? 'тёмная тема' : 'светлая тема')" :width="380" @close="app.colorsOpen = false">
    <div class="cd">
      <div v-for="r in ROWS" :key="r.key" class="cd-row" :title="r.hint">
        <span>{{ r.label }}</span>
        <button v-if="app.colors[theme][r.key]" class="btn sm muted" title="Вернуть стандартный" @click="reset(r.key)">сброс</button>
        <input type="color" :value="value(r.key)" @input="set(r.key, ($event.target as HTMLInputElement).value)" />
      </div>
      <p class="muted">Цвета задаются для текущей темы. Чтобы настроить другую, переключите тему в настройках.</p>
      <div class="cd-actions">
        <button class="btn" @click="resetAll">Стандартные цвета</button>
        <button class="btn primary" @click="app.colorsOpen = false">Готово</button>
      </div>
    </div>
  </Modal>
</template>

<style scoped>
.cd {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px 14px;
}
.cd-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.cd-row span {
  flex: 1;
}
input[type='color'] {
  width: 64px;
  height: var(--ctl);
  padding: 2px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg);
  cursor: pointer;
}
p {
  margin: 4px 0 0;
  font-size: 12px;
}
.cd-actions {
  display: flex;
  justify-content: space-between;
  margin-top: 6px;
}
</style>
