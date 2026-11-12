<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import qrcode from 'qrcode-generator'
import Icon from './Icon.vue'
import Modal from './Modal.vue'
import { EXCHANGE_NAMES, MARKET_NAMES } from '../types'
import { app, toast } from '../stores/app'
import { makePack, shareOptions, shareUrl } from '../chart/share'
import { shareText } from '../lib/share'
import { fmtPct, fmtPrice } from '../lib/format'

// «Поделиться»: что отправить с текущего графика — направление, дату, ближайшие уровни и последние позиции.
// Результат — ссылка, QR-код или текст для мессенджера.
const o = shareOptions()
const f = (v: number) => fmtPrice(v, o.precision)
const pick = reactive({
  side: !!o.side,
  date: !!o.date,
  // по умолчанию — уровень, выбранный на графике, а если такого нет — ближайший к цене
  levels: o.levels.map((l, i) => (o.selectedLevel !== undefined ? l === o.selectedLevel : i === 0)),
  positions: o.positions.map((_, i) => i === 0),
})

const pack = computed(() =>
  makePack(o.ref, {
    side: pick.side ? o.side : undefined,
    date: pick.date ? o.date : undefined,
    levels: o.levels.filter((_, i) => pick.levels[i]),
    positions: o.positions.filter((_, i) => pick.positions[i]),
  }),
)
const link = computed(() => shareUrl(pack.value))
const text = computed(() => shareText(pack.value, o.precision))
const dist = (level: number) => (o.last ? fmtPct(((level - o.last) / o.last) * 100) : '')
const dateText = o.date ? `${String(o.date.d).padStart(2, '0')}.${String(o.date.m).padStart(2, '0')}.${o.date.y}` : ''

const qr = ref('')
watch(
  link,
  (url) => {
    try {
      const q = qrcode(0, 'M')
      q.addData(url)
      q.make()
      qr.value = q.createSvgTag({ cellSize: 4, margin: 2, scalable: true })
    } catch {
      qr.value = ''
    }
  },
  { immediate: true },
)

async function copy(value: string, done: string) {
  try {
    await navigator.clipboard.writeText(value)
    toast(done)
  } catch {
    prompt('Скопируйте вручную', value)
  }
}
const canShare = !!navigator.share
function system() {
  navigator.share({ title: o.ref.symbol, text: text.value, url: link.value }).catch(() => {})
}
const close = () => (app.shareOpen = false)
</script>

<template>
  <Modal :title="'Поделиться · ' + o.ref.symbol" :width="620" @close="close">
    <div class="sh">
      <div class="sh-pick">
        <p class="muted coin">{{ EXCHANGE_NAMES[o.ref.exchange] }} · {{ MARKET_NAMES[o.ref.market] }} · цена {{ f(o.last) }}</p>

        <label v-if="o.side" class="opt">
          <input v-model="pick.side" type="checkbox" />
          <span>Направление</span>
          <b :class="o.side === 'long' ? 'up' : 'down'">{{ o.side === 'long' ? '▲ лонг' : '▼ шорт' }}</b>
        </label>
        <label v-if="o.date" class="opt" title="График отмотан назад: получатель увидит эту же дату">
          <input v-model="pick.date" type="checkbox" />
          <span>Дата графика</span>
          <b>{{ dateText }}</b>
        </label>

        <h3>Уровни <span class="muted">— ближайшие к цене</span></h3>
        <label v-for="(l, i) in o.levels" :key="l" class="opt">
          <input v-model="pick.levels[i]" type="checkbox" />
          <span class="num">{{ f(l) }}</span>
          <b class="muted">{{ dist(l) }}</b>
        </label>
        <p v-if="!o.levels.length" class="muted empty">На графике нет горизонтальных уровней.</p>

        <h3>Позиции <span class="muted">— последние</span></h3>
        <label v-for="(x, i) in o.positions" :key="x.t + ':' + x.entry" class="opt pos">
          <input v-model="pick.positions[i]" type="checkbox" />
          <span>
            <b :class="x.side === 'long' ? 'up' : 'down'">{{ x.side === 'long' ? 'Лонг' : 'Шорт' }}</b>
            {{ f(x.entry) }}
            <i class="muted">стоп {{ f(x.stop) }} · тейк {{ f(x.target) }}</i>
          </span>
        </label>
        <p v-if="!o.positions.length" class="muted empty">Позиций на графике нет.</p>
      </div>

      <div class="sh-out">
        <div v-if="qr" class="qr" v-html="qr" />
        <input class="field link" readonly :value="link" @focus="($event.target as HTMLInputElement).select()" />
        <div class="actions">
          <button class="btn primary" @click="copy(link, 'Ссылка скопирована')"><Icon name="link" :size="16" />Ссылку</button>
          <button class="btn" title="Строки сетапа и позиции текстом — их можно вставить в tvx или отправить в чат" @click="copy(text, 'Текст скопирован')"><Icon name="copy" :size="16" />Текстом</button>
          <button v-if="canShare" class="btn" title="Системное окно «Поделиться»" @click="system"><Icon name="share" :size="16" /></button>
        </div>
        <pre class="text">{{ text }}</pre>
      </div>
    </div>
  </Modal>
</template>

<style scoped>
.sh {
  display: grid;
  grid-template-columns: 1fr 240px;
  gap: 16px;
  padding: 12px 16px 16px;
  overflow-y: auto;
}
.coin {
  margin: 0 0 6px;
  font-size: 12px;
}
h3 {
  margin: 12px 0 4px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
h3 .muted {
  text-transform: none;
  letter-spacing: 0;
  font-weight: 400;
}
.opt {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
}
.opt:hover {
  background: var(--hover);
}
.opt input {
  accent-color: var(--accent);
  width: 16px;
  height: 16px;
  margin: 0;
  flex: none;
}
.opt > span {
  flex: 1;
  min-width: 0;
}
.opt .num {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}
.pos i {
  display: block;
  font-style: normal;
  font-size: 12px;
}
.empty {
  margin: 2px 8px;
  font-size: 12px;
}
.sh-out {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
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
.link {
  font-size: 12px;
  height: 30px;
}
.actions {
  display: flex;
  gap: 6px;
}
.actions .btn {
  border: 1px solid var(--border);
}
.actions .btn.primary {
  flex: 1;
  border-color: transparent;
}
.text {
  margin: 0;
  padding: 8px 10px;
  border: 1px dashed var(--border);
  border-radius: 6px;
  font: inherit;
  font-size: 12px;
  color: var(--muted);
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 140px;
  overflow-y: auto;
  user-select: text;
  -webkit-user-select: text;
}
@media (max-width: 719px) {
  .sh {
    grid-template-columns: 1fr;
  }
  .qr {
    max-width: 220px;
    align-self: center;
  }
}
</style>
