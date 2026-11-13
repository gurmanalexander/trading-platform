<script setup lang="ts">
import { computed } from 'vue'
import Icon from './Icon.vue'
import { app, activePane } from '../stores/app'
import { listsOf } from '../stores/watchlist'
import { stepInfo, stepSource, stepSymbol } from '../stores/screener'

// Телефон: полоса под графиком листает монеты того списка, из которого открыли график.
// Слева и справа — соседние монеты (нажатие или смахивание по полосе), посередине — список и место в нём.
const title = computed(() => (stepSource.value === 'screener' ? 'Отбор' : (listsOf(activePane.value.symbol)[0]?.name ?? 'Списки')))
const place = computed(() => (stepInfo.value.index >= 0 ? `${stepInfo.value.index + 1} из ${stepInfo.value.count}` : `монет: ${stepInfo.value.count}`))

let startX = 0
let startY = 0
let swiped = false
function onStart(e: TouchEvent) {
  startX = e.touches[0].clientX
  startY = e.touches[0].clientY
  swiped = false
}
function onEnd(e: TouchEvent) {
  const t = e.changedTouches[0]
  const dx = t.clientX - startX
  if (Math.abs(dx) < 36 || Math.abs(dx) < Math.abs(t.clientY - startY) * 1.5) return
  // палец влево — следующая монета, как при перелистывании страниц
  swiped = true
  stepSymbol(dx < 0 ? 1 : -1)
}
/** Смахивание заканчивается над кнопкой — её нажатие в этом случае не считается */
function tap(fn: () => void) {
  if (swiped) swiped = false
  else fn()
}
</script>

<template>
  <div v-if="stepInfo.count" class="strip" @touchstart.passive="onStart" @touchend.passive="onEnd">
    <button class="side" title="Предыдущая монета списка" :disabled="stepInfo.count < 2 && stepInfo.index >= 0" @click="tap(() => stepSymbol(-1))">
      <Icon name="prev" :size="18" /><span>{{ stepInfo.prev?.symbol }}</span>
    </button>
    <button class="mid" title="Открыть список" @click="tap(() => (app.mobileTab = stepSource))">
      <b>{{ title }}</b>
      <span class="muted">{{ place }}</span>
    </button>
    <button class="side next" title="Следующая монета списка" :disabled="stepInfo.count < 2 && stepInfo.index >= 0" @click="tap(() => stepSymbol(1))">
      <span>{{ stepInfo.next?.symbol }}</span><Icon name="next" :size="18" />
    </button>
  </div>
</template>

<style scoped>
.strip {
  display: flex;
  align-items: stretch;
  height: 38px;
  background: var(--panel);
  border-top: 1px solid var(--border);
  flex: none;
  touch-action: pan-y;
}
.strip button {
  display: flex;
  align-items: center;
  min-width: 0;
}
.side {
  flex: 1 1 0;
  gap: 2px;
  padding: 0 6px;
  font-size: 12.5px;
  color: var(--text);
}
.side.next {
  justify-content: flex-end;
}
.side span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.side:disabled {
  opacity: 0.35;
}
.side:active:not(:disabled),
.mid:active {
  background: var(--hover);
}
.side .icon {
  color: var(--muted);
}
.mid {
  flex: 0 1 auto;
  max-width: 44%;
  flex-direction: column;
  justify-content: center;
  padding: 0 10px;
  border-left: 1px solid var(--border);
  border-right: 1px solid var(--border);
  line-height: 1.2;
}
.mid b {
  max-width: 100%;
  font-size: 11.5px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mid .muted {
  font-size: 10.5px;
  white-space: nowrap;
}
</style>
