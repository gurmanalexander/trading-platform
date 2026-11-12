<script setup lang="ts">
import { computed } from 'vue'
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
        <!-- точка — цвет списка, где лежит монета; вторая — если списков несколько; пустое кольцо — монеты нет ни в одном -->
        <i class="dot" :style="member.length ? { background: member[0].color, borderColor: member[0].color } : undefined" />
        <i v-if="member.length > 1" class="dot second" :style="{ background: member[1].color, borderColor: member[1].color }" />
      </button>
    </template>
    <ListMenu :items="targets" />
  </Dropdown>
</template>

<style scoped>
.picker {
  position: relative;
  min-width: 20px;
  width: 20px;
  padding: 0;
}
.dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  border: 1.5px solid var(--border);
}
.picker:hover .dot {
  border-color: var(--muted);
}
.dot.second {
  position: absolute;
  right: 0;
  top: 5px;
  width: 6px;
  height: 6px;
  border-width: 0;
}
</style>
