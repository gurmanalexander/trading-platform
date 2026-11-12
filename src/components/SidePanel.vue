<script setup lang="ts">
import Screener from './Screener.vue'
import Watchlist from './Watchlist.vue'
import AlertsPanel from './AlertsPanel.vue'
import ChecklistPanel from './ChecklistPanel.vue'
import { app, type PanelId } from '../stores/app'

defineProps<{ tab: PanelId; tabs: boolean }>()

const TABS: { id: PanelId; label: string }[] = [
  { id: 'screener', label: 'Отбор' },
  { id: 'watchlist', label: 'Список' },
  { id: 'checklist', label: 'Чеклист' },
  { id: 'alerts', label: 'Оповещения' },
]
</script>

<template>
  <aside class="side">
    <div v-if="tabs" class="side-tabs" role="tablist">
      <button v-for="t in TABS" :key="t.id" role="tab" :aria-selected="tab === t.id" :class="{ on: tab === t.id }" @click="app.panel = t.id">
        {{ t.label }}
      </button>
    </div>
    <div class="side-body">
      <Screener v-if="tab === 'screener'" />
      <Watchlist v-else-if="tab === 'watchlist'" />
      <ChecklistPanel v-else-if="tab === 'checklist'" />
      <AlertsPanel v-else />
    </div>
  </aside>
</template>

<style scoped>
.side {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  background: var(--panel);
}
.side-tabs {
  display: flex;
  flex: none;
  border-bottom: 1px solid var(--border);
}
.side-tabs button {
  /* ширина по подписи: четыре вкладки равной ширины в узкой панели не помещаются */
  flex: 1 1 auto;
  padding: 0 6px;
  white-space: nowrap;
  height: 38px;
  color: var(--muted);
  border-bottom: 2px solid transparent;
}
.side-tabs button:hover {
  color: var(--text);
}
.side-tabs button.on {
  color: var(--text);
  border-bottom-color: var(--accent);
}
.side-body {
  flex: 1;
  min-height: 0;
}
</style>
