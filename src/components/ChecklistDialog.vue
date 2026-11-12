<script setup lang="ts">
import { computed, ref } from 'vue'
import Icon from './Icon.vue'
import Modal from './Modal.vue'
import { symbolKey } from '../types'
import { app, activeIndex, activePane, toast } from '../stores/app'
import { checklist, blockVisible, buildText, toggleAnswer, addBlock, removeBlock, moveBlock, resetBlocks, type CheckBlock } from '../stores/checklist'
import { chartAt } from '../chart/registry'

// Чеклист сделки: отмеченное собирается в заметку на графике. Вторая вкладка — настройка своих блоков.
const tab = ref<'fill' | 'setup'>('fill')
const key = computed(() => symbolKey(activePane.value.symbol))
// отмеченное запоминается по инструменту
const sel = computed(() => (checklist.selections[key.value] ??= {}))
const text = computed(() => buildText(checklist.blocks, sel.value))
const shown = computed(() => checklist.blocks.filter((b) => blockVisible(b, sel.value)))

function close() {
  app.checklistOpen = false
}

function place() {
  const layer = chartAt(activeIndex.value)?.draw
  if (!layer) return
  layer.upsertNote(text.value)
  toast(text.value ? 'Заметка поставлена на график' : 'Заметка убрана с графика')
  close()
}

function reset() {
  delete checklist.selections[key.value]
  chartAt(activeIndex.value)?.draw.upsertNote('')
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
  <Modal :title="'Чеклист · ' + activePane.symbol.symbol" :width="560" @close="close">
    <div class="tabs" role="tablist">
      <button role="tab" :class="{ on: tab === 'fill' }" @click="tab = 'fill'">Заполнить</button>
      <button role="tab" :class="{ on: tab === 'setup' }" @click="tab = 'setup'">Настроить</button>
    </div>

    <template v-if="tab === 'fill'">
      <div class="body scroll">
        <section v-for="b in shown" :key="b.id" class="block">
          <h3>{{ b.question }}</h3>
          <div class="answers" :class="{ line: b.singleLine }">
            <label v-for="a in b.answers" :key="a" class="answer" :class="{ on: (sel[b.id] ?? []).includes(a) }">
              <input :type="b.type" :name="'cl-' + b.id" :checked="(sel[b.id] ?? []).includes(a)" @click="toggleAnswer(b, sel, a)" />
              <span>{{ a }}</span>
            </label>
          </div>
        </section>
        <p v-if="!checklist.blocks.length" class="muted">Блоков нет. Добавьте их на вкладке «Настроить».</p>
        <pre v-if="text" class="preview">{{ text }}</pre>
      </div>
      <footer class="foot">
        <button class="btn" title="Снять все отметки и убрать заметку с графика" @click="reset">Сбросить</button>
        <span class="grow" />
        <button class="btn primary" @click="place">{{ text ? 'На график' : 'Убрать с графика' }}</button>
      </footer>
    </template>

    <template v-else>
      <div class="body scroll">
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
        <button class="btn" @click="restore">По умолчанию</button>
        <span class="grow" />
        <button class="btn" @click="addBlock"><Icon name="plus" :size="16" />Блок</button>
        <button class="btn primary" @click="tab = 'fill'">Готово</button>
      </footer>
    </template>
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
  flex: 1;
  min-height: 120px;
  max-height: 62vh;
  padding: 6px 14px 12px;
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
  gap: 8px;
  padding: 8px 12px;
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
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}
@media (max-width: 719px) {
  .body {
    max-height: none;
  }
  .answer {
    padding: 9px 8px;
  }
}
</style>
