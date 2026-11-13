<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref } from 'vue'
import Icon from './Icon.vue'
import Modal from './Modal.vue'
import { symbolKey, type SymbolRef } from '../types'
import { app, toast } from '../stores/app'
import { lists, sideOf, type WatchList } from '../stores/watchlist'
import { drawings } from '../stores/drawings'
import { tickers } from '../stores/tickers'
import { loadSymbols } from '../exchanges'
import { precisionOf } from '../lib/format'
import { nearestLevel, plainPrice, shareLine } from '../lib/listShare'
import { renderCoins, type CoinShot } from '../chart/batch'

// «Поделиться списком»: отмечаете монеты — получаете по картинке на каждую (все окна раскладки)
// и список строк «#монета направление уровень». Дальше — в мессенджер одним действием.

const close = () => (app.listShareOpen = false)

// ---------- цены: нужны, чтобы выбрать уровень, ближайший к цене ----------

const lastByKey = reactive<Record<string, number>>({})
const markets = new Set(lists.all.flatMap((l) => l.items.map((r) => `${r.exchange}:${r.market}`)))
for (const m of markets) {
  const [exchange, market] = m.split(':') as [SymbolRef['exchange'], SymbolRef['market']]
  loadSymbols(exchange, market)
    .then((rows) => {
      for (const r of rows) lastByKey[symbolKey(r)] = r.last
    })
    .catch(() => {})
}
const lastOf = (key: string) => tickers[key]?.last ?? lastByKey[key]

const levelsOf = (key: string) => (drawings[key] ?? []).filter((d) => d.type === 'hline' || d.type === 'hray').map((d) => d.pts[0].p)

function lineOf(r: SymbolRef, last = lastOf(symbolKey(r))): string {
  const key = symbolKey(r)
  const levels = levelsOf(key)
  return shareLine({ ...r, side: sideOf(r), levels, last, precision: precisionOf(key, nearestLevel(levels, last) ?? last ?? 1) }, app.defaults)
}
/** Подпись строки в окне выбора: направление и уровень, которые уйдут в список */
function hint(r: SymbolRef) {
  const key = symbolKey(r)
  const level = nearestLevel(levelsOf(key), lastOf(key))
  return { side: sideOf(r), level: level === undefined ? '' : plainPrice(level, precisionOf(key, level)) }
}

// ---------- выбор монет ----------

const groups = computed(() => lists.all.filter((l) => l.items.length))
// сразу отмечены монеты списков, у которых включено «отмечать сразу»
const picked = ref(new Set(lists.all.filter((l) => l.share).flatMap((l) => l.items.map(symbolKey))))
const isOn = (r: SymbolRef) => picked.value.has(symbolKey(r))

function setMany(items: SymbolRef[], on: boolean) {
  const next = new Set(picked.value)
  for (const r of items) {
    if (on) next.add(symbolKey(r))
    else next.delete(symbolKey(r))
  }
  picked.value = next
}
const countIn = (l: WatchList) => l.items.filter(isOn).length
/** Флажок списка: отмечает или снимает все его монеты */
const toggleList = (l: WatchList) => setMany(l.items, countIn(l) < l.items.length)
/** «Отмечать сразу»: настройка списка; сразу же применяется и к открытому окну */
function toggleAuto(l: WatchList) {
  l.share = !l.share
  setMany(l.items, l.share)
}

/** Отмеченные монеты по порядку списков; монета из двух списков берётся один раз */
const chosen = computed(() => {
  const seen = new Set<string>()
  const out: SymbolRef[] = []
  for (const l of lists.all)
    for (const r of l.items) {
      const k = symbolKey(r)
      if (!picked.value.has(k) || seen.has(k)) continue
      seen.add(k)
      out.push(r)
    }
  return out
})

// ---------- подготовка ----------

