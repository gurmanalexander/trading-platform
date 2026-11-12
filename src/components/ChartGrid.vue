<script setup lang="ts">
import { computed } from 'vue'
import ChartPane from './ChartPane.vue'
import { app, activeIndex, isPhone } from '../stores/app'

// номера панелей по группам: [[0], [1, 2]]
const groups = computed(() => {
  let next = 0
  return app.layout.groups.map((n) => Array.from({ length: n }, () => next++))
})

/** На телефоне и в развёрнутом режиме на экране одна панель — активная */
const single = computed(() => isPhone.value || app.maximized)
const shown = (index: number) => !single.value || index === activeIndex.value
const groupShown = (cells: number[]) => !single.value || cells.includes(activeIndex.value)

const MIN_PX = 90

/** Перетаскивание границы: меняет доли двух соседних групп или панелей */
function startResize(e: PointerEvent, sizes: number[], i: number, vertical: boolean) {
  const bar = e.currentTarget as HTMLElement
  const before = bar.previousElementSibling as HTMLElement | null
  const after = bar.nextElementSibling as HTMLElement | null
  if (!before || !after) return
  e.preventDefault()
  bar.setPointerCapture(e.pointerId)
  const a0 = vertical ? before.offsetHeight : before.offsetWidth
  const b0 = vertical ? after.offsetHeight : after.offsetWidth
  const total = a0 + b0
  const share = sizes[i - 1] + sizes[i]
  const start = vertical ? e.clientY : e.clientX
  if (total < MIN_PX * 2) return
  const move = (ev: PointerEvent) => {
    const a = Math.min(total - MIN_PX, Math.max(MIN_PX, a0 + (vertical ? ev.clientY : ev.clientX) - start))
    sizes[i - 1] = (share * a) / total
    sizes[i] = share - sizes[i - 1]
  }
  const stop = () => {
    bar.removeEventListener('pointermove', move)
    bar.removeEventListener('pointerup', stop)
    bar.removeEventListener('pointercancel', stop)
  }
  bar.addEventListener('pointermove', move)
  bar.addEventListener('pointerup', stop)
  bar.addEventListener('pointercancel', stop)
}

/** Двойной щелчок по границе возвращает равные доли */
function equalize(sizes: number[]) {
  sizes.fill(1)
}
</script>

<template>
  <main class="grid" :class="[app.layout.dir, { single }]">
    <template v-for="(cells, gi) in groups" :key="gi">
      <div
        v-if="gi > 0"
        v-show="!single"
        class="split main"
        title="Потяните, чтобы изменить размер. Двойной щелчок — поровну"
        @pointerdown="startResize($event, app.layout.groupSizes, gi, app.layout.dir === 'rows')"
        @dblclick="equalize(app.layout.groupSizes)"
      />
      <div v-show="groupShown(cells)" class="group" :style="{ flex: `${app.layout.groupSizes[gi]} 1 0` }">
        <template v-for="(index, ci) in cells" :key="index">
          <div
            v-if="ci > 0"
            v-show="!single"
            class="split cross"
            title="Потяните, чтобы изменить размер. Двойной щелчок — поровну"
            @pointerdown="startResize($event, app.layout.cellSizes[gi], ci, app.layout.dir === 'cols')"
            @dblclick="equalize(app.layout.cellSizes[gi])"
          />
          <!-- на телефоне скрытые панели не создаются вовсе: меньше соединений и памяти -->
          <ChartPane
            v-if="!isPhone || index === activeIndex"
            v-show="shown(index)"
            :index="index"
            :style="{ flex: `${app.layout.cellSizes[gi][ci]} 1 0` }"
          />
        </template>
      </div>
    </template>
  </main>
</template>

<style scoped>
.grid {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  background: var(--border);
}
.grid.rows {
  flex-direction: column;
}
.group {
  display: flex;
  min-width: 0;
  min-height: 0;
}
.grid.cols .group {
  flex-direction: column;
}
/* Граница: тонкая линия с широкой зоной захвата */
.split {
  position: relative;
  flex: none;
  z-index: 9;
  background: var(--border);
  touch-action: none;
}
.split::after {
  content: '';
  position: absolute;
}
.split:hover,
.split:active {
  background: var(--accent);
}
.rows > .split.main,
.cols .split.cross {
  height: 2px;
  cursor: row-resize;
}
.rows > .split.main::after,
.cols .split.cross::after {
  inset: -5px 0;
}
.cols > .split.main,
.rows .split.cross {
  width: 2px;
  cursor: col-resize;
}
.cols > .split.main::after,
.rows .split.cross::after {
  inset: 0 -5px;
}
</style>
