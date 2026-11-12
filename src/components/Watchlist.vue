<script setup lang="ts">
import Icon from './Icon.vue'
import Dropdown from './Dropdown.vue'
import { EXCHANGE_NAMES, sameSymbol, symbolKey, type SymbolRef } from '../types'
import { activePane, openSearch, setSymbol } from '../stores/app'
import { tickers, useTickers } from '../stores/tickers'
import { lists, activeList, watchlist, toggleWatch, createList, renameList, deleteList } from '../stores/watchlist'
import { fmtPct, fmtPrice, precisionOf } from '../lib/format'

useTickers(() => watchlist.value)

const MARKET_SHORT = { spot: 'спот', futures: 'фьюч' } as const

function price(r: SymbolRef) {
  const key = symbolKey(r)
  const t = tickers[key]
  return t ? fmtPrice(t.last, precisionOf(key, t.last)) : '—'
}

function create() {
  const name = prompt('Название нового списка', `Список ${lists.all.length + 1}`)?.trim()
  if (name) createList(name.slice(0, 40))
}
function rename() {
  const name = prompt('Название списка', activeList.value.name)?.trim()
  if (name) renameList(activeList.value.id, name.slice(0, 40))
}
function remove() {
  if (confirm(`Удалить список «${activeList.value.name}»?`)) deleteList(activeList.value.id)
}
</script>

<template>
  <div class="wl">
    <div class="wl-top">
      <Dropdown>
        <template #trigger="{ toggle }">
          <button class="btn sm list-name" title="Списки наблюдения" @click="toggle">
            <b>{{ activeList.name }}</b>
            <Icon name="chevron" :size="14" />
          </button>
        </template>
        <template #default="{ close }">
          <button v-for="l in lists.all" :key="l.id" class="menu-item" :class="{ on: l.id === lists.activeId }" @click="(lists.activeId = l.id), close()">
            {{ l.name }} <span class="muted">{{ l.items.length }}</span>
          </button>
          <div class="menu-sep" />
          <button class="menu-item" @click="create(), close()"><Icon name="plus" :size="16" />Новый список…</button>
          <button class="menu-item" @click="rename(), close()"><Icon name="pencil" :size="16" />Переименовать…</button>
          <button v-if="lists.all.length > 1" class="menu-item" @click="remove(), close()"><Icon name="trash" :size="16" />Удалить список</button>
        </template>
      </Dropdown>
      <span class="grow" />
      <button class="btn sm" title="Добавить инструмент (Alt+W — текущий график)" @click="openSearch()"><Icon name="plus" :size="16" /></button>
    </div>
    <div class="wl-list scroll">
      <div
        v-for="r in watchlist"
        :key="symbolKey(r)"
        class="wl-row"
        :class="{ active: sameSymbol(r, activePane.symbol) }"
        role="button"
        tabindex="0"
        @click="setSymbol(r)"
        @keydown.enter="setSymbol(r)"
      >
        <span class="name">
          <b>{{ r.symbol }}</b>
          <span class="tag" :class="r.exchange">{{ EXCHANGE_NAMES[r.exchange] }} {{ MARKET_SHORT[r.market] }}</span>
        </span>
        <span class="num">{{ price(r) }}</span>
        <span class="num" :class="(tickers[symbolKey(r)]?.changePct ?? 0) >= 0 ? 'up' : 'down'">
          {{ fmtPct(tickers[symbolKey(r)]?.changePct) }}
        </span>
        <button class="btn sm rm" title="Убрать из списка" @click.stop="toggleWatch(r)"><Icon name="x" :size="14" /></button>
      </div>
      <p v-if="!watchlist.length" class="empty muted">Список пуст. Нажмите «+» или Alt+W, чтобы добавить текущий график.</p>
    </div>
  </div>
</template>

<style scoped>
.wl {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.wl-top {
  display: flex;
  align-items: center;
  padding: 5px 6px 5px 8px;
  border-bottom: 1px solid var(--border);
  flex: none;
}
.list-name b {
  max-width: 170px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.grow {
  flex: 1;
}
.wl-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto 62px 26px;
  align-items: center;
  column-gap: 8px;
  padding: 0 6px 0 12px;
  height: 44px;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 55%, transparent);
  cursor: pointer;
}
.wl-list {
  flex: 1;
  min-height: 0;
}
.wl-row:hover {
  background: var(--hover);
}
.wl-row.active {
  background: var(--accent-soft);
  box-shadow: inset 2px 0 0 var(--accent);
}
.name {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 3px;
  min-width: 0;
}
.name b {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}
.num {
  text-align: right;
  white-space: nowrap;
}
.rm {
  color: var(--muted);
}
@media (hover: hover) {
  .rm {
    visibility: hidden;
  }
  .wl-row:hover .rm {
    visibility: visible;
  }
}
.empty {
  padding: 20px 14px;
  text-align: center;
}
</style>