const withImages = ref(true)
const stage = ref<'pick' | 'work' | 'done'>('pick')
const progress = reactive({ index: 0, total: 0, symbol: '' })
let cancelled = false
const shots = ref<(CoinShot & { url: string })[]>([])
const failed = ref<string[]>([])
const text = ref('')

function freeUrls() {
  shots.value.forEach((s) => URL.revokeObjectURL(s.url))
  shots.value = []
}
onBeforeUnmount(() => {
  cancelled = true
  freeUrls()
})

async function prepare() {
  const refs = chosen.value
  if (!refs.length) return
  freeUrls()
  failed.value = []
  if (!withImages.value) {
    text.value = refs.map((r) => lineOf(r)).join('\n')
    stage.value = 'done'
    return
  }
  cancelled = false
  Object.assign(progress, { index: 0, total: refs.length, symbol: refs[0].symbol })
  stage.value = 'work'
  try {
    const done = await renderCoins(refs, (i, r) => {
      Object.assign(progress, { index: i, symbol: r.symbol })
      return !cancelled
    })
    if (cancelled) return
    // цена из только что загруженных свечей точнее той, что была в окне выбора
    text.value = done.map((s) => lineOf(s.ref, s.last ?? lastOf(symbolKey(s.ref)))).join('\n')
    failed.value = done.filter((s) => !s.blob).map((s) => s.ref.symbol)
    shots.value = done.filter((s) => s.blob).map((s) => ({ ...s, url: URL.createObjectURL(s.blob!) }))
    stage.value = 'done'
  } catch {
    if (cancelled) return
    toast('Не удалось подготовить картинки', 'error')
    stage.value = 'pick'
  }
}
function cancel() {
  cancelled = true
  stage.value = 'pick'
}

// ---------- отправка ----------

const files = computed(() => shots.value.map((s) => new File([s.blob!], s.name + '.png', { type: 'image/png' })))
/** Система умеет принять картинки файлами (телефон, часть браузеров на компьютере) */
const canShareFiles = computed(() => {
  try {
    return !!navigator.canShare && files.value.length > 0 && navigator.canShare({ files: files.value })
  } catch {
    return false
  }
})
const canShareText = !!navigator.share

async function copyText(silent = false) {
  try {
    await navigator.clipboard.writeText(text.value)
    if (!silent) toast('Список скопирован')
    return true
  } catch {
    if (!silent) prompt('Скопируйте вручную', text.value)
    return false
  }
}

function share() {
  // не все мессенджеры берут подпись вместе с картинками — на этот случай список уже лежит в буфере
  if (files.value.length) copyText(true)
  const data: ShareData = canShareFiles.value ? { files: files.value, text: text.value } : { text: text.value }
  navigator.share(data).catch((e) => {
    if ((e as Error)?.name !== 'AbortError') toast('Система не приняла отправку. Сохраните картинки и вставьте список вручную', 'error', 7000)
  })
}

function download() {
  shots.value.forEach((s, i) =>
    setTimeout(() => {
      const a = document.createElement('a')
      a.href = s.url
      a.download = s.name + '.png'
      a.click()
    }, i * 150),
  )
}

/** Нажатие на картинку кладёт её в буфер — чтобы вставить в чат с компьютера */
async function copyImage(s: CoinShot) {
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': s.blob! })])
    toast(`Картинка ${s.ref.symbol} скопирована`)
  } catch {
    toast('Браузер не дал скопировать картинку — сохраните её файлом', 'error')
  }
}
</script>

