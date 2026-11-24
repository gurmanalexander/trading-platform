<script setup lang="ts">
import Icon from './Icon.vue'
import PhoneMenu from './PhoneMenu.vue'
import { app, MOBILE_TABS as TABS } from '../stores/app'
import { unreadAlerts } from '../stores/alerts'
import { donate } from '../lib/donate'
import { t } from '../lib/i18n'
</script>

<template>
  <nav class="bnav" :aria-label="t('Разделы')">
    <button v-for="tab in TABS" :key="tab.id" :class="{ on: app.mobileTab === tab.id }" @click="app.mobileTab = tab.id">
      <span class="ico">
        <Icon :name="tab.icon" :size="20" />
        <i v-if="tab.id === 'alerts' && unreadAlerts" class="badge">{{ unreadAlerts }}</i>
      </span>
      <span>{{ t(tab.label) }}</span>
    </button>
    <!-- настройки и действия нужны в любом разделе, а не только на графике -->
    <PhoneMenu>
      <template #trigger="{ toggle, open }">
        <button :class="{ on: open }" :title="t('Ещё: настройки и действия')" @click="toggle">
          <span class="ico">
            <Icon name="more" :size="20" />
            <!-- изредка (см. lib/donate) у «Ещё» на пару секунд появляется сердечко: там пункт «Поддержать проект» -->
            <i v-if="donate.pulse" class="heart"><Icon name="heart" :size="11" /></i>
          </span>
          <span>{{ t('Ещё') }}</span>
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
.heart {
  position: absolute;
  top: -6px;
  left: 15px;
  display: grid;
  color: #f0566b;
  animation: heartbeat 1.3s ease-in-out 2;
}
.heart :deep(svg) {
  fill: #f0566b;
}
@keyframes heartbeat {
  0%,
  28%,
  70%,
  100% {
    transform: scale(1);
  }
  14% {
    transform: scale(1.4);
  }
  42% {
    transform: scale(1.25);
  }
}
@media (prefers-reduced-motion: reduce) {
  .heart {
    animation: none;
  }
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
