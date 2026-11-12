<script setup lang="ts">
import { computed, ref } from 'vue'
import Icon from './Icon.vue'
import SideMark from './SideMark.vue'
import { symbolKey, type SymbolRef } from '../types'
import { app, activeIndex, activePane, isPhone, setSymbol, toast } from '../stores/app'
import { checklist, blockVisible, buildText, toggleAnswer, addBlock, removeBlock, moveBlock, resetBlocks, type CheckBlock } from '../stores/checklist'
import { drawings } from '../stores/drawings'
import { chartAt } from '../chart/registry'

// Чеклист сделки — отдельный раздел: заполняется рядом с графиком, помнит отмеченное по каждой монете,
// текст можно скопировать или держать заметкой на графике. Шестерёнка — настройка своих блоков.
const mode = ref<'fill' | 'setup'>('fill')
const symbol = computed(() => activePane.value.symbol)
const key = computed(() => symbolKey(symbol.value))
// отмеченное запоминается по инструменту
const sel = computed(() => (checklist.selections[key.value] ??= {}))
const text = computed(() => buildText(checklist.blocks, sel.value))
const shown = computed(() => checklist.blocks.filter((b) => blockVisible(b, sel.value)))
const onChart = computed(() => (drawings[key.value] ?? []).some((d) => d.note))
const checked = computed(() => shown.value.reduce((n, b) => n + b.answers.filter((a) => (sel.value[b.id] ?? []).includes(a)).length, 0))

/** Монеты с заполненным чеклистом — чтобы вернуться к любой из них */
const filled = computed(() => {
  const out: SymbolRef[] = []
  for (const [k, v] of Object.entries(checklist.selections)) {
    if (!buildText(checklist.blocks, v)) continue
    const [exchange, market, name] = k.split(':')
    if (name) out.push({ exchange, market, symbol: name } as SymbolRef)
  }
  return out
})

/** Ставит, обновляет или (при пустом тексте) убирает заметку на графике текущей монеты */
function syncNote(value: string) {
  chartAt(activeIndex.value)?.draw.upsertNote(value)
}

function toggle(b: CheckBlock, answer: string) {
  toggleAnswer(b, sel.value, answer)
  if (checklist.auto) syncNote(text.value)
}

function setAuto(on: boolean) {
  checklist.auto = on
  if (on) syncNote(text.value)
}

function place() {
  syncNote(text.value)
  if (isPhone.value) app.mobileTab = 'chart'
}

async function copy() {
  try {
    await navigator.clipboard.writeText(text.value)
    toast('Текст чеклиста скопирован')
  } catch {
    toast('Браузер не дал записать в буфер обмена', 'error')
  }
}

function reset() {
  delete checklist.selections[key.value]
  syncNote('')
}

function open(ref: SymbolRef) {
  const keep = app.mobileTab
  setSymbol(ref)
  app.mobileTab = keep
}

// ---------- настройка ----------

const answersText = (b: CheckBlock) => b.answers.join('\n')
function setAnswers(b: CheckBlock, value: string) {
  b.answers = value
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
}
const parents = (b: CheckBlock) => checklist.blocks.filter((x) => x.id !== b.id)
function setParent(b: CheckBlock, id: string) {
  if (!id) delete b.dependsOn
  else b.dependsOn = { block: id, answer: checklist.blocks.find((x) => x.id === id)?.answers[0] ?? '' }
}
const parentAnswers = (b: CheckBlock) => checklist.blocks.find((x) => x.id === b.dependsOn?.block)?.answers ?? []
function restore() {
  if (confirm('Вернуть список блоков по умолчанию? Свои блоки будут удалены.')) resetBlocks()
}
</script>