<template>
  <Modal title="Поделиться списком" :width="560" @close="close">
    <!-- 1. выбор монет -->
    <template v-if="stage === 'pick'">
      <div class="ls-body scroll">
        <p class="note muted">По каждой отмеченной монете — картинка со всеми окнами и строка «#монета направление уровень».</p>
        <section v-for="l in groups" :key="l.id" class="grp" :style="{ '--list': l.color }">
          <header class="grp-head">
            <label class="all">
              <input type="checkbox" :checked="countIn(l) === l.items.length" :indeterminate.prop="countIn(l) > 0 && countIn(l) < l.items.length" @change="toggleList(l)" />
              <i class="tag" />
              <b>{{ l.name }}</b>
              <span class="muted">{{ countIn(l) }} из {{ l.items.length }}</span>
            </label>
            <button
              class="auto"
              :class="{ on: l.share }"
              :aria-pressed="l.share"
              :title="l.share ? 'Монеты этого списка отмечены сразу. Нажмите, чтобы отмечать их вручную' : 'Монеты этого списка отмечаются вручную. Нажмите, чтобы отмечать их сразу'"
              @click="toggleAuto(l)"
            >
              <Icon name="check" :size="13" />по умолчанию
            </button>
          </header>
          <label v-for="r in l.items" :key="symbolKey(r)" class="coin">
            <input type="checkbox" :checked="isOn(r)" @change="setMany([r], !isOn(r))" />
            <span class="sym">{{ r.symbol }}</span>
            <span v-if="hint(r).side" class="side" :class="hint(r).side === 'long' ? 'up' : 'down'">{{ hint(r).side === 'long' ? 'Long' : 'Short' }}</span>
            <span class="lvl muted">{{ hint(r).level }}</span>
          </label>
        </section>
        <p v-if="!groups.length" class="note muted">В списках пока нет монет.</p>
      </div>
      <footer class="ls-foot">
        <label class="imgs" title="Картинка монеты — все окна текущей раскладки: те же интервалы, индикаторы, рисунки">
          <input v-model="withImages" type="checkbox" />
          с картинками
        </label>
        <span class="grow" />
        <span class="muted">монет: {{ chosen.length }}</span>
        <button class="btn primary" :disabled="!chosen.length" @click="prepare">{{ withImages ? 'Подготовить' : 'Собрать список' }}</button>
      </footer>
    </template>

    <!-- 2. картинки готовятся -->
    <div v-else-if="stage === 'work'" class="ls-work">
      <div class="spinner" />
      <p>
        Рисую графики: <b>{{ progress.index + 1 }} из {{ progress.total }}</b> · {{ progress.symbol }}
      </p>
      <div class="bar" role="progressbar" :aria-valuenow="progress.index" aria-valuemin="0" :aria-valuemax="progress.total">
        <i :style="{ width: (progress.index / Math.max(1, progress.total)) * 100 + '%' }" />
      </div>
      <button class="btn" @click="cancel">Отмена</button>
    </div>

    <!-- 3. готово -->
    <template v-else>
      <div class="ls-body scroll">
        <textarea v-model="text" class="field txt" :rows="Math.min(10, Math.max(3, text.split('\n').length))" spellcheck="false" aria-label="Список монет" />
        <p v-if="failed.length" class="note down">Не удалось загрузить свечи: {{ failed.join(', ') }} — картинок этих монет нет.</p>
        <template v-if="shots.length">
          <p class="note muted">Картинок: {{ shots.length }}. Нажатие на картинку копирует её в буфер.</p>
          <div class="thumbs">
            <button v-for="s in shots" :key="symbolKey(s.ref)" class="thumb" :title="'Скопировать картинку ' + s.ref.symbol" @click="copyImage(s)">
              <img :src="s.url" :alt="'График ' + s.ref.symbol" />
              <span>{{ s.ref.symbol }}</span>
            </button>
          </div>
        </template>
      </div>
      <footer class="ls-foot wrap">
        <button class="btn" @click="stage = 'pick'"><Icon name="prev" :size="16" />Назад</button>
        <span class="grow" />
        <button v-if="shots.length" class="btn" title="Сохранить все картинки файлами" @click="download"><Icon name="download" :size="16" />Картинки</button>
        <button class="btn" :class="{ primary: !canShareText }" @click="copyText()"><Icon name="copy" :size="16" />Список</button>
        <button v-if="canShareText" class="btn primary" :title="canShareFiles ? 'Отправить картинки и список в мессенджер' : 'Отправить список в мессенджер'" @click="share">
          <Icon name="share" :size="16" />{{ canShareFiles || !shots.length ? 'Отправить' : 'Отправить список' }}
        </button>
      </footer>
      <p v-if="shots.length && canShareFiles" class="tip muted">Список заодно копируется в буфер: если мессенджер не подставит его подписью к картинкам — вставьте.</p>
      <p v-else-if="shots.length" class="tip muted">Этот браузер не передаёт картинки в другие приложения: сохраните их файлами или копируйте по одной, список — кнопкой «Список».</p>
    </template>
  </Modal>
