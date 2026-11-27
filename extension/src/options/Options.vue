<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import Icon from '../../../src/components/Icon.vue'
import { EXCHANGES, type BridgeAccount } from '../../../journal/src/core/protocol'
import type { ExchangeId } from '../../../journal/src/core/types'
import { i18n, locale, t } from '../../../journal/src/lib/i18n'
import { HOSTS, SITES, VERSION } from '../config'
import { binance } from '../exchanges/binance'
import { bybit } from '../exchanges/bybit'
import { BridgeError } from '../exchanges/http'
import { KeyRejected } from '../exchanges/types'
import { addAccount, hasKey, importSecret, listAccounts, makeCtx, removeAccount, renameAccount } from '../vault'

const accounts = ref<BridgeAccount[]>([])
const form = reactive({ exchange: 'binance' as ExchangeId, label: '', apiKey: '', secret: '' })
const busy = ref(false)
const error = ref('')
const added = ref('')
const confirmId = ref('')
const showSecret = ref(false)

const journalUrl = computed(() => SITES.find((s) => s.startsWith('https://')) ?? '')

const load = async () => (accounts.value = await listAccounts())
onMounted(load)

/** Права ключа словами — чтобы было понятно, что именно нужно выключить */
const FLAGS: Record<string, () => string> = {
  enableWithdrawals: () => t('вывод средств'),
  enableInternalTransfer: () => t('внутренние переводы'),
  permitsUniversalTransfer: () => t('переводы между счетами'),
  enableSpotAndMarginTrading: () => t('торговля на споте и марже'),
  enableMargin: () => t('маржинальные займы и переводы'),
  enableFutures: () => t('торговля фьючерсами'),
  enableVanillaOptions: () => t('торговля опционами'),
  enablePortfolioMarginTrading: () => t('портфельная маржа'),
  enableFixApiTrade: () => t('торговля через FIX'),
  ReadWrite: () => t('чтение и запись'),
}

function explain(e: unknown): string {
  if (e instanceof KeyRejected) {
    const list = e.flags.map((f) => FLAGS[f]?.() ?? f).join(', ')
    return t('У этого ключа есть права кроме чтения: {list}. Мост принимает только ключи «только чтение» — создайте на бирже новый ключ без этих прав.', { list })
  }
  if (e instanceof BridgeError) {
    if (e.code === 'auth') return t('Биржа не приняла ключ: проверьте, что ключ и секрет скопированы целиком, ключ не удалён и не привязан к другому IP-адресу.') + ` (${e.message})`
    if (e.code === 'geo') return t('Биржа недоступна из вашего региона или сети.') + ` (${e.message})`
    if (e.code === 'rate') return t('Биржа просит подождать: слишком много запросов. Повторите через минуту.')
    if (e.code === 'network') return t('Нет связи с биржей. Проверьте интернет и повторите.')
    return t('Биржа ответила ошибкой: {msg}', { msg: e.message })
  }
  return String((e as Error)?.message ?? e)
}

async function submit() {
  error.value = ''
  added.value = ''
  const apiKey = form.apiKey.trim()
  const secret = form.secret.trim()
  if (!apiKey || !secret) return (error.value = t('Вставьте ключ и секрет.'))
  busy.value = true
  try {
    if (await hasKey(form.exchange, apiKey)) throw new Error(t('Этот ключ уже добавлен.'))
    const key = await importSecret(secret)
    const client = form.exchange === 'binance' ? binance(HOSTS.binance) : bybit(HOSTS.bybit)
    const { expiresAt } = await client.verify(makeCtx(apiKey, key))
    const name = EXCHANGES.find((x) => x.id === form.exchange)!.name
    const acc = await addAccount(form.exchange, form.label.trim() || name, apiKey, key, expiresAt)
    form.apiKey = form.secret = form.label = ''
    showSecret.value = false
    added.value = acc.label
    await load()
  } catch (e) {
    error.value = explain(e)
  } finally {
    busy.value = false
  }
}

async function remove(id: string) {
  await removeAccount(id)
  confirmId.value = ''
  await load()
}

async function rename(a: BridgeAccount, e: Event) {
  const label = (e.target as HTMLInputElement).value.trim()
  if (label && label !== a.label) {
    await renameAccount(a.id, label)
    await load()
  }
}

const fmtDate = (ms: number) => new Date(ms).toLocaleDateString(locale(), { day: 'numeric', month: 'short', year: 'numeric' })
const daysLeft = (ms: number) => Math.ceil((ms - Date.now()) / 86_400_000)

