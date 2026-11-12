<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import Icon from './Icon.vue'
import { EXCHANGE_NAMES, MARKET_NAMES, symbolKey } from '../types'
import { app, activePane, setSymbol } from '../stores/app'
import { tickers, useTickers } from '../stores/tickers'
import Dropdown from './Dropdown.vue'
import {
  alerts,
  addAlert,
  removeAlert,
  rearmAlert,
  unreadAlerts,
  waitingAlerts,
  doneAlerts,
  markAllRead,
  clearDone,
  clearAllAlerts,
  rearmDone,
  notifySupported,
  requestNotifications,
  type PriceAlert,
} from '../stores/alerts'
import { fmtPrice, precisionOf } from '../lib/format'

const symbol = computed(() => activePane.value.symbol)
const key = computed(() => symbolKey(symbol.value))
useTickers(() => [symbol.value])

const last = computed(() => tickers[key.value]?.last ?? 0)
const price = ref('')
const input = ref<HTMLInputElement>()
// Alt+A открывает панель и ставит курсор в поле цены
watch(
  () => app.alertFocus,
  () => nextTick(() => input.value?.select()),
  { immediate: app.alertFocus > 0 },
)
const permission = ref(notifySupported ? Notification.permission : 'denied')

// подставляем текущую цену, пока пользователь не начал вводить свою
let touched = false
watch(key, () => {
  touched = false
  price.value = ''
})
watch(
  last,
  (v) => {
    if (!touched && !price.value && v) price.value = fmtPrice(v, precisionOf(key.value, v))
  },
  { immediate: true },
)

const value = computed(() => parseFloat(price.value.replace(',', '.')))
const valid = computed(() => isFinite(value.value) && value.value > 0)

function create() {
  if (!valid.value) return
  addAlert(symbol.value, value.value, last.value || value.value)
  touched = false
  price.value = ''
  setTimeout(() => (permission.value = notifySupported ? Notification.permission : 'denied'), 1500)
}

async function allow() {
  requestNotifications()
  setTimeout(() => (permission.value = notifySupported ? Notification.permission : 'denied'), 1500)
}

// сначала непрочитанные сработавшие, затем ожидающие, затем прочитанные — каждые от новых к старым
const sorted = computed(() => {
  const rank = (a: PriceAlert) => (a.active ? 1 : a.read ? 2 : 0)
  return alerts.slice().sort((a, b) => rank(a) - rank(b) || (b.triggeredAt ?? b.createdAt) - (a.triggeredAt ?? a.createdAt))
})
const lastOf = (a: PriceAlert) => tickers[symbolKey(a.ref)]?.last ?? a.price
function open(a: PriceAlert) {
  if (!a.active) a.read = true
  setSymbol(a.ref)
}
function removeAll() {
  if (confirm(`Удалить все оповещения (${alerts.length})?`)) clearAllAlerts()
}

const fmt = (a: (typeof alerts)[number]) => fmtPrice(a.price, precisionOf(symbolKey(a.ref), a.price))
const time = (ms: number) => new Date(ms).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
</script>

