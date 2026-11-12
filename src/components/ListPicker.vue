<script setup lang="ts">
import { computed } from 'vue'
import Icon from './Icon.vue'
import Dropdown from './Dropdown.vue'
import ListMenu from './ListMenu.vue'
import type { SymbolRef } from '../types'
import { listsOf } from '../stores/watchlist'

// Флажок в строке отбора и поиска: показывает, в каких списках монета, и открывает выбор
// списков. Там же ставится направление — чтобы за одно открытие сделать и то, и другое.
// group — монеты, выбранные вместе с этой: тогда меню действует сразу на все.
const props = defineProps<{ item: SymbolRef; group?: SymbolRef[] }>()

const member = computed(() => listsOf(props.item))
const targets = computed(() => (props.group && props.group.length > 1 ? props.group : [props.item]))
const title = computed(() =>
  targets.value.length > 1
    ? `Добавить выбранные (${targets.value.length}) в список`
    : member.value.length
      ? 'В списках: ' + member.value.map((l) => l.name).join(', ')
      : 'Добавить в список',
)
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
    <ListMenu :items="targets" />
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
</style>
