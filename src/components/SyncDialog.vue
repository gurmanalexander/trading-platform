<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import qrcode from 'qrcode-generator'
import Icon from './Icon.vue'
import Modal from './Modal.vue'
import { app, toast } from '../stores/app'
import { cloud, codeFrom, disableSync, enableSync, setRelays, syncLink, DEFAULT_RELAYS } from '../stores/cloud'
import { validSyncCode } from '../lib/nostr'

// Синхронизация устройств в реальном времени: включение, код для второго устройства, состояние связи.
const incoming = app.syncCode
app.syncCode = ''
const joinText = ref(incoming)
const joinCode = computed(() => codeFrom(joinText.value))
const canJoin = computed(() => validSyncCode(joinCode.value) && joinCode.value !== cloud.code)
const busy = ref(false)

const link = computed(() => (cloud.code ? syncLink() : ''))
const qr = ref('')
watch(
  link,
  (url) => {
    if (!url) return (qr.value = '')
    const q = qrcode(0, 'M')
    q.addData(url)
    q.make()
    qr.value = q.createSvgTag({ cellSize: 4, margin: 2, scalable: true })
  },
  { immediate: true },
)

const status = computed(() => {
  if (!cloud.code) return { text: 'Выключена', cls: 'muted' }
  if (!cloud.online) return { text: 'Нет связи с ретрансляторами — изменения уйдут, когда связь появится', cls: 'down' }
  if (!cloud.ready) return { text: 'Сверяю данные…', cls: 'muted' }
  return { text: `На связи: ${cloud.online} из ${cloud.relays.length} ретрансляторов`, cls: 'up' }
})
const last = computed(() => (cloud.lastAt ? new Date(cloud.lastAt).toLocaleTimeString('ru-RU') : '—'))

async function turnOn() {
  busy.value = true
  await enableSync()
  busy.value = false
}
async function join() {
  if (!canJoin.value) return
  if (!confirm('Подключить это устройство к синхронизации?\n\nСписки, уровни, оповещения, чеклист и общие настройки на этом устройстве будут заменены теми, что уже синхронизируются.')) return
  busy.value = true
  const ok = await enableSync(joinCode.value)
  busy.value = false
  if (ok) {
    joinText.value = ''
    toast('Устройство подключено: данные сейчас придут')
  } else toast('Код не подходит', 'error')
}
function turnOff() {
  if (confirm('Отключить синхронизацию на этом устройстве? Данные останутся здесь, но перестанут обновляться.')) disableSync()
}
async function copy() {
  try {
    await navigator.clipboard.writeText(link.value)
    toast('Ссылка скопирована — откройте её на втором устройстве')
  } catch {
    prompt('Ссылка для второго устройства', link.value)
  }
}

const relayText = ref(cloud.relays.join('\n'))
const showRelays = ref(false)
function saveRelays() {
  setRelays(relayText.value.split(/\s+/).filter(Boolean))
  relayText.value = cloud.relays.join('\n')
  toast('Список ретрансляторов сохранён')
}
function resetRelays() {
  relayText.value = DEFAULT_RELAYS.join('\n')
  saveRelays()
}
const close = () => (app.syncOpen = false)
</script>