<template>
  <div class="al">
    <form class="al-form" @submit.prevent="create">
      <label class="muted" for="alert-price">Оповестить, когда {{ symbol.symbol }} достигнет</label>
      <div class="al-inputs">
        <input id="alert-price" ref="input" v-model="price" class="field" inputmode="decimal" autocomplete="off" placeholder="Цена" @input="touched = true" />
        <button class="btn primary" type="submit" :disabled="!valid">Создать</button>
      </div>
      <p v-if="notifySupported && permission === 'default'" class="hint">
        <button type="button" class="link" @click="allow">Разрешить уведомления</button>, чтобы получать их, когда вкладка в фоне.
      </p>
      <p v-else-if="permission === 'denied'" class="hint muted">Уведомления браузера выключены — сигнал придёт только в открытом приложении.</p>
    </form>

    <div v-if="alerts.length" class="al-bar">
      <span class="muted">ждут {{ waitingAlerts }} · сработали {{ doneAlerts }}</span>
      <span class="grow" />
      <button v-if="unreadAlerts" class="btn sm" title="Отметить все сработавшие прочитанными" @click="markAllRead"><Icon name="checkAll" :size="16" />Прочитать все</button>
      <Dropdown align="right">
        <template #trigger="{ toggle }">
          <button class="btn sm" title="Действия со всеми оповещениями" @click="toggle"><Icon name="more" :size="16" /></button>
        </template>
        <template #default="{ close }">
          <button class="menu-item" :disabled="!unreadAlerts" @click="markAllRead(), close()"><Icon name="checkAll" :size="16" />Прочитать все</button>
          <button class="menu-item" :disabled="!doneAlerts" @click="rearmDone(lastOf), close()"><Icon name="bell" :size="16" />Включить сработавшие снова</button>
          <button class="menu-item" :disabled="!doneAlerts" @click="clearDone(), close()"><Icon name="trash" :size="16" />Удалить сработавшие</button>
          <div class="menu-sep" />
          <button class="menu-item" @click="removeAll(), close()"><Icon name="trash" :size="16" />Удалить все</button>
        </template>
      </Dropdown>
    </div>

    <div class="al-list scroll">
      <div v-for="a in sorted" :key="a.id" class="al-row" :class="{ done: !a.active, unread: !a.active && !a.read }">
        <button class="al-main" :title="'Открыть ' + a.ref.symbol" @click="open(a)">
          <span>
            <i v-if="!a.active && !a.read" class="new" title="Не прочитано" />
            <b>{{ a.ref.symbol }}</b>
            <span class="tag" :class="a.ref.exchange">{{ EXCHANGE_NAMES[a.ref.exchange] }} · {{ MARKET_NAMES[a.ref.market] }}</span>
          </span>
          <span :class="a.dir === 'up' ? 'up' : 'down'">{{ a.dir === 'up' ? '≥' : '≤' }} {{ fmt(a) }}</span>
          <span class="muted status">{{ a.active ? 'Ждёт' : 'Сработало ' + (a.triggeredAt ? time(a.triggeredAt) : '') }}</span>
        </button>
        <button v-if="!a.active && !a.read" class="btn sm" title="Отметить прочитанным" @click="a.read = true"><Icon name="check" :size="16" /></button>
        <button v-if="!a.active" class="btn sm" title="Включить снова" @click="rearmAlert(a, lastOf(a))"><Icon name="bell" :size="16" /></button>
        <button class="btn sm" title="Удалить" @click="removeAlert(a.id)"><Icon name="trash" :size="16" /></button>
      </div>
      <p v-if="!alerts.length" class="empty muted">
        Оповещений нет. Задайте цену выше или вызовите меню правой кнопкой мыши на графике. Линию оповещения на графике можно тянуть мышью.
      </p>
    </div>
  </div>
</template>

<style scoped>
.al {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.al-form {
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
  flex: none;
}
.al-form label {
  display: block;
  font-size: 12px;
  margin-bottom: 6px;
}
.al-inputs {
  display: flex;
  gap: 8px;
}
.hint {
  margin: 8px 0 0;
  font-size: 12px;
}
.link {
  color: var(--accent);
  text-decoration: underline;
}
.al-list {
  flex: 1;
  min-height: 0;
}
.al-row {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 0 6px 0 0;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 55%, transparent);
}
.al-bar {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px 6px 4px 12px;
  font-size: 12px;
  border-bottom: 1px solid var(--border);
  flex: none;
}
.grow {
  flex: 1;
}
.al-row.done:not(.unread) .al-main {
  opacity: 0.6;
}
.al-row.unread {
  background: color-mix(in srgb, var(--warn) 10%, transparent);
}
.new {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--warn);
  flex: none;
}
.al-main {
  flex: 1;
  min-width: 0;
  display: grid;
  grid-template-columns: 1fr auto;
  row-gap: 3px;
  padding: 8px 6px 8px 12px;
  text-align: left;
}
.al-main:hover {
  background: var(--hover);
}
.al-main > span:first-child {
  display: flex;
  align-items: center;
  gap: 6px;
}
.status {
  grid-column: 1 / -1;
  font-size: 11px;
}
.empty {
  padding: 20px 14px;
  text-align: center;
}
</style>
