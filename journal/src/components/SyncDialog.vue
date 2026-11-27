<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Icon from '../../../src/components/Icon.vue'
import { fmtAgo } from '../lib/format'
import { t } from '../lib/i18n'
import { cloud, codeFrom, disableSync, enableSync, syncLink } from '../store/sync'
import { ui } from '../store/view'
import JModal from './JModal.vue'

/** Подключение телефона и других устройств: общий с tvx код синхронизации, ссылка и QR-код */
const input = ref(ui.syncCode)
const error = ref('')
const copied = ref(false)
const confirmOff = ref(false)
const qr = ref('')

const link = computed(() => (cloud.code ? syncLink() : ''))

watch(
  link,
  async (url) => {
    qr.value = ''
    if (!url) return
    const { default: qrcode } = await import('qrcode-generator')
    const q = qrcode(0, 'M')
    q.addData(url)
    q.make()
    qr.value = q.createSvgTag({ cellSize: 4, margin: 2, scalable: true })
  },
  { immediate: true },
)

async function create() {
  error.value = ''
  await enableSync()
}
async function join() {
  error.value = ''
  const ok = await enableSync(codeFrom(input.value))
  if (!ok) error.value = t('Это не похоже на ссылку или код синхронизации.')
  else {
    input.value = ''
    ui.syncCode = ''
  }
}
async function copy() {
  try {
    await navigator.clipboard.writeText(link.value)
    copied.value = true
    setTimeout(() => (copied.value = false), 1500)
  } catch {
    /* буфер недоступен — ссылку можно выделить и скопировать вручную */
  }
}
function off() {
  disableSync()
  confirmOff.value = false
}
</script>

<template>
  <JModal :title="t('Синхронизация устройств')" @close="ui.syncOpen = false">
    <template v-if="!cloud.code || ui.syncCode">
      <p class="lead">
        {{ t('Сделки, пометки и состояние счетов передаются между вашими устройствами в зашифрованном виде. Ключи бирж не передаются никуда: они остаются в расширении на компьютере, а телефон получает уже готовые сделки.') }}
      </p>
      <template v-if="ui.syncCode">
        <p class="note-box">{{ t('Вы открыли ссылку подключения. Данные журнала на этом устройстве будут объединены с данными остальных ваших устройств.') }}</p>
        <button class="btn primary big" @click="join">{{ t('Подключить это устройство') }}</button>
      </template>
      <template v-else>
        <button class="btn primary big" @click="create">{{ t('Включить синхронизацию') }}</button>
        <div class="or muted">{{ t('или подключитесь к уже включённой') }}</div>
        <div class="join">
          <input v-model="input" class="field" :placeholder="t('ссылка или код с другого устройства')" autocomplete="off" spellcheck="false" @keydown.enter="join" />
          <button class="btn" :disabled="!input.trim()" @click="join">{{ t('Подключить') }}</button>
        </div>
      </template>
      <p v-if="error" class="err">{{ error }}</p>
    </template>

    <template v-else>
      <div class="status">
        <Icon :name="cloud.online ? 'cloud' : 'cloudOff'" />
        <div>
          <b>{{ cloud.online ? t('Синхронизация работает') : t('Нет связи с ретрансляторами') }}</b>
          <div class="muted">
            {{ t('на связи {n} из {m}', { n: cloud.online, m: cloud.relays.length }) }}
            <template v-if="cloud.lastAt"> · {{ t('обмен {when}', { when: fmtAgo(cloud.lastAt) }) }}</template>
          </div>
        </div>
      </div>
      <p class="lead">{{ t('Откройте эту ссылку на телефоне или наведите на QR-код камеру. Код общий с tvx: устройство, уже подключённое там, получит и журнал.') }}</p>
      <!-- eslint-disable-next-line vue/no-v-html -->
      <div v-if="qr" class="qr" v-html="qr" />
      <div class="join">
        <input class="field mono" :value="link" readonly :aria-label="t('Ссылка подключения')" @focus="($event.target as HTMLInputElement).select()" />
        <button class="btn" @click="copy"><Icon :name="copied ? 'check' : 'copy'" :size="16" /> {{ copied ? t('Скопировано') : t('Копировать') }}</button>
      </div>
      <p class="note-box">{{ t('Ссылка — это ключ к вашим данным: не пересылайте её другим людям.') }}</p>
      <p v-if="cloud.tooBig" class="err">{{ t('Часть недель не передаётся: в них слишком много сделок для одного сообщения ретранслятора.') }}</p>
      <div class="off">
        <template v-if="confirmOff">
          <span class="muted">{{ t('Синхронизация выключится и в tvx на этом устройстве.') }}</span>
          <button class="btn sm danger" @click="off">{{ t('Выключить') }}</button>
          <button class="btn sm" @click="confirmOff = false">{{ t('Отмена') }}</button>
        </template>
        <button v-else class="btn sm muted" @click="confirmOff = true">{{ t('Выключить на этом устройстве') }}</button>
      </div>
    </template>
  </JModal>
</template>

<style>
.lead {
  margin: 0;
  line-height: 1.45;
}
.big {
  height: 42px;
}
.or {
  text-align: center;
  font-size: 12px;
}
.join {
  display: flex;
  gap: 8px;
}
.join .btn {
  border: 1px solid var(--border);
  padding: 0 12px;
}
.err {
  margin: 0;
  padding: 9px 11px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--down) 14%, transparent);
  border: 1px solid color-mix(in srgb, var(--down) 45%, transparent);
}
.note-box {
  margin: 0;
  padding: 9px 11px;
  border-radius: 8px;
  background: var(--panel-2);
  color: var(--muted);
  font-size: 12.5px;
  line-height: 1.4;
}
.status {
  display: flex;
  align-items: center;
  gap: 10px;
}
.qr {
  align-self: center;
  width: 200px;
  max-width: 100%;
  padding: 8px;
  border-radius: 10px;
  background: #fff;
}
.qr svg {
  display: block;
  width: 100%;
  height: auto;
}
.mono {
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 12px;
}
.off {
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: flex-end;
  flex-wrap: wrap;
}
.btn.danger {
  background: var(--down);
  color: #fff;
  padding: 0 10px;
}
</style>
