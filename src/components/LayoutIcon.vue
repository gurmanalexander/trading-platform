<script setup lang="ts">
import { computed } from 'vue'
import type { LayoutDef } from '../stores/app'

// Значок раскладки рисуется по её описанию — отдельная картинка на каждый вариант не нужна
const props = defineProps<{ def: LayoutDef }>()
const W = 22
const H = 16

const rects = computed(() => {
  const { dir, groups } = props.def
  const out: { x: number; y: number; w: number; h: number }[] = []
  const main = (dir === 'rows' ? H : W) / groups.length
  groups.forEach((n, gi) => {
    const cross = (dir === 'rows' ? W : H) / n
    for (let ci = 0; ci < n; ci++) {
      out.push(
        dir === 'rows'
          ? { x: 1 + ci * cross, y: 1 + gi * main, w: cross, h: main }
          : { x: 1 + gi * main, y: 1 + ci * cross, w: main, h: cross },
      )
    }
  })
  return out
})
</script>

<template>
  <svg class="layout-icon" :width="W + 2" :height="H + 2" :viewBox="`0 0 ${W + 2} ${H + 2}`" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true">
    <rect v-for="(r, i) in rects" :key="i" :x="r.x" :y="r.y" :width="r.w" :height="r.h" rx="1" />
  </svg>
</template>

<style>
.layout-icon {
  display: block;
  flex: none;
}
</style>
