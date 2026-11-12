<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref } from 'vue'

// Выпадающее меню. Рисуется прямо в body: так его не обрезает прокручиваемая панель
// и не перекрывают элементы со своим слоем (например, закреплённые заголовки списков).
const props = defineProps<{ align?: 'left' | 'right' }>()
const open = ref(false)
const root = ref<HTMLElement>()
const menu = ref<HTMLElement>()
const style = ref<Record<string, string>>({})

function place() {
  const r = root.value!.getBoundingClientRect()
  const m = menu.value!
  const w = m.offsetWidth
  const h = m.offsetHeight
  let left = props.align === 'right' ? r.right - w : r.left
  left = Math.max(6, Math.min(window.innerWidth - w - 6, left))
  let top = r.bottom + 4
  if (top + h > window.innerHeight - 6) top = Math.max(6, r.top - h - 4)
  style.value = { left: left + 'px', top: top + 'px' }
}

function onDocDown(e: Event) {
  const t = e.target as Node
  if (!root.value?.contains(t) && !menu.value?.contains(t)) close()
}

async function toggle() {
  if (open.value) return close()
  open.value = true
  style.value = { left: '-9999px', top: '0' }
  await nextTick()
  place()
  document.addEventListener('pointerdown', onDocDown, true)
  window.addEventListener('resize', close)
}

function close() {
  open.value = false
  document.removeEventListener('pointerdown', onDocDown, true)
  window.removeEventListener('resize', close)
}

onBeforeUnmount(close)
</script>

<template>
  <div ref="root" class="dropdown">
    <slot name="trigger" :toggle="toggle" :open="open" />
    <Teleport to="body">
      <div v-if="open" ref="menu" class="menu dropdown-menu scroll" :style="style">
        <slot :close="close" />
      </div>
    </Teleport>
  </div>
</template>

<style>
.dropdown {
  position: relative;
  display: inline-flex;
  flex: none;
}
.dropdown-menu {
  position: fixed;
  z-index: 90;
  max-height: calc(100dvh - 60px);
  max-width: calc(100vw - 12px);
}
</style>
