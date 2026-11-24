<script setup lang="ts">
import Screener from './Screener.vue'
import Watchlist from './Watchlist.vue'
import AlertsPanel from './AlertsPanel.vue'
import ChecklistPanel from './ChecklistPanel.vue'
import { app, type PanelId } from '../stores/app'
import { unreadAlerts } from '../stores/alerts'
import { t } from '../lib/i18n'

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
      <button v-for="it in TABS" :key="it.id" role="tab" :aria-selected="tab === it.id" :class="{ on: tab === it.id }" @click="app.panel = it.id">
        {{ t(it.label) }}
        <i v-if="it.id === 'alerts' && unreadAlerts" class="badge" :title="t('Непрочитанные оповещения')">{{ unreadAlerts }}</i>
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
.badge {
  display: inline-block;
  min-width: 16px;
  height: 16px;
  margin-left: 2px;
  padding: 0 4px;
  border-radius: 8px;
  background: var(--warn);
  color: #111;
  font: 600 10px/16px var(--font);
  text-align: center;
  vertical-align: 1px;
}
.side-tabs button:hover {
  color: var(--text);
}
.side-tabs button.on {
  color: var(--text);
  border-bottom-color: var(--sel-border);
}
.side-body {
  flex: 1;
  min-height: 0;
}
</style>