const steps = computed(() =>
  form.exchange === 'binance'
    ? [
        t('Откройте на Binance: профиль → Управление API → Создать API, тип «Сгенерированный системой».'),
        t('Оставьте включённым только «Разрешить чтение». Торговлю, фьючерсы, вывод и переводы не включайте.'),
        t('Ограничение по IP не ставьте: запросы идут с вашего компьютера, а его адрес меняется.'),
        t('Скопируйте API Key и Secret Key сюда. Секрет биржа показывает один раз.'),
      ]
    : [
        t('Откройте на Bybit: профиль → API → Создать новый ключ, «Сгенерированные системой ключи API».'),
        t('Выберите «Только чтение». Нужны разделы «Контракты» (ордера и позиции) и «Единый торговый счёт».'),
        t('Без привязки к IP ключ Bybit действует 3 месяца — мост напомнит, когда срок подойдёт.'),
        t('Скопируйте API Key и API Secret сюда. Секрет биржа показывает один раз.'),
      ],
)
</script>

<template>
  <div class="page scroll">
    <header class="top">
      <img class="logo" src="/icon-48.png" alt="" width="32" height="32" />
      <div class="top-title">
        <b>tvx bridge</b>
        <span class="muted">v{{ VERSION }}</span>
      </div>
      <span class="grow" />
      <button class="btn sm" @click="i18n.lang = i18n.lang === 'ru' ? 'en' : 'ru'">{{ i18n.lang === 'ru' ? 'EN' : 'RU' }}</button>
      <a v-if="journalUrl" class="btn primary" :href="journalUrl" target="_blank" rel="noopener">{{ t('Открыть журнал') }} <Icon name="external" :size="16" /></a>
    </header>

    <section class="facts">
      <div class="fact">
        <Icon name="lock" />
        <div>
          <b>{{ t('Ключи не покидают расширение') }}</b>
          <p>{{ t('Секрет превращается в не извлекаемый ключ подписи: им можно подписать запрос, но прочитать обратно нельзя. Сайт журнала ключей не видит.') }}</p>
        </div>
      </div>
      <div class="fact">
        <Icon name="eye" />
        <div>
          <b>{{ t('Только чтение') }}</b>
          <p>{{ t('Мост проверяет права ключа и не примет ключ, которым можно торговать или выводить средства. Кода для ордеров в расширении нет.') }}</p>
        </div>
      </div>
      <div class="fact">
        <Icon name="wifi" />
        <div>
          <b>{{ t('Только биржи') }}</b>
          <p>{{ t('Расширению разрешены соединения лишь с адресами Binance и Bybit. Никаких сторонних серверов и аналитики.') }}</p>
        </div>
      </div>
    </section>

    <section class="card">
      <h2>{{ t('Счета') }}</h2>
      <p v-if="!accounts.length" class="muted empty">{{ t('Пока нет ни одного счёта. Добавьте ключ только для чтения — и журнал покажет ваши сделки.') }}</p>
      <ul v-else class="accounts">
        <li v-for="a in accounts" :key="a.id" class="acct">
          <span class="tag" :class="a.exchange">{{ EXCHANGES.find((x) => x.id === a.exchange)?.name }}</span>
          <input class="field name" :value="a.label" :aria-label="t('Название счёта')" maxlength="40" @change="rename(a, $event)" @keydown.enter="($event.target as HTMLInputElement).blur()" />
          <span class="muted hint">••••{{ a.hint }}</span>
          <span v-if="a.expiresAt" class="exp" :class="{ soon: daysLeft(a.expiresAt) <= 14 }" :title="fmtDate(a.expiresAt)">
            <Icon name="clock" :size="14" /> {{ t('ещё {n} дн.', { n: Math.max(0, daysLeft(a.expiresAt)) }) }}
          </span>
          <span class="grow" />
          <template v-if="confirmId === a.id">
            <button class="btn sm danger" @click="remove(a.id)">{{ t('Удалить') }}</button>
            <button class="btn sm" @click="confirmId = ''">{{ t('Отмена') }}</button>
          </template>
          <button v-else class="btn sm" :aria-label="t('Удалить счёт')" :title="t('Удалить счёт')" @click="confirmId = a.id"><Icon name="trash" :size="16" /></button>
        </li>
      </ul>
      <p v-if="added" class="ok"><Icon name="check" :size="16" /> {{ t('Счёт «{name}» добавлен. Вернитесь в журнал — сделки загрузятся сами.', { name: added }) }}</p>
    </section>

    <section class="card">
      <h2>{{ t('Добавить счёт') }}</h2>
      <form class="form" @submit.prevent="submit">
        <div class="seg" role="radiogroup" :aria-label="t('Биржа')">
          <button v-for="x in EXCHANGES" :key="x.id" type="button" class="seg-btn" :class="{ on: form.exchange === x.id }" role="radio" :aria-checked="form.exchange === x.id" @click="form.exchange = x.id">
            <b>{{ x.name }}</b>
            <span class="muted">{{ x.markets }}</span>
          </button>
        </div>

        <ol class="steps">
          <li v-for="(s, i) in steps" :key="i">{{ s }}</li>
        </ol>

        <label class="row">
          <span>{{ t('Название') }}</span>
          <input v-model="form.label" class="field" maxlength="40" :placeholder="t('например, «Основной»')" autocomplete="off" />
        </label>
        <label class="row">
          <span>API Key</span>
          <input v-model="form.apiKey" class="field mono" autocomplete="off" spellcheck="false" />
        </label>
        <label class="row">
          <span>API Secret</span>
          <span class="secret">
            <input v-model="form.secret" class="field mono" :type="showSecret ? 'text' : 'password'" autocomplete="off" spellcheck="false" />
            <button type="button" class="btn sm" :aria-label="t('Показать секрет')" @click="showSecret = !showSecret"><Icon :name="showSecret ? 'eyeOff' : 'eye'" :size="16" /></button>
          </span>
        </label>

        <p v-if="error" class="err" role="alert">{{ error }}</p>
        <button class="btn primary submit" :disabled="busy">
          <span v-if="busy" class="spinner sm" />
          {{ busy ? t('Проверяю ключ на бирже…') : t('Проверить и добавить') }}
        </button>
      </form>
    </section>

    <footer class="muted foot">
      {{ t('Удалить ключ можно в любой момент здесь и на самой бирже. Расширение — открытый код:') }}
      <a href="https://github.com/gurmanalexander/trading-platform" target="_blank" rel="noopener">github.com/gurmanalexander/trading-platform</a>
    </footer>
  </div>
