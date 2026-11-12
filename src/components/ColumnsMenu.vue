<script setup lang="ts">
import Icon from './Icon.vue'
import Dropdown from './Dropdown.vue'

// Выбор столбцов таблицы: порядок фиксирован, отмечаются нужные. Название инструмента показывается всегда.
const props = defineProps<{ options: { id: string; label: string; hint?: string }[]; modelValue: string[] }>()
const emit = defineEmits<{ 'update:modelValue': [value: string[]] }>()

function toggle(id: string) {
  const on = props.modelValue.includes(id)
  // порядок столбцов — как в списке вариантов, а не как их включали
  emit('update:modelValue', props.options.map((o) => o.id).filter((x) => (x === id ? !on : props.modelValue.includes(x))))
}
</script>

<template>
  <Dropdown align="right">
    <template #trigger="{ toggle: open }">
      <button class="btn sm" title="Столбцы" @click="open"><Icon name="columns" :size="16" /></button>
    </template>
    <div class="menu-title">Столбцы</div>
    <label class="menu-item check off"><input type="checkbox" checked disabled />Тикер</label>
    <label v-for="o in options" :key="o.id" class="menu-item check" :title="o.hint">
      <input type="checkbox" :checked="modelValue.includes(o.id)" @change="toggle(o.id)" />
      {{ o.label }}
    </label>
  </Dropdown>
</template>

<style scoped>
.menu-title {
  padding: 6px 10px 4px;
  font-size: 11px;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.check {
  cursor: pointer;
}
.check.off {
  color: var(--muted);
  cursor: default;
}
.check input {
  accent-color: var(--accent);
  width: 15px;
  height: 15px;
  margin: 0;
}
</style>
