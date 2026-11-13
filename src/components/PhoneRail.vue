<script setup lang="ts">
import Icon from './Icon.vue'
import Dropdown from './Dropdown.vue'
import PhoneMenu from './PhoneMenu.vue'
import TfDropdown from './TfDropdown.vue'
import { app, activeIndex, paneCount, MOBILE_TABS } from '../stores/app'
import { unreadAlerts } from '../stores/alerts'
import { getTf } from '../lib/timeframes'

// Телефон набок: высота на вес золота, поэтому верхняя панель и нижняя навигация
// собраны в одну узкую колонку слева — график занимает всю высоту экрана.
// Монета и её поиск — в подписи графика (нажатие на название).
</script>

<template>
  <nav class="rail" aria-label="Разделы и управление графиком">
    <template v-if="app.mobileTab === 'chart'">
      <TfDropdown label side />
      <Dropdown v-if="paneCount > 1" side>
        <template #trigger="{ toggle }">
          <button class="btn" :class="{ on: app.phoneStack }" title="Окна раскладки" @click="toggle"><Icon name="windows" /></button>
        </template>
        <template #default="{ close }">
          <button
            v-for="i in paneCount"
            :key="i"
            class="menu-item"
            :class="{ on: !app.phoneStack && activeIndex === i - 1 }"
            @click="(app.active = i - 1), (app.phoneStack = false), close()"
          >
            Окно {{ i }} · {{ getTf(app.panes[i - 1].tf).label }}
          </button>
          <div class="menu-sep" />
          <button class="menu-item" :class="{ on: app.phoneStack }" @click="(app.phoneStack = !app.phoneStack), close()">
            <Icon name="windows" :size="16" />Все окна сразу
          </button>
        </template>
      </Dropdown>
      <button class="btn" :class="{ on: app.drawBarOpen }" title="Рисование" @click="app.drawBarOpen = !app.drawBarOpen"><Icon name="pencil" /></button>
    </template>
    <span class="grow" />
    <button
      v-for="t in MOBILE_TABS"
      :key="t.id"
      class="btn tab"
      :class="{ on: app.mobileTab === t.id }"
      :title="t.label"
      :aria-label="t.label"
      @click="app.mobileTab = t.id"
    >
      <Icon :name="t.icon" />
      <i v-if="t.id === 'alerts' && unreadAlerts" class="badge">{{ unreadAlerts }}</i>
    </button>
    <!-- настройки и действия нужны в любом разделе -->
    <PhoneMenu side />
  </nav>
</template>

<style scoped>
.rail {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  width: 44px;
  padding: 3px 0 calc(3px + env(safe-area-inset-bottom));
  background: var(--panel);
  border-right: 1px solid var(--border);
  flex: none;
  overflow-y: auto;
  scrollbar-width: none;
}
.rail::-webkit-scrollbar {
  display: none;
}
.rail .btn,
.rail :deep(.btn) {
  width: 38px;
  min-width: 0;
  padding: 0;
  font-size: 12.5px;
}
.grow {
  flex: 1;
  min-height: 6px;
}
.tab {
  position: relative;
  color: var(--muted);
}
.badge {
  position: absolute;
  top: 1px;
  right: 0;
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
