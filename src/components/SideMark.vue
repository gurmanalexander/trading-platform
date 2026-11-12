<script setup lang="ts">
import type { SymbolRef } from '../types'
import { cycleSide, markOf, sideOf } from '../stores/watchlist'

// Отметка направления монеты: ▲ лонг, ▼ шорт. Одна и та же в отборе, поиске и списках.
defineProps<{ item: SymbolRef }>()
</script>

<template>
  <button
    class="side-mark"
    :class="[sideOf(item) ?? 'none', { manual: !!markOf(item) }]"
    :title="
      (sideOf(item) === 'long' ? 'Лонг' : sideOf(item) === 'short' ? 'Шорт' : 'Направление не отмечено') +
      (markOf(item) || !sideOf(item) ? '' : ' (по последней позиции)') +
      '. Нажмите: нет → лонг → шорт'
    "
    @click.stop="cycleSide(item)"
  >
    {{ sideOf(item) === 'long' ? '▲' : sideOf(item) === 'short' ? '▼' : '·' }}
  </button>
</template>

<style>
.side-mark {
  width: 18px;
  height: 22px;
  border-radius: 4px;
  font-size: 10px;
  line-height: 1;
  color: var(--muted);
  opacity: 0.75;
  flex: none;
}
.side-mark:hover {
  background: var(--panel-2);
}
.side-mark.long {
  color: var(--up);
}
.side-mark.short {
  color: var(--down);
}
.side-mark.manual {
  opacity: 1;
}
@media (max-width: 719px) {
  .side-mark {
    width: 26px;
    height: 30px;
    font-size: 12px;
  }
}
</style>
