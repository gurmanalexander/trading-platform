<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import qrcode from 'qrcode-generator'
import Modal from './Modal.vue'
import { app, toast } from '../stores/app'
import { collect, decode, describe, encode, merge, writeAll, type Snapshot } from '../lib/transfer'

// Перенос всего, что хранит приложение, на другое устройство — без сервера: ссылкой, QR-кодом или файлом.
const incomingCode = app.transfer?.code ?? ''
const tab = ref<'send' | 'receive'>(incomingCode ? 'receive' : 'send')

// ---------- отправка ----------

const link = ref('')
const size = ref(0)
const qr = ref('')
/** Больше этого в QR-код не помещается так, чтобы телефон уверенно его считал */
const QR_LIMIT = 2200

onMounted(async () => {
  // дописываем на диск то, что ещё ждёт отложенного сохранения
  window.dispatchEvent(new Event('pagehide'))
  const code = await encode(collect())
  link.value = new URL('./', location.href).href + '#import=' + code
  size.value = link.value.length
  if (link.value.length <= QR_LIMIT) {
    try {
      const q = qrcode(0, 'L')
      q.addData(link.value)
      q.make()
      qr.value = q.createSvgTag({ cellSize: 4, margin: 2, scalable: true })
    } catch {
      /* не поместилось — остаются ссылка и файл */
    }
  }
  if (incomingCode) preview(incomingCode)
})

async function copyLink() {
  try {
    await navigator.clipboard.writeText(link.value)
    toast('Ссылка скопирована — откройте её на другом устройстве')
  } catch {
    prompt('Ссылка для другого устройства', link.value)
  }
}
const canShare = !!navigator.share
function shareLink() {
  navigator.share({ title: 'tvx', url: link.value }).catch(() => {})
}
function downloadFile() {
  const blob = new Blob([JSON.stringify(collect())], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `tvx-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
}

// ---------- приём ----------

const pasted = ref('')
const incoming = ref<Snapshot | null>(null)
const error = ref('')
const summary = computed(() => (incoming.value ? describe(incoming.value) : ''))

async function preview(code: string) {
  error.value = ''
  incoming.value = null
  if (!code.trim()) return
  try {
    incoming.value = await decode(code)
  } catch {
    error.value = 'Не получилось прочитать: это не ссылка и не файл переноса tvx'
  }
}
async function onFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) preview(await file.text())
}

function accept(replace: boolean) {
  if (!incoming.value) return
  window.dispatchEvent(new Event('pagehide'))
  writeAll(replace ? incoming.value : merge(collect(), incoming.value), replace)
  // адрес без кода, чтобы после перезагрузки не спросить о переносе снова
  location.replace(new URL('./', location.href).href)
}

function close() {
  app.transfer = null
  if (location.hash.startsWith('#import=')) history.replaceState(null, '', new URL('./', location.href).pathname)
}
</script>

<template>
  <Modal title="Перенос на другое устройство" :width="460" @close="close">
    <div class="tabs" role="tablist">
      <button role="tab" :class="{ on: tab === 'send' }" @click="tab = 'send'">Отправить отсюда</button>
      <button role="tab" :class="{ on: tab === 'receive' }" @click="tab = 'receive'">Принять сюда</button>
    </div>

    <div v-if="tab === 'send'" class="body scroll">
      <p>
        Переносится всё: списки с монетами и направлениями, уровни и остальные рисунки, оповещения, шаблоны, чеклист, цвета и настройки.
        Откройте ссылку на втором устройстве — оно предложит принять данные.
      </p>
      <!-- eslint-disable-next-line vue/no-v-html -->
      <div v-if="qr" class="qr" v-html="qr" />
      <p v-else-if="link" class="muted">Данных слишком много для QR-кода ({{ Math.round(size / 1024) }} КБ) — отправьте себе ссылку или файл.</p>
      <div class="actions">
        <button class="btn primary" :disabled="!link" @click="copyLink">Скопировать ссылку</button>
        <button v-if="canShare" class="btn" :disabled="!link" @click="shareLink">Поделиться…</button>
        <button class="btn" @click="downloadFile">Скачать файлом</button>
      </div>
      <p class="muted note">
        Сервера у приложения нет, поэтому данные не обновляются сами: это перенос по запросу. Чтобы синхронизироваться снова, повторите его в нужную
        сторону — на принимающем устройстве можно выбрать «Объединить», и то, что добавлено только там, сохранится.
      </p>
    </div>

    <div v-else class="body scroll">
      <template v-if="!incomingCode">
        <p>Вставьте ссылку переноса с другого устройства или выберите сохранённый файл.</p>
        <textarea v-model="pasted" class="field" rows="3" placeholder="Ссылка или код переноса" @input="preview(pasted)" />
        <label class="btn file">Выбрать файл<input type="file" accept="application/json,.json" @change="onFile" /></label>
      </template>
      <p v-if="error" class="down">{{ error }}</p>
      <template v-if="incoming">
        <p><b>Пришло:</b> {{ summary }}.</p>
        <div class="actions">
          <button class="btn primary" @click="accept(false)">Объединить</button>
          <button class="btn" @click="accept(true)">Заменить всё</button>
        </div>
        <p class="muted note">
          «Объединить» — пришедшее добавится к тому, что уже есть здесь; при совпадении списка, рисунка или оповещения берётся пришедший вариант.
          «Заменить всё» — это устройство станет точной копией другого, здешние данные будут стёрты. После выбора страница перезагрузится.
        </p>
      </template>
    </div>
  </Modal>
</template>

<style scoped>
.tabs {
  display: flex;
  border-bottom: 1px solid var(--border);
  flex: none;
}
.tabs button {
  flex: 1;
  height: 36px;
  color: var(--muted);
  border-bottom: 2px solid transparent;
}
.tabs button.on {
  color: var(--text);
  border-bottom-color: var(--accent);
}
.body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px 14px;
}
p {
  margin: 0;
  line-height: 1.45;
}
.note {
  font-size: 12px;
}
.qr {
  align-self: center;
  width: min(260px, 70vw);
  padding: 8px;
  border-radius: 8px;
  background: #fff;
}
.qr :deep(svg) {
  display: block;
  width: 100%;
  height: auto;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.actions .btn,
.file {
  border: 1px solid var(--border);
}
.actions .btn.primary {
  border-color: transparent;
}
textarea {
  height: auto;
  padding: 8px 10px;
  font: inherit;
  resize: vertical;
  user-select: text;
  -webkit-user-select: text;
}
.file {
  align-self: flex-start;
  cursor: pointer;
  padding: 0 12px;
}
.file input {
  display: none;
}
</style>