<template>
  <Modal title="Синхронизация устройств" :width="560" @close="close">
    <div class="sy scroll">
      <p class="state" :class="status.cls"><Icon :name="cloud.code && cloud.online ? 'cloud' : 'cloudOff'" :size="18" />{{ status.text }}</p>

      <template v-if="cloud.code">
        <div class="pair">
          <div v-if="qr" class="qr" v-html="qr" />
          <div class="how">
            <b>Подключите второе устройство</b>
            <p>Откройте на нём эту ссылку или наведите камеру на код. После этого изменения на одном устройстве сразу появляются на другом.</p>
            <button class="btn primary" @click="copy"><Icon name="link" :size="16" />Скопировать ссылку</button>
            <p class="muted small">Отправлено {{ cloud.sent }} · получено {{ cloud.received }} · последний обмен {{ last }}</p>
          </div>
        </div>
        <p class="muted note">
          Ссылка — это ключ к вашим данным: по ней любое устройство сможет их читать и менять. Не публикуйте её.
        </p>
      </template>

      <template v-else>
        <p>
          Списки с монетами и направлениями, уровни и остальные рисунки, оповещения, чеклист, шаблоны и общие настройки будут одинаковыми на всех
          ваших устройствах, и изменения станут появляться сразу.
        </p>
        <button class="btn primary big" :disabled="busy" @click="turnOn"><Icon name="cloud" :size="18" />Включить на этом устройстве</button>
      </template>

      <form class="join" @submit.prevent="join">
        <label for="sync-code">{{ cloud.code ? 'Или подключить это устройство к другой синхронизации' : 'Уже включили на другом устройстве? Вставьте ссылку или код оттуда' }}</label>
        <div class="join-row">
          <input id="sync-code" v-model="joinText" class="field" placeholder="Ссылка или код" autocomplete="off" spellcheck="false" />
          <button class="btn" type="submit" :disabled="!canJoin || busy">Подключить</button>
        </div>
      </form>

      <details class="more" :open="showRelays" @toggle="showRelays = ($event.target as HTMLDetailsElement).open">
        <summary>Как это работает и где хранятся данные</summary>
        <p>
          Своего сервера у приложения нет. Изменения шифруются на устройстве и передаются через публичные ретрансляторы протокола Nostr: они хранят
          последнюю версию и рассылают её вашим устройствам. Без кода прочитать данные нельзя — ретранслятор видит только шифртекст.
        </p>
        <p>
          Если одно и то же изменили на двух устройствах одновременно, останется более позднее изменение. Открытая монета, раскладка окон и тема у
          каждого устройства свои.
        </p>
        <label for="sync-relays">Ретрансляторы (по одному в строке)</label>
        <textarea id="sync-relays" v-model="relayText" class="field" rows="4" spellcheck="false" />
        <div class="join-row">
          <button class="btn" type="button" @click="resetRelays">По умолчанию</button>
          <span class="grow" />
          <button class="btn" type="button" @click="saveRelays">Сохранить список</button>
        </div>
      </details>

      <button v-if="cloud.code" class="btn off" @click="turnOff">Отключить на этом устройстве</button>
    </div>
  </Modal>
</template>

<style scoped>
.sy {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px 16px 16px;
}
p {
  margin: 0;
  line-height: 1.45;
}
.state {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
}
.pair {
  display: grid;
  grid-template-columns: 190px 1fr;
  gap: 16px;
  align-items: start;
}
.qr {
  background: #fff;
  border-radius: 8px;
  padding: 4px;
  line-height: 0;
}
.qr :deep(svg) {
  width: 100%;
  height: auto;
}
.how {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-start;
}
.small {
  font-size: 12px;
}
.note {
  font-size: 12px;
}
.big {
  align-self: flex-start;
  height: 40px;
  padding: 0 16px;
}
.join {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}
label {
  font-size: 12px;
  color: var(--muted);
}
.join-row {
  display: flex;
  gap: 8px;
  align-items: center;
}
.join-row .field {
  flex: 1;
}
.join-row .btn,
.off {
  border: 1px solid var(--border);
}
.grow {
  flex: 1;
}
.more {
  font-size: 12.5px;
  color: var(--muted);
}
.more summary {
  cursor: pointer;
  color: var(--text);
}
.more > * + * {
  margin-top: 8px;
}
.more textarea {
  display: block;
  width: 100%;
  height: auto;
  padding: 6px 10px;
  font: 12px/1.5 ui-monospace, monospace;
  resize: vertical;
}
.off {
  align-self: flex-start;
  color: var(--down);
}
@media (max-width: 719px) {
  .pair {
    grid-template-columns: 1fr;
  }
  .qr {
    max-width: 220px;
  }
}
</style>
