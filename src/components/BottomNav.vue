<script setup lang="ts">
import Icon from './Icon.vue'
import { app, type MobileTab } from '../stores/app'
import { alerts } from '../stores/alerts'
import { computed } from 'vue'

const TABS: { id: MobileTab; label: string; icon: string }[] = [
  { id: 'chart', label: 'График', icon: 'chart' },
  { id: 'screener', label: 'Отбор', icon: 'filter' },
  { id: 'watchlist', label: 'Список', icon: 'list' },
  { id: 'alerts', label: 'Оповещения', icon: 'bell' },
]
const activeAlerts = computed(() => alerts.filter((a) => a.active).length)
</script>

<template>
  <nav class="bnav" aria-label="Разделы">
    <button v-for="t in TABS" :key="t.id" :class="{ on: app.mobileTab === t.id }" @click="app.mobileTab = t.id">
      <span class="ico">
        <Icon :name="t.icon" :size="20" />
        <i v-if="t.id === 'alerts' && activeAlerts" class="badge">{{ activeAlerts }}</i>
      </span>
      <span>{{ t.label }}</span>
    </button>
  </nav>
</template>

<style scoped>
.bnav {
  display: flex;
  background: var(--panel);
  border-top: 1px solid var(--border);
  padding-bottom: env(safe-area-inset-bottom);
  flex: none;
}
.bnav button {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  height: 50px;
  font-size: 10.5px;
  color: var(--muted);
}
.bnav button.on {
  color: var(--accent);
}
.ico {
  position: relative;
}
.badge {
  position: absolute;
  top: -5px;
  left: 14px;
  min-width: 15px;
  height: 15px;
  padding: 0 4px;
  border-radius: 8px;
  background: var(--warn);
  color: #111;
  font: 600 10px/15px var(--font);
  text-align: center;
}
</style>
