<script setup lang="ts">
import { computed, reactive } from 'vue'
import Modal from './Modal.vue'
import { app } from '../stores/app'
import { indicatorDef } from '../lib/indicators'
import { t } from '../lib/i18n'

const target = app.indSettings!
const inst = computed(() => app.panes[target.pane].indicators.find((i) => i.id === target.id))
const def = computed(() => (inst.value ? indicatorDef(inst.value.type) : undefined))

// правим копию и применяем по кнопке — график не пересчитывается на каждый символ ввода
const params = reactive<Record<string, number>>({ ...inst.value?.params })
const colors = reactive<string[]>(def.value?.plots.map((p, i) => inst.value?.colors?.[i] ?? p.color) ?? [])

function close() {
  app.indSettings = null
}
function apply() {
  const i = inst.value
  const d = def.value
  if (i && d) {
    for (const p of d.params) {
      const v = Number(params[p.key])
      i.params[p.key] = isFinite(v) ? Math.min(p.max, Math.max(p.min, v)) : p.def
    }
    i.colors = colors.slice()
  }
  close()
}
function reset() {
  const d = def.value
  if (!d) return
  for (const p of d.params) params[p.key] = p.def
  d.plots.forEach((p, i) => (colors[i] = p.color))
}
</script>

<template>
  <Modal :title="def ? t(def.name) : t('Индикатор')" :width="340" @close="close">
    <form v-if="def" class="is" @submit.prevent="apply">
      <template v-for="p in def.params" :key="p.key">
        <label v-if="p.bool" class="is-row check">
          <span>{{ t(p.label) }}</span>
          <input :checked="params[p.key] === 1" type="checkbox" @change="params[p.key] = ($event.target as HTMLInputElement).checked ? 1 : 0" />
        </label>
        <label v-else class="is-row">
          <span>{{ t(p.label) }}</span>
          <input v-model.number="params[p.key]" class="field" type="number" inputmode="decimal" :min="p.min" :max="p.max" :step="p.step ?? 1" />
        </label>
      </template>
      <template v-for="(plot, i) in def.plots" :key="i">
        <label v-if="plot.kind === 'line'" class="is-row">
          <span>{{ t('Цвет: {name}', { name: t(plot.label) }) }}</span>
          <input v-model="colors[i]" class="color" type="color" />
        </label>
      </template>
      <div class="is-actions">
        <button type="button" class="btn" @click="reset">{{ t('По умолчанию') }}</button>
        <button type="submit" class="btn primary">{{ t('Применить') }}</button>
      </div>
    </form>
  </Modal>
</template>

<style scoped>
.is {
  padding: 12px 14px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.is-row {
  display: grid;
  grid-template-columns: 1fr 110px;
  align-items: center;
  gap: 10px;
}
.is-row.check {
  cursor: pointer;
}
.is-row.check input {
  justify-self: start;
}
.color {
  width: 110px;
  height: var(--ctl);
  padding: 2px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg);
}
.is-actions {
  display: flex;
  justify-content: space-between;
  margin-top: 6px;
}
</style>
