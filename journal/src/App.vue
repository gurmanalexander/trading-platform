<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import Icon from '../../src/components/Icon.vue'
import { load, save } from '../../src/lib/storage'
import { onWake } from '../../src/lib/wake'
import SyncDialog from './components/SyncDialog.vue'
import TradeDrawer from './components/TradeDrawer.vue'
import { EXCHANGES } from './core/protocol'
import { i18n, t } from './lib/i18n'
import { init, prefs, refresh, setDemo, state } from './store/journal'
import { cloud, startSync } from './store/sync'
import { PERIODS, tvxHome, ui, type Tab } from './store/view'
import Accounts from './views/Accounts.vue'
import CalendarView from './views/CalendarView.vue'
import Overview from './views/Overview.vue'
import Trades from './views/Trades.vue'

const TABS: { id: Tab; label: () => string; icon: string }[] = [
  { id: 'overview', label: () => t('Обзор'), icon: 'dashboard' },
  { id: 'trades', label: () => t('Сделки'), icon: 'list' },
  { id: 'calendar', label: () => t('Календарь'), icon: 'columns' },
  { id: 'accounts', label: () => t('Счета'), icon: 'lock' },
]

// ---------- тема: по умолчанию как в tvx, переключается отдельно ----------

type Theme = 'dark' | 'light'
const systemTheme = (): Theme => (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
const savedTheme = load<string>('j:theme', '') || load<{ themePref?: string }>('app', {}).themePref
const theme = ref<Theme>(savedTheme === 'dark' || savedTheme === 'light' ? savedTheme : systemTheme())
watch(
  theme,
  (v) => {
    document.documentElement.dataset.theme = v
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', v === 'dark' ? '#0f1217' : '#ffffff')
  },
  { immediate: true },
)
function toggleTheme() {
  theme.value = theme.value === 'dark' ? 'light' : 'dark'
  save('j:theme', theme.value)
}

// ---------- раздел в адресе ----------

function fromHash() {
  const h = location.hash
  if (h.startsWith('#sync=')) {
    ui.syncCode = h.slice(6)
    ui.syncOpen = true
    history.replaceState(null, '', location.pathname)
    return
  }
  const id = h.replace(/^#\/?/, '')
  if (TABS.some((x) => x.id === id)) ui.tab = id as Tab
}
watch(
  () => ui.tab,
  (tab) => {
    const want = tab === 'overview' ? location.pathname : '#/' + tab
    if ((location.hash || location.pathname) !== want) history.replaceState(null, '', want)
    document.querySelector('.main')?.scrollTo({ top: 0 })
  },
)

// ---------- обновление ----------

const busy = computed(() => Object.values(state.jobs).some((j) => j.busy))
const canRefresh = computed(() => state.bridge === 'ready' && state.accounts.some((a) => a.local))
const failed = computed(() => state.accounts.some((a) => state.jobs[a.id]?.error))

onMounted(async () => {
  fromHash()
  window.addEventListener('hashchange', fromHash)
  await init()
  startSync()
  // пока журнал открыт, счета обновляются сами: при возврате на вкладку и раз в пять минут
  onWake((away) => {
    ui.now = Date.now()
    if (away > 60_000) refresh()
  })
  setInterval(() => {
    ui.now = Date.now()
    if (document.visibilityState === 'visible') refresh()
  }, 5 * 60_000)
})

const empty = computed(() => state.ready && !state.accounts.length)
const dataTab = computed(() => ui.tab !== 'accounts')

function toggleAccount(id: string) {
  const set = new Set(prefs.accounts)
  if (set.has(id)) set.delete(id)
  else set.add(id)
  // все отмечены — то же, что ни одного: показываем всё
  prefs.accounts = set.size === state.accounts.length ? [] : [...set]
}
</script>

<template>
  <div class="app">
    <header class="top">
      <a class="brand" :href="tvxHome()" :title="t('Открыть терминал tvx')">
        <img src="/icon.svg" width="26" height="26" alt="" />
        <span class="brand-name">tvx <span class="muted">{{ t('журнал') }}</span></span>
      </a>
      <nav class="tabs" :aria-label="t('Разделы')">
        <button v-for="x in TABS" :key="x.id" class="tab" :class="{ on: ui.tab === x.id }" @click="ui.tab = x.id">
          <Icon :name="x.icon" :size="18" /><span>{{ x.label() }}</span>
          <i v-if="x.id === 'accounts' && failed" class="dot-warn" />
        </button>
      </nav>
      <span class="grow" />
      <button v-if="canRefresh" class="btn" :disabled="busy" :title="t('Обновить с бирж')" :aria-label="t('Обновить с бирж')" @click="refresh()">
        <Icon name="refresh" :size="18" :class="{ spin: busy }" />
      </button>
      <button class="btn" :title="t('Синхронизация устройств')" :aria-label="t('Синхронизация устройств')" @click="ui.syncOpen = true">
        <Icon :name="cloud.code && cloud.online ? 'cloud' : 'cloudOff'" :size="18" :class="{ faint: !cloud.code }" />
      </button>
      <button class="btn" :title="t('Тёмная или светлая тема')" :aria-label="t('Тёмная или светлая тема')" @click="toggleTheme"><Icon :name="theme === 'dark' ? 'sun' : 'moon'" :size="18" /></button>
      <button class="btn lang" :aria-label="t('Язык')" @click="i18n.lang = i18n.lang === 'ru' ? 'en' : 'ru'">{{ i18n.lang === 'ru' ? 'EN' : 'RU' }}</button>
      <a class="btn to-tvx" :href="tvxHome()"><Icon name="chart" :size="18" /><span>{{ t('Графики') }}</span></a>
    </header>

    <div v-if="dataTab && !empty" class="filters">
      <div class="segs periods" role="group" :aria-label="t('Период')">
        <button v-for="p in PERIODS" :key="p.id" class="sg" :class="{ on: prefs.period === p.id }" @click="prefs.period = p.id">{{ p.label() }}</button>
      </div>
      <div v-if="state.accounts.length > 1" class="acct-chips" role="group" :aria-label="t('Счета')">
        <button v-for="a in state.accounts" :key="a.id" class="achip" :class="{ on: !prefs.accounts.length || prefs.accounts.includes(a.id) }" :aria-pressed="!prefs.accounts.length || prefs.accounts.includes(a.id)" @click="toggleAccount(a.id)">
          <i class="ex" :class="a.exchange" :title="EXCHANGES.find((x) => x.id === a.exchange)?.name" />{{ a.label }}
        </button>
      </div>
    </div>

    <div v-if="prefs.demo && dataTab" class="demo-bar">
      <Icon name="info" :size="16" />
      <span>{{ t('Это демо-данные, а не ваши сделки.') }}</span>
      <button class="linkish" @click="ui.tab = 'accounts'">{{ t('Подключить свою биржу') }}</button>
      <button class="linkish" @click="setDemo(false)">{{ t('Убрать демо') }}</button>
    </div>

    <main class="main scroll">
      <div class="wrap">
        <div v-if="!state.ready" class="loading"><span class="spinner" /></div>
        <section v-else-if="empty && dataTab" class="welcome card">
          <img src="/icon.svg" width="56" height="56" alt="" />
          <h1>{{ t('Журнал сделок без сервера и регистрации') }}</h1>
          <p class="muted">
            {{ t('Подключите Binance или Bybit ключом «только чтение» — журнал сам соберёт сделки и покажет результат, просадку, комиссии, лучшие монеты и часы. Ключи остаются на вашем компьютере.') }}
          </p>
          <div class="welcome-btns">
            <button class="btn primary big" @click="ui.tab = 'accounts'"><Icon name="lock" :size="18" /> {{ t('Подключить биржу') }}</button>
            <button class="btn bordered big" @click="setDemo(true)"><Icon name="play" :size="18" /> {{ t('Посмотреть на демо-данных') }}</button>
          </div>
          <button class="linkish muted" @click="ui.syncOpen = true">{{ t('Уже пользуетесь на другом устройстве? Подключите синхронизацию') }}</button>
        </section>
        <template v-else>
          <Overview v-if="ui.tab === 'overview'" />
          <Trades v-else-if="ui.tab === 'trades'" />
          <CalendarView v-else-if="ui.tab === 'calendar'" />
          <Accounts v-else />
        </template>
      </div>
    </main>

    <nav class="bottom" :aria-label="t('Разделы')">
      <button v-for="x in TABS" :key="x.id" class="btab" :class="{ on: ui.tab === x.id }" @click="ui.tab = x.id">
        <Icon :name="x.icon" :size="22" /><span>{{ x.label() }}</span>
        <i v-if="x.id === 'accounts' && failed" class="dot-warn" />
      </button>
    </nav>

    <TradeDrawer />
    <SyncDialog v-if="ui.syncOpen" />
  </div>
</template>

<style>
.app {
  height: 100%;
  display: flex;
  flex-direction: column;
}
.top {
  flex: none;
  display: flex;
  align-items: center;
  gap: 4px;
  height: 50px;
  padding: 0 10px;
  padding-top: env(safe-area-inset-top);
  box-sizing: content-box;
  border-bottom: 1px solid var(--border);
  background: var(--panel);
}
.brand {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-right: 14px;
  color: var(--text);
  text-decoration: none;
  font-weight: 650;
  font-size: 15px;
}
.brand img {
  border-radius: 6px;
}
.brand .muted {
  font-weight: 500;
}
.tabs {
  display: flex;
  gap: 2px;
}
.tab {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 34px;
  padding: 0 11px;
  border-radius: 7px;
  color: var(--muted);
  white-space: nowrap;
}
.tab:hover {
  color: var(--text);
  background: var(--hover);
}
.tab.on {
  color: var(--sel);
  background: var(--sel-bg);
}
.dot-warn {
  position: absolute;
  top: 5px;
  right: 5px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--warn);
}
.grow {
  flex: 1;
}
.lang {
  font-size: 12px;
  font-weight: 600;
  color: var(--muted);
}
.to-tvx {
  margin-left: 4px;
  padding: 0 11px;
  border: 1px solid var(--border);
  text-decoration: none;
}
.faint {
  opacity: 0.5;
}
.filters {
  flex: none;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  overflow-x: auto;
  scrollbar-width: none;
}
.filters::-webkit-scrollbar {
  display: none;
}
.periods {
  flex: none;
}
.acct-chips {
  display: flex;
  gap: 6px;
  flex: none;
}
.achip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: calc(var(--ctl) - 2px);
  padding: 0 10px;
  border-radius: 6px;
  border: 1px solid var(--border);
  color: var(--muted);
  white-space: nowrap;
  opacity: 0.6;
}
.achip.on {
  color: var(--text);
  opacity: 1;
  background: var(--panel);
}
.ex {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--muted);
}
.ex.binance {
  background: #d9a514;
}
.ex.bybit {
  background: #f08a3c;
}
.demo-bar {
  flex: none;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 12px;
  font-size: 12.5px;
  background: color-mix(in srgb, var(--warn) 13%, transparent);
  border-bottom: 1px solid color-mix(in srgb, var(--warn) 35%, transparent);
  flex-wrap: wrap;
}
.demo-bar .icon {
  color: var(--warn);
}
.demo-bar .linkish {
  text-decoration: underline;
}
.main {
  flex: 1;
  min-height: 0;
}
.wrap {
  max-width: 1240px;
  margin: 0 auto;
  padding: 12px;
}
.loading {
  display: grid;
  place-items: center;
  padding: 80px 0;
}
.welcome {
  max-width: 620px;
  margin: 6vh auto 0;
  padding: 32px 28px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  text-align: center;
}
.welcome img {
  border-radius: 13px;
}
.welcome h1 {
  margin: 0;
  font-size: 22px;
  letter-spacing: -0.01em;
  text-wrap: balance;
}
.welcome p {
  margin: 0;
  line-height: 1.5;
  font-size: 14px;
}
.welcome-btns {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: center;
  margin-top: 6px;
}
.big {
  height: 42px;
  padding: 0 16px;
}
.btn.bordered {
  border: 1px solid var(--border);
}
.bottom {
  display: none;
}
@media (max-width: 899px) {
  .tabs,
  .to-tvx span {
    display: none;
  }
  .to-tvx {
    border: 0;
    padding: 0 8px;
    margin: 0;
  }
  .brand {
    margin-right: 4px;
  }
  .wrap {
    padding: 8px;
  }
  .bottom {
    flex: none;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    border-top: 1px solid var(--border);
    background: var(--panel);
    padding-bottom: env(safe-area-inset-bottom);
  }
  .btab {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 7px 0 6px;
    color: var(--muted);
    font-size: 11px;
  }
  .btab.on {
    color: var(--sel);
  }
  .btab .dot-warn {
    right: calc(50% - 16px);
  }
  .welcome {
    margin-top: 2vh;
    padding: 24px 18px;
  }
}
</style>
