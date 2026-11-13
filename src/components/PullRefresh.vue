<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import Icon from './Icon.vue'

// «Потянуть вниз, чтобы обновить» для сенсорного экрана. Жест начинается, только когда список
// под пальцем прокручен в самый верх; иначе это обычная прокрутка.
const props = defineProps<{ refresh: () => Promise<unknown> }>()

const THRESHOLD = 58
const MAX = 96
const root = ref<HTMLElement>()
/** на сколько вытянут значок, px */
const pull = ref(0)
const busy = ref(false)
const dragging = ref(false)

let startX = 0
let startY = 0
let tracking = false
let scroller: HTMLElement | null = null

/** Прокручиваемый список под пальцем */
function scrollParent(el: HTMLElement | null): HTMLElement | null {
  for (let n = el; n && n !== root.value; n = n.parentElement) {
    const o = getComputedStyle(n).overflowY
    if ((o === 'auto' || o === 'scroll') && n.scrollHeight > n.clientHeight) return n
  }
  return null
}

function onStart(e: TouchEvent) {
  tracking = false
  if (busy.value || e.touches.length !== 1) return
  const t = e.target as HTMLElement
  if (t.closest('input, textarea, select')) return
  scroller = scrollParent(t)
  if (scroller && scroller.scrollTop > 0) return
  tracking = true
  startX = e.touches[0].clientX
  startY = e.touches[0].clientY
}

function stop() {
  tracking = false
  dragging.value = false
  if (!busy.value) pull.value = 0
}

function onMove(e: TouchEvent) {
  if (!tracking) return
  // жест уже забрали себе: в списке перетаскивают строку
  if (e.defaultPrevented || e.touches.length !== 1) return stop()
  const dx = e.touches[0].clientX - startX
  const dy = e.touches[0].clientY - startY
  if (!dragging.value) {
    if (dy < -6 || (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy))) return stop()
    if (dy < 12) return
    if (scroller && scroller.scrollTop > 0) return stop()
    dragging.value = true
  }
  if (e.cancelable) e.preventDefault()
  // значок идёт за пальцем с сопротивлением
  pull.value = Math.min(MAX, Math.max(0, (dy - 12) * 0.5))
}

async function onEnd() {
  if (!tracking) return
  const go = dragging.value && pull.value >= THRESHOLD
  tracking = false
  dragging.value = false
  if (!go) {
    pull.value = 0
    return
  }
  busy.value = true
  pull.value = THRESHOLD
  navigator.vibrate?.(10)
  try {
    await props.refresh()
  } finally {
    busy.value = false
    pull.value = 0
  }
}

onMounted(() => {
  const el = root.value!
  el.addEventListener('touchstart', onStart, { passive: true })
  el.addEventListener('touchmove', onMove, { passive: false })
  el.addEventListener('touchend', onEnd)
  el.addEventListener('touchcancel', stop)
})
onBeforeUnmount(() => {
  const el = root.value
  if (!el) return
  el.removeEventListener('touchstart', onStart)
  el.removeEventListener('touchmove', onMove)
  el.removeEventListener('touchend', onEnd)
  el.removeEventListener('touchcancel', stop)
})
</script>

<template>
  <div ref="root" class="ptr">
    <slot />
    <div
      class="ptr-ind"
      :class="{ busy, ready: pull >= THRESHOLD, moving: dragging }"
      :style="{ transform: `translate(-50%, ${pull - 44}px)`, opacity: Math.min(1, pull / 30) }"
      aria-hidden="true"
    >
      <Icon name="refresh" :size="18" :style="busy ? undefined : { transform: `rotate(${pull * 4}deg)` }" />
    </div>
    <span class="ptr-live" role="status">{{ busy ? 'Обновление данных' : '' }}</span>
  </div>
</template>

<style scoped>
.ptr {
  position: relative;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}
.ptr-ind {
  position: absolute;
  top: 0;
  left: 50%;
  z-index: 30;
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 1px solid var(--border);
  background: var(--panel-2);
  color: var(--muted);
  box-shadow: var(--shadow);
  pointer-events: none;
  transition:
    transform 0.2s ease,
    opacity 0.2s ease;
}
.ptr-ind.moving {
  transition: none;
}
.ptr-ind.ready,
.ptr-ind.busy {
  color: var(--accent);
}
.ptr-ind.busy .icon {
  animation: spin 0.8s linear infinite;
}
.ptr-live {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
}
</style>
