<script setup lang="ts">
import { ref } from 'vue'
import Icon from '../../../src/components/Icon.vue'
import { openBridgeOptions } from '../bridge/client'
import { EXCHANGES } from '../core/protocol'
import { explainError } from '../lib/errors'
import { fmtAgo, fmtDate } from '../lib/format'
import { plural, t } from '../lib/i18n'
import { detectBridge, prefs, refresh, removeAccount, setDemo, state, trades } from '../store/journal'
import { cloud } from '../store/sync'
import { ui } from '../store/view'

const confirmId = ref('')
const checking = ref(false)

async function recheck() {
  checking.value = true
  await detectBridge()
  checking.value = false
}
const openOptions = () => openBridgeOptions().catch(() => recheck())
const reload = () => location.reload()

const daysLeft = (ms: number) => Math.ceil((ms - Date.now()) / 86_400_000)
const DEPTHS = [90, 180, 365, 730]

/** Для какого браузера показывать установку: по умолчанию — для того, в котором открыт журнал */
const ua = navigator.userAgent
const browser = ref<'chromium' | 'firefox' | 'safari'>(/Firefox\//.test(ua) ? 'firefox' : /Safari\//.test(ua) && !/Chrome|Chromium|Edg|OPR|YaBrowser/.test(ua) ? 'safari' : 'chromium')
</script>

<template>
  <div class="ac">
    <section class="card">
      <h3>{{ t('Мост к биржам') }}</h3>
      <div v-if="state.bridge === 'ready'" class="br ok">
        <Icon name="check" />
        <div class="grow">
          <b>{{ t('Расширение подключено') }}</b>
          <div class="muted">tvx bridge v{{ state.bridgeVersion }} · {{ t('ключи хранятся в нём и на сайт не попадают') }}</div>
          <div class="muted">{{ t('Пока браузер открыт, мост сам догружает новые сделки каждые несколько минут — эту вкладку можно закрыть.') }}</div>
        </div>
        <button class="btn primary" @click="openOptions">{{ t('Ключи и счета') }}</button>
      </div>
      <div v-else-if="state.bridge === 'reload'" class="br">
        <Icon name="refresh" />
        <div class="grow">
          <b>{{ t('Расширение обновилось') }}</b>
          <div class="muted">{{ t('Перезагрузите страницу, чтобы журнал снова его увидел.') }}</div>
        </div>
        <button class="btn primary" @click="reload">{{ t('Перезагрузить') }}</button>
      </div>
      <div v-else-if="state.bridge === 'checking'" class="br">
        <span class="spinner" />
        <div class="muted">{{ t('Ищу расширение…') }}</div>
      </div>
      <div v-else class="install">
        <p class="lead">
          {{ t('Биржи не принимают запросы с ключом прямо со страницы сайта, поэтому ключи держит небольшое расширение браузера — «мост». Оно само запрашивает у биржи историю и отдаёт журналу только готовые сделки.') }}
        </p>
        <div class="browsers" role="group" :aria-label="t('Браузер')">
          <button class="sg" :class="{ on: browser === 'chromium' }" @click="browser = 'chromium'">Chrome · Edge · Brave · Opera · Yandex</button>
          <button class="sg" :class="{ on: browser === 'firefox' }" @click="browser = 'firefox'">Firefox</button>
          <button class="sg" :class="{ on: browser === 'safari' }" @click="browser = 'safari'">Safari</button>
        </div>
        <ol v-if="browser === 'chromium'" class="steps">
          <li>
            <a class="btn primary" href="./tvx-bridge.zip" download><Icon name="download" :size="16" /> {{ t('Скачать расширение') }}</a>
            <span class="muted">{{ t('и распакуйте архив в отдельную папку') }}</span>
          </li>
          <li>{{ t('Откройте страницу расширений (в адресной строке: chrome://extensions) и включите «Режим разработчика».') }}</li>
          <li>{{ t('Нажмите «Загрузить распакованное расширение» и выберите папку с расширением.') }}</li>
          <li>{{ t('Вернитесь сюда и добавьте ключ только для чтения.') }}</li>
        </ol>
        <ol v-else-if="browser === 'firefox'" class="steps">
          <li>
            <a class="btn primary" href="./tvx-bridge-firefox.zip" download><Icon name="download" :size="16" /> {{ t('Скачать расширение для Firefox') }}</a>
          </li>
          <li>{{ t('Откройте в Firefox страницу about:debugging#/runtime/this-firefox и нажмите «Загрузить временное дополнение».') }}</li>
          <li>{{ t('Выберите скачанный архив. Вернитесь сюда и добавьте ключ только для чтения.') }}</li>
          <li class="muted">{{ t('Так дополнение работает до перезапуска Firefox: для постоянной установки его нужно подписать у Mozilla. Подписанной сборки пока нет.') }}</li>
        </ol>
        <p v-else class="note-box">{{ t('Сборки для Safari пока нет: Apple принимает расширения только через Xcode и платную учётную запись разработчика. На Mac подойдут Chrome, Edge, Brave или Firefox; на iPhone сделки приходят через синхронизацию.') }}</p>
        <div class="row-btns">
          <button class="btn" :disabled="checking" @click="recheck"><Icon name="refresh" :size="16" /> {{ checking ? t('Проверяю…') : t('Проверить ещё раз') }}</button>
          <span class="muted">{{ t('На телефоне расширение не нужно: сделки придут через синхронизацию.') }}</span>
        </div>
      </div>
    </section>

    <section class="card">
      <h3>{{ t('Счета') }}</h3>
      <p v-if="!state.accounts.length" class="muted none-l">{{ t('Счетов пока нет. Добавьте ключ в расширении, подключите синхронизацию с другим устройством или включите демо-данные.') }}</p>
      <ul v-else class="acct-list">
        <li v-for="a in state.accounts" :key="a.id" class="acct-row">
          <div class="acct-main">
            <span class="tag" :class="a.exchange">{{ EXCHANGES.find((x) => x.id === a.exchange)?.name }}</span>
            <b>{{ a.label }}</b>
            <span v-if="a.demo" class="tag">{{ t('демо') }}</span>
            <span v-else class="muted mono-s">••••{{ a.hint }}</span>
            <span class="grow" />
            <button v-if="a.local" class="btn sm" :disabled="state.jobs[a.id]?.busy" :title="t('Обновить с биржи')" :aria-label="t('Обновить с биржи')" @click="refresh(a.id)">
              <Icon name="refresh" :size="16" :class="{ spin: state.jobs[a.id]?.busy }" />
            </button>
            <template v-if="confirmId === a.id">
              <button class="btn sm danger" @click="(removeAccount(a.id), (confirmId = ''))">{{ t('Удалить') }}</button>
              <button class="btn sm" @click="confirmId = ''">{{ t('Отмена') }}</button>
            </template>
            <button v-else-if="!a.demo" class="btn sm" :title="t('Удалить счёт и его сделки из журнала')" :aria-label="t('Удалить счёт и его сделки из журнала')" @click="confirmId = a.id"><Icon name="trash" :size="16" /></button>
          </div>
          <div class="acct-sub muted">
            <span>{{ plural((trades[a.id] ?? []).length, ['сделка', 'сделки', 'сделок'], ['trade', 'trades']) }}</span>
            <template v-if="a.demo"> · {{ t('сгенерированные данные для знакомства') }}</template>
            <template v-else-if="state.jobs[a.id]?.busy"> · {{ t('загружаю историю… {p}%', { p: Math.round((state.jobs[a.id]?.progress ?? 0) * 100) }) }}</template>
            <template v-else-if="a.local && state.pulled[a.id]"> · {{ t('обновлено {when}', { when: fmtAgo(state.pulled[a.id], ui.now) }) }}</template>
            <template v-else-if="a.local"> · {{ t('ждёт первой загрузки') }}</template>
            <template v-else> · {{ t('ключ на другом устройстве — сделки приходят через синхронизацию') }}</template>
            <span v-if="a.expiresAt && daysLeft(a.expiresAt) <= 21" class="exp-warn"> · {{ t('ключ истекает {date}', { date: fmtDate(a.expiresAt, true) }) }}</span>
          </div>
          <div v-if="state.jobs[a.id]?.busy" class="progress"><span :style="{ width: Math.max(4, (state.jobs[a.id]?.progress ?? 0) * 100) + '%' }" /></div>
          <p v-if="state.jobs[a.id]?.error" class="err">{{ explainError(state.jobs[a.id]?.error, state.jobs[a.id]?.message) }}</p>
          <p v-if="confirmId === a.id" class="muted confirm-note">{{ t('Сделки и пометки этого счёта будут удалены из журнала на всех ваших устройствах. Ключ в расширении останется — удалите его там отдельно.') }}</p>
        </li>
      </ul>
      <label class="depth">
        <span class="muted">{{ t('При подключении нового счёта загружать историю за') }}</span>
        <select v-model.number="prefs.depthDays" class="field sel">
          <option v-for="d in DEPTHS" :key="d" :value="d">{{ plural(d, ['день', 'дня', 'дней'], ['day', 'days']) }}</option>
        </select>
      </label>
      <p class="muted fine">{{ t('Binance отдаёт историю фьючерсов только за последние 3 месяца, Bybit — за 2 года. Всё загруженное остаётся в журнале навсегда.') }}</p>
    </section>

    <section class="card two">
      <div>
        <h3>{{ t('Телефон и другие устройства') }}</h3>
        <p class="muted lead">
          {{ cloud.code ? t('Синхронизация включена: на связи {n} из {m} ретрансляторов. Новые сделки мост отправляет сам, даже когда журнал закрыт.', { n: cloud.online, m: cloud.relays.length }) : t('Сделки и пометки можно видеть на телефоне. Данные шифруются на устройстве, ключи бирж не передаются.') }}
        </p>
        <button class="btn primary" @click="ui.syncOpen = true"><Icon name="phone" :size="16" /> {{ cloud.code ? t('Подключить устройство') : t('Настроить синхронизацию') }}</button>
      </div>
      <div>
        <h3>{{ t('Демо-данные') }}</h3>
        <p class="muted lead">{{ t('Два выдуманных счёта с историей за пять месяцев — чтобы посмотреть, как выглядит журнал. Никуда не передаются.') }}</p>
        <button class="btn bordered" @click="setDemo(!prefs.demo)">{{ prefs.demo ? t('Убрать демо-данные') : t('Показать демо-данные') }}</button>
      </div>
    </section>

    <section class="card">
      <h3>{{ t('Как устроена безопасность') }}</h3>
      <ul class="sec">
        <li><Icon name="lock" :size="18" /> {{ t('Ключи бирж хранятся только в расширении на вашем компьютере. Сайт журнала, синхронизация и телефон их не видят.') }}</li>
        <li><Icon name="eye" :size="18" /> {{ t('Мост принимает только ключи «только чтение»: ключ с правом торговли или вывода он отклонит. Команд для ордеров в нём нет.') }}</li>
        <li><Icon name="cloud" :size="18" /> {{ t('Своего сервера у журнала нет. Между устройствами данные идут зашифрованными: прочитать их можно только с кодом синхронизации.') }}</li>
        <li><Icon name="github" :size="18" /> {{ t('Код журнала и расширения открыт — его можно проверить и собрать самому.') }}</li>
      </ul>
    </section>
  </div>
</template>

<style>
.ac {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 860px;
  margin: 0 auto;
  width: 100%;
  user-select: text;
  -webkit-user-select: text;
}
.br {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.br.ok .icon {
  color: var(--up);
}
.install .lead {
  margin: 0 0 12px;
}
.browsers {
  display: inline-flex;
  flex-wrap: wrap;
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow: hidden;
  margin-bottom: 12px;
}
.install .note-box {
  margin: 0 0 12px;
  padding: 9px 11px;
  border-radius: 8px;
  background: var(--panel-2);
  color: var(--muted);
  line-height: 1.45;
}
.steps {
  margin: 0 0 12px;
  padding-left: 22px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  line-height: 1.45;
}
.steps li > .btn {
  margin-right: 8px;
}
a.btn {
  text-decoration: none;
}
.row-btns {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.row-btns .btn,
.btn.bordered {
  border: 1px solid var(--border);
  padding: 0 12px;
}
.acct-list {
  list-style: none;
  margin: 0 0 12px;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.acct-row {
  padding: 8px 10px;
  border-radius: 10px;
  background: var(--panel-2);
}
.acct-main {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.acct-main .tag {
  font-size: 11px;
  padding: 4px 6px;
  background: var(--bg);
}
.acct-sub {
  font-size: 12px;
  margin-top: 2px;
}
.mono-s {
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 12px;
}
.exp-warn {
  color: var(--warn);
}
.progress {
  height: 4px;
  border-radius: 2px;
  background: var(--border);
  overflow: hidden;
  margin-top: 8px;
}
.progress span {
  display: block;
  height: 100%;
  background: var(--accent);
  transition: width 0.3s;
}
.acct-row .err {
  margin-top: 8px;
  font-size: 12.5px;
}
.confirm-note {
  margin: 8px 0 0;
  font-size: 12.5px;
}
.depth {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.fine {
  margin: 8px 0 0;
  font-size: 12px;
}
.none-l {
  margin: 0 0 12px;
}
.two {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
}
.two .lead {
  margin: 0 0 12px;
}
.sec {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  line-height: 1.45;
}
.sec li {
  display: flex;
  gap: 10px;
}
.sec .icon {
  color: var(--muted);
  margin-top: 1px;
}
.spin {
  animation: spin 0.9s linear infinite;
}
@media (max-width: 719px) {
  .two {
    grid-template-columns: 1fr;
    gap: 18px;
  }
}
</style>
