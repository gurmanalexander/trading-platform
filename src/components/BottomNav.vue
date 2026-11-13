<script setup lang="ts">
import Icon from './Icon.vue'
import PhoneMenu from './PhoneMenu.vue'
import { app, MOBILE_TABS as TABS } from '../stores/app'
import { unreadAlerts } from '../stores/alerts'
</script>

<template>
  <nav class="bnav" aria-label="Разделы">
    <button v-for="t in TABS" :key="t.id" :class="{ on: app.mobileTab === t.id }" @click="app.mobileTab = t.id">
      <span class="ico">
        <Icon :name="t.icon" :size="20" />
        <i v-if="t.id === 'alerts' && unreadAlerts" class="badge">{{ unreadAlerts }}</i>
      </span>
      <span>{{ t.label }}</span>
    </button>
    <!-- настройки и действия нужны в любом разделе, а не только на графике -->
    <PhoneMenu>
      <template #trigger="{ toggle, open }">
        <button :class="{ on: open }" title="Ещё: настройки и действия" @click="toggle">
          <span class="ico"><Icon name="more" :size="20" /></span>
          <span>Ещё</span>
        </button>
      </template>
    </PhoneMenu>
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
.bnav :deep(.dropdown) {
  display: flex;
  flex: 0.8 1 0;
  min-width: 0;
}
.bnav button {
  flex: 1 1 0;
  min-width: 0;
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