</template>

<style scoped>
.ls-body {
  flex: 1;
  min-height: 0;
  padding: 10px 14px;
}
.note {
  margin: 0 0 8px;
  font-size: 12.5px;
}
.grp {
  margin-bottom: 10px;
}
.grp-head {
  display: flex;
  align-items: center;
  gap: 8px;
  position: sticky;
  top: -10px;
  z-index: 1;
  padding: 4px 0;
  background: var(--panel);
}
.all {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
  cursor: pointer;
}
.all b {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.all .muted {
  font-size: 12px;
  white-space: nowrap;
}
.tag {
  width: 8px;
  height: 12px;
  flex: none;
  background: var(--list);
  clip-path: polygon(0 0, 100% 0, 62% 50%, 100% 100%, 0 100%);
}
/* настройка списка: отмечать его монеты сразу или вручную */
.auto {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  height: 24px;
  padding: 0 8px 0 6px;
  border: 1px solid var(--border);
  border-radius: 12px;
  font-size: 11.5px;
  color: var(--muted);
  flex: none;
}
.auto .icon {
  visibility: hidden;
}
.auto.on {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--accent-soft);
}
.auto.on .icon {
  visibility: visible;
}
.coin {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 32px;
  padding-left: 2px;
  cursor: pointer;
}
.coin:hover {
  background: var(--hover);
}
input[type='checkbox'] {
  accent-color: var(--accent);
  width: 16px;
  height: 16px;
  margin: 0;
  flex: none;
}
.sym {
  flex: 1;
  min-width: 0;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.side {
  font-size: 12px;
  font-weight: 600;
}
.lvl {
  min-width: 70px;
  text-align: right;
  font-size: 12.5px;
}
.ls-foot {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-top: 1px solid var(--border);
  flex: none;
}
.ls-foot.wrap {
  flex-wrap: wrap;
}
.imgs {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}
.grow {
  flex: 1;
}
.ls-work {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 36px 20px;
  text-align: center;
}
.ls-work p {
  margin: 0;
}
.bar {
  width: min(320px, 100%);
  height: 6px;
  border-radius: 3px;
  background: var(--panel-2);
  overflow: hidden;
}
.bar i {
  display: block;
  height: 100%;
  background: var(--accent);
  transition: width 0.3s;
}
.txt {
  height: auto;
  padding: 8px 10px;
  margin-bottom: 8px;
  font: 13px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  resize: vertical;
  user-select: text;
  -webkit-user-select: text;
}
.thumbs {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 8px;
}
.thumb {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 3px;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 11.5px;
  color: var(--muted);
}
.thumb:hover {
  border-color: var(--accent);
  color: var(--text);
}
.thumb img {
  display: block;
  width: 100%;
  aspect-ratio: 16 / 9;
  object-fit: cover;
  border-radius: 3px;
}
.tip {
  margin: 0;
  padding: 0 12px 10px;
  font-size: 11.5px;
}
@media (max-width: 719px) {
  .coin {
    height: 40px;
  }
  .thumbs {
    grid-template-columns: repeat(2, 1fr);
  }
  /* главная кнопка — отдельной строкой во всю ширину */
  .ls-foot.wrap .btn.primary {
    flex: 1 1 100%;
    order: 5;
    height: 44px;
  }
}
</style>
