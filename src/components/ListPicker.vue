<script setup lang="ts">
import { computed } from 'vue'
import Icon from './Icon.vue'
import Dropdown from './Dropdown.vue'
import { sameSymbol, type SymbolRef } from '../types'
import { lists, listsOf, markOf, setMark, toggleInList, type Side } from '../stores/watchlist'

// Флажок в строке отбора и поиска: показывает, в каких списках монета, и открывает выбор
// списков. Там же ставится направление — чтобы за одно открытие сделать и то, и другое.
const props = defineProps<{ item: SymbolRef }>()

const member = computed(() => listsOf(props.item))
const has = (items: SymbolRef[]) => items.some((r) => sameSymbol(r, props.item))
const title = computed(() => (member.value.length ? 'В списках: ' + member.value.map((l) => l.name).join(', ') : 'Добавить в список'))

function mark(side: Side) {
  setMark(props.item, markOf(props.item) === side ? null : side)
}
</script>

<template>
  <Dropdown align="right">
    <template #trigger="{ toggle }">
      <button class="btn sm picker" :class="{ in: member.length > 0 }" :title="title" @click.stop="toggle">
        <!-- цвет флажка — цвет первого списка, где есть монета; второй флажок — если списков несколько -->
        <Icon name="flag" :size="14" :style="member.length ? { color: member[0].color } : undefined" />
        <i v-if="member.length > 1" :style="{ background: member[1].color }" />
      </button>
    </template>
    <div class="lp" @click.stop>
      <div class="lp-title">{{ item.symbol }}</div>
      <div class="lp-sides">
        <button class="btn sm" :class="{ on: markOf(item) === 'long', up: true }" @click="mark('long')">▲ Лонг</button>
        <button class="btn sm" :class="{ on: markOf(item) === 'short', down: true }" @click="mark('short')">▼ Шорт</button>
      </div>
      <div class="menu-sep" />
      <button v-for="l in lists.all" :key="l.id" class="menu-item" :class="{ on: has(l.items) }" @click="toggleInList(l, item)">
        <Icon name="flag" :size="15" class="lp-flag" :style="{ color: l.color }" />
        <span class="lp-name">{{ l.name }}</span>
        <Icon v-if="has(l.items)" name="check" :size="15" />
      </button>
    </div>
  </Dropdown>
</template>

<style scoped>
.picker {
  position: relative;
  min-width: 22px;
  padding: 0;
  color: var(--muted);
}
.picker.in :deep(path) {
  fill: currentColor;
  fill-opacity: 0.85;
}
.picker i {
  position: absolute;
  right: 1px;
  top: 3px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
}
.lp {
  min-width: 190px;
}
.lp-title {
  padding: 6px 10px 2px;
  font-weight: 600;
}
.lp-sides {
  display: flex;
  gap: 4px;
  padding: 4px 6px;
}
.lp-sides .btn {
  flex: 1;
  border: 1px solid var(--border);
}
.lp-sides .btn.on {
  border-color: currentColor;
  background: var(--accent-soft);
}
.lp-flag :deep(path) {
  fill: currentColor;
  fill-opacity: 0.85;
}
.lp-name {
  flex: 1;
}
</style>
