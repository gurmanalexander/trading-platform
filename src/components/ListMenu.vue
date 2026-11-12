<script setup lang="ts">
import { computed } from 'vue'
import Icon from './Icon.vue'
import { sameSymbol, type SymbolRef } from '../types'
import { toast } from '../stores/app'
import { lists, markOf, setMark, type Side, type WatchList } from '../stores/watchlist'

// Меню «в какие списки и с каким направлением»: для одной монеты или сразу для нескольких выбранных.
const props = defineProps<{ items: SymbolRef[] }>()

const many = computed(() => props.items.length > 1)
/** Сколько из выбранных монет лежит в списке */
const countIn = (l: WatchList) => props.items.filter((it) => l.items.some((r) => sameSymbol(r, it))).length
const allMarked = (side: Side) => props.items.length > 0 && props.items.every((it) => markOf(it) === side)

function mark(side: Side) {
  const next = allMarked(side) ? null : side
  for (const it of props.items) setMark(it, next)
}

/** Все уже в списке — убирает их оттуда; иначе добавляет в конец тех, кого там нет */
function toggle(l: WatchList) {
  if (countIn(l) === props.items.length) {
    l.items = l.items.filter((r) => !props.items.some((it) => sameSymbol(r, it)))
    if (many.value) toast(`Из списка «${l.name}» убрано: ${props.items.length}`)
    return
  }
  let added = 0
  for (const it of props.items) {
    if (l.items.some((r) => sameSymbol(r, it))) continue
    l.items.push({ exchange: it.exchange, market: it.market, symbol: it.symbol })
    added++
  }
  l.collapsed = false
  if (many.value) toast(`В список «${l.name}» добавлено: ${added}`)
}
</script>

<template>
  <div class="lp" @click.stop>
    <div class="lp-title">{{ many ? 'Выбрано монет: ' + items.length : items[0]?.symbol }}</div>
    <div class="lp-sides">
      <button class="btn sm up" :class="{ on: allMarked('long') }" @click="mark('long')">▲ Лонг</button>
      <button class="btn sm down" :class="{ on: allMarked('short') }" @click="mark('short')">▼ Шорт</button>
    </div>
    <div class="menu-sep" />
    <button v-for="l in lists.all" :key="l.id" class="menu-item" :class="{ on: countIn(l) === items.length }" @click="toggle(l)">
      <Icon name="flag" :size="15" class="lp-flag" :style="{ color: l.color }" />
      <span class="lp-name">{{ l.name }}</span>
      <Icon v-if="countIn(l) === items.length" name="check" :size="15" />
      <span v-else-if="countIn(l)" class="muted lp-part" title="В списке только часть выбранных монет">{{ countIn(l) }} из {{ items.length }}</span>
    </button>
  </div>
</template>

<style scoped>
.lp {
  min-width: 200px;
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
.lp-part {
  font-size: 11px;
}
</style>
