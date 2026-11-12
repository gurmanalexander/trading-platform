<script setup lang="ts">
import Icon from './Icon.vue'
import Modal from './Modal.vue'
import { app, activePane, toast } from '../stores/app'
import { INDICATORS, newIndicator } from '../lib/indicators'

const MAX_PER_CHART = 12
const groups = [
  { title: 'На графике цены', list: INDICATORS.filter((d) => d.overlay) },
  { title: 'В отдельной панели', list: INDICATORS.filter((d) => !d.overlay) },
]

const count = (type: string) => activePane.value.indicators.filter((i) => i.type === type).length

function add(type: string) {
  const list = activePane.value.indicators
  if (list.length >= MAX_PER_CHART) {
    toast(`На одном графике не больше ${MAX_PER_CHART} индикаторов`, 'error')
    return
  }
  if (type === 'vol' && count('vol')) return
  const inst = newIndicator(type)
  if (inst) list.push(inst)
}
</script>

<template>
  <Modal title="Индикаторы" :width="420" @close="app.indicatorsOpen = false">
    <div class="ind-list scroll">
      <template v-for="g in groups" :key="g.title">
        <div class="ind-group muted">{{ g.title }}</div>
        <button v-for="d in g.list" :key="d.type" class="ind-row" @click="add(d.type)">
          <span>{{ d.name }}</span>
          <span v-if="count(d.type)" class="tag">на графике: {{ count(d.type) }}</span>
          <Icon name="plus" :size="16" />
        </button>
      </template>
    </div>
  </Modal>
</template>

<style scoped>
.ind-list {
  padding: 4px 0 8px;
}
.ind-group {
  padding: 10px 14px 4px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.ind-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 42px;
  padding: 0 14px;
  text-align: left;
}
.ind-row span:first-child {
  flex: 1;
}
.ind-row:hover {
  background: var(--hover);
}
.ind-row .icon {
  color: var(--muted);
}
</style>