</template>

<style>
body {
  overflow: auto;
  user-select: text;
  -webkit-user-select: text;
}
.page {
  max-width: 760px;
  margin: 0 auto;
  padding: 20px 16px 48px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  font-size: 14px;
  line-height: 1.45;
}
.top {
  display: flex;
  align-items: center;
  gap: 10px;
}
.top-title {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 18px;
}
.top-title .muted {
  font-size: 12px;
}
.logo {
  border-radius: 8px;
}
.grow {
  flex: 1;
}
a.btn {
  text-decoration: none;
}
.facts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: 12px;
}
.fact {
  display: flex;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--panel);
}
.fact .icon {
  color: var(--up);
  margin-top: 1px;
}
.fact p {
  margin: 4px 0 0;
  color: var(--muted);
  font-size: 12.5px;
}
.card {
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--panel);
  padding: 16px;
}
.card h2 {
  margin: 0 0 12px;
  font-size: 15px;
}
.empty {
  margin: 0;
}
.accounts {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.acct {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 8px;
  border-radius: 8px;
  background: var(--panel-2);
  flex-wrap: wrap;
}
.acct .tag {
  font-size: 11px;
  padding: 4px 6px;
  background: var(--bg);
}
.acct .name {
  width: 200px;
  background: transparent;
  border-color: transparent;
  font-weight: 600;
}
.acct .name:hover,
.acct .name:focus {
  border-color: var(--border);
  background: var(--bg);
}
.hint {
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 12px;
}
.exp {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--muted);
}
.exp.soon {
  color: var(--warn);
}
.btn.danger {
  background: var(--down);
  color: #fff;
  padding: 0 10px;
}
.ok {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 12px 0 0;
  color: var(--up);
}
.form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.seg {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.seg-btn {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  text-align: left;
}
.seg-btn .muted {
  font-size: 12px;
}
.seg-btn.on {
  border-color: var(--accent);
  background: var(--accent-soft);
}
.steps {
  margin: 0;
  padding: 10px 12px 10px 30px;
  border-radius: 10px;
  background: var(--panel-2);
  color: var(--muted);
  font-size: 13px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.row {
  display: grid;
  grid-template-columns: 110px 1fr;
  align-items: center;
  gap: 10px;
}
.secret {
  display: flex;
  gap: 6px;
  align-items: center;
}
.mono {
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 13px;
}
.err {
  margin: 0;
  padding: 10px 12px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--down) 14%, transparent);
  color: var(--text);
  border: 1px solid color-mix(in srgb, var(--down) 45%, transparent);
}
.submit {
  align-self: flex-start;
  height: 38px;
}
.spinner.sm {
  width: 14px;
  height: 14px;
  border-top-color: #fff;
}
.foot {
  font-size: 12.5px;
}
.foot a {
  color: var(--accent);
}
@media (max-width: 520px) {
  .row {
    grid-template-columns: 1fr;
    gap: 4px;
  }
}
</style>