<template>
  <div class="cl">
    <header class="cl-head">
      <template v-if="mode === 'fill'">
        <SideMark :item="symbol" />
        <b class="sym">{{ symbol.symbol }}</b>
        <span class="muted">{{ checked ? 'отмечено ' + checked : 'ничего не отмечено' }}</span>
      </template>
      <b v-else class="sym">Настройка блоков</b>
      <span class="grow" />
      <button class="btn sm" :class="{ on: mode === 'setup' }" :title="mode === 'setup' ? 'Вернуться к чеклисту' : 'Настроить блоки и варианты'" @click="mode = mode === 'setup' ? 'fill' : 'setup'">
        <Icon :name="mode === 'setup' ? 'check' : 'gear'" :size="16" />
      </button>
    </header>

    <template v-if="mode === 'fill'">
      <div class="cl-body scroll">
        <section v-for="b in shown" :key="b.id" class="block">
          <h3>{{ b.question }}</h3>
          <div class="answers" :class="{ line: b.singleLine }">
            <label v-for="a in b.answers" :key="a" class="answer" :class="{ on: (sel[b.id] ?? []).includes(a) }">
              <input :type="b.type" :name="'cl-' + b.id" :checked="(sel[b.id] ?? []).includes(a)" @click="toggle(b, a)" />
              <span>{{ a }}</span>
            </label>
          </div>
        </section>
        <p v-if="!checklist.blocks.length" class="muted">Блоков нет. Добавьте их в настройке (шестерёнка).</p>
        <pre v-if="text" class="preview">{{ text }}</pre>
        <div v-if="filled.length" class="filled">
          <span class="muted">Заполнены:</span>
          <button v-for="f in filled" :key="symbolKey(f)" class="chip" :class="{ on: symbolKey(f) === key }" @click="open(f)">{{ f.symbol.replace(/USDT$/, '') }}</button>
        </div>
      </div>
      <footer class="foot">
        <label class="check" title="Отмеченное сразу появляется заметкой на графике этой монеты и обновляется при каждом изменении">
          <input type="checkbox" :checked="checklist.auto" @change="setAuto(($event.target as HTMLInputElement).checked)" />на графике
        </label>
        <button v-if="!checklist.auto && text" class="btn sm" @click="place">{{ onChart ? 'Обновить' : 'На график' }}</button>
        <button v-if="!checklist.auto && onChart" class="btn sm" title="Убрать заметку с графика, отметки останутся" @click="syncNote('')">Убрать</button>
        <span class="grow" />
        <button class="btn sm" :disabled="!text" title="Скопировать текст чеклиста" @click="copy"><Icon name="copy" :size="15" /></button>
        <button class="btn sm" :disabled="!checked && !onChart" title="Снять все отметки у этой монеты и убрать заметку с графика" @click="reset">Сбросить</button>
      </footer>
    </template>

    <template v-else>
      <div class="cl-body scroll">
        <section v-for="(b, i) in checklist.blocks" :key="b.id" class="edit">
          <div class="edit-head">
            <input v-model="b.question" class="field" placeholder="Вопрос" />
            <button class="btn sm" title="Выше" :disabled="i === 0" @click="moveBlock(i, -1)"><Icon name="up" :size="15" /></button>
            <button class="btn sm" title="Ниже" :disabled="i === checklist.blocks.length - 1" @click="moveBlock(i, 1)"><Icon name="down" :size="15" /></button>
            <button class="btn sm" title="Удалить блок" @click="removeBlock(b.id)"><Icon name="trash" :size="15" /></button>
          </div>
          <div class="edit-opts">
            <select v-model="b.type" class="field">
              <option value="checkbox">Несколько вариантов</option>
              <option value="radio">Один вариант</option>
            </select>
            <label class="check"><input v-model="b.singleLine" type="checkbox" />в одну строку</label>
          </div>
          <textarea class="field" rows="4" placeholder="Варианты — по одному в строке" :value="answersText(b)" @change="setAnswers(b, ($event.target as HTMLTextAreaElement).value)" />
          <div class="edit-opts">
            <span class="muted">Показывать, если</span>
            <select class="field" :value="b.dependsOn?.block ?? ''" @change="setParent(b, ($event.target as HTMLSelectElement).value)">
              <option value="">всегда</option>
              <option v-for="p in parents(b)" :key="p.id" :value="p.id">в «{{ p.question }}»</option>
            </select>
            <template v-if="b.dependsOn">
              <span class="muted">выбрано</span>
              <select v-model="b.dependsOn.answer" class="field">
                <option v-for="a in parentAnswers(b)" :key="a" :value="a">{{ a }}</option>
              </select>
            </template>
          </div>
        </section>
      </div>
      <footer class="foot">
        <button class="btn sm" @click="restore">По умолчанию</button>
        <span class="grow" />
        <button class="btn sm" @click="addBlock"><Icon name="plus" :size="15" />Блок</button>
        <button class="btn sm primary" @click="mode = 'fill'">Готово</button>
      </footer>
    </template>
  </div>
</template>

<style scoped>
.cl {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.cl-head {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 38px;
  padding: 0 8px 0 10px;
  border-bottom: 1px solid var(--border);
  flex: none;
}
.sym {
  white-space: nowrap;
}
.cl-head .muted {
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.filled {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 14px;
  font-size: 12px;
}
.chip {
  padding: 3px 9px;
  border: 1px solid var(--border);
  border-radius: 999px;
}
.chip:hover {
  background: var(--hover);
}
.chip.on {
  border-color: var(--accent);
  color: var(--accent);
}
.cl-body {
  flex: 1;
  min-height: 0;
  padding: 2px 12px 14px;
}
.block h3 {
  margin: 10px 0 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.answers {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.answers.line {
  flex-direction: row;
  flex-wrap: wrap;
  gap: 6px;
}
.answer {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
  line-height: 1.3;
}
.answers.line .answer {
  border: 1px solid var(--border);
  padding: 5px 10px;
}
.answer:hover {
  background: var(--hover);
}
.answer.on {
  background: var(--accent-soft);
}
.answers.line .answer.on {
  border-color: var(--accent);
}
.answer input,
.check input {
  accent-color: var(--accent);
  width: 16px;
  height: 16px;
  margin: 1px 0 0;
  flex: none;
}
.preview {
  margin: 14px 0 0;
  padding: 8px 10px;
  border: 1px dashed var(--border);
  border-radius: 6px;
  font: inherit;
  font-size: 12px;
  color: var(--muted);
  white-space: pre-wrap;
}
.foot {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  padding: 8px 10px;
  border-top: 1px solid var(--border);
  flex: none;
}
.grow {
  flex: 1;
}
.edit {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 0;
  border-bottom: 1px solid var(--border);
}
.edit-head,
.edit-opts {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}
.edit-head .field {
  flex: 1;
  font-weight: 600;
}
.edit-opts .field {
  width: auto;
  height: 30px;
  max-width: 100%;
}
.edit textarea {
  height: auto;
  padding: 6px 10px;
  font: inherit;
  line-height: 1.4;
  resize: vertical;
  user-select: text;
  -webkit-user-select: text;
}
.check {
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}
@media (max-width: 719px) {
  .answer {
    padding: 9px 8px;
  }
}
</style>
