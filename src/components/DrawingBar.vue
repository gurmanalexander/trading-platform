<script setup lang="ts">
import { computed, onMounted, onUpdated, reactive, ref } from 'vue'
import Icon from './Icon.vue'
import { DRAW_COLORS, defaultVisibility, type Dash, type Visibility } from '../stores/drawings'
import { hasLineStyle, hasText, isPosition, TEXT_SIZES, type DrawingsLayer } from '../chart/drawings'
import { riskReward } from '../chart/position'
import { app, isPhone, toast } from '../stores/app'
import { pasteFromClipboard } from '../chart/setup'

// Панель выбранного рисунка: у линий — цвет, толщина, вид и подпись; у позиции — вход, стоп и цель числами
const props = defineProps<{ layer: DrawingsLayer; maxX: number; maxY: number; precision: number }>()

const d = computed(() => props.layer.selected())
const styled = computed(() => !!d.value && hasLineStyle(d.value.type))
const position = computed(() => !!d.value && isPosition(d.value.type) && d.value.pts.length >= 3)
const isText = computed(() => d.value?.type === 'text')
// цвет выбирается и у линий, и у текста
const colored = computed(() => styled.value || isText.value)
// Где стоит панель. Пока её не трогали — сама: на компьютере над рисунком (нет места сверху — под ним),
// на телефоне — внизу графика, чтобы не закрывать то, что правят. Перетащили за ручку — остаётся там,
// куда поставили, для всех рисунков; двойное нажатие на ручку возвращает её на место по умолчанию.
// Размер берётся настоящий (он зависит от вида рисунка), панель целиком остаётся внутри окна графика.
const bar = ref<HTMLElement>()
const size = reactive({ w: 0, h: 0 })
function measure() {
  const el = bar.value
  if (!el) return
  size.w = el.offsetWidth
  size.h = el.offsetHeight
}
onMounted(measure)
onUpdated(measure)
const MARGIN = 4
/** свободное место окна: на сколько панель может сдвинуться по каждой оси */
const free = computed(() => {
  const w = size.w || (position.value ? 330 : 280)
  const h = size.h || (colored.value ? 80 : position.value ? 104 : 42)
  return { x: Math.max(0, (props.maxX || 9999) - w - MARGIN * 2), y: Math.max(0, (props.maxY || 9999) - h - MARGIN * 2), h }
})
const pos = computed(() => {
  const f = free.value
  const px = (left: number, top: number) => ({ left: Math.round(left) + 'px', top: Math.round(top) + 'px', maxWidth: (props.maxX || 9999) - MARGIN * 2 + 'px' })
  const m = app.drawBarPos
  if (m) return px(MARGIN + m.x * f.x, MARGIN + m.y * f.y)
  // телефон: по центру, над кнопками внизу графика
  if (isPhone.value) return px(MARGIN + f.x / 2, MARGIN + Math.max(0, f.y - 62))
  const a = props.layer.anchor.value
  if (!a) return null
  let top = a.y - f.h - 12
  // сверху не помещается (или там легенда графика) — ставим под рисунком
  if (top < 30) top = a.y + 18
  return px(MARGIN + Math.max(0, Math.min(f.x, a.x - MARGIN)), MARGIN + Math.max(0, Math.min(f.y, top - MARGIN)))
})

// ---------- перетаскивание панели за ручку ----------

const moving = ref(false)
function startMove(e: PointerEvent) {
  const el = bar.value
  if (!el || e.button > 0) return
  e.preventDefault()
  const grip = e.currentTarget as HTMLElement
  grip.setPointerCapture(e.pointerId)
  const x0 = e.clientX - el.offsetLeft
  const y0 = e.clientY - el.offsetTop
  let moved = false
  const move = (ev: PointerEvent) => {
    if (!moved && Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) < 4) return
    moved = true
    moving.value = true
    const f = free.value
    const part = (v: number, room: number) => (room > 0 ? Math.min(1, Math.max(0, (v - MARGIN) / room)) : 0)
    app.drawBarPos = { x: part(ev.clientX - x0, f.x), y: part(ev.clientY - y0, f.y) }
  }
  const stop = () => {
    moving.value = false
    grip.removeEventListener('pointermove', move)
    grip.removeEventListener('pointerup', stop)
    grip.removeEventListener('pointercancel', stop)
  }
  grip.addEventListener('pointermove', move)
  grip.addEventListener('pointerup', stop)
  grip.addEventListener('pointercancel', stop)
}
function resetPlace() {
  app.drawBarPos = null
}

const WIDTHS = [1, 2, 3, 4]
const DASH_LIST: { id: Dash; label: string; pattern: string }[] = [
  { id: 'solid', label: 'Сплошная', pattern: '' },
  { id: 'dashed', label: 'Штриховая', pattern: '5 3' },
  { id: 'dotted', label: 'Пунктирная', pattern: '1.5 3' },
]
const VIS: { id: Visibility; label: string }[] = [
  { id: 'all', label: 'все ТФ' },
  { id: 'intraday', label: '< 1Д' },
  { id: 'daily', label: '≥ 1Д' },
]

const vis = computed(() => (d.value ? (d.value.vis ?? defaultVisibility(d.value.type)) : 'all'))
const fmt = (v: number) => String(+v.toFixed(props.precision))
const rr = computed(() => (d.value && position.value ? riskReward(d.value).toFixed(2) : ''))

/** Поле цены позиции: 0 — вход, 2 — стоп, 1 — цель (номер точки рисунка) */
function setPrice(index: 0 | 1 | 2, e: Event) {
  const cur = d.value
  const input = e.target as HTMLInputElement
  if (!cur) return
  const v = parseFloat(input.value.replace(',', '.'))
  const next = cur.pts.map((p) => p.p)
  next[index] = v
  if (!(v > 0) || !props.layer.setPosition(next[0], next[2], next[1])) {
    input.value = fmt(cur.pts[index].p)
    toast('Стоп и цель должны быть по разные стороны от входа', 'error')
  }
}

/** Enter завершает ввод и возвращает клавиатуру графику (стрелки снова двигают позицию) */
function blur(e: Event) {
  ;(e.target as HTMLInputElement).blur()
}

function editText() {
  const cur = d.value?.text ?? ''
  const next = prompt('Подпись к линии (пусто — убрать)', cur)
  if (next !== null) props.layer.setStyle({ text: next.trim().slice(0, 60) })
}
function makeDefault() {
  props.layer.saveAsDefault()
  toast('Стиль сохранён: новые рисунки этого инструмента будут такими же')
}
async function copyTrade() {
  const text = props.layer.copyText()
  try {
    await navigator.clipboard.writeText(text)
    toast('Позиция скопирована текстом')
  } catch {
    prompt('Скопируйте вручную', text)
  }
}
function duplicate() {
  if (props.layer.copySelected()) props.layer.paste()
}
</script>

<template>
  <div v-if="d && pos" ref="bar" class="dbar" :class="{ moving }" :style="pos" @pointerdown.stop @keydown.stop>
    <button
      class="grip"
      :title="app.drawBarPos ? 'Потяните, чтобы передвинуть панель. Двойное нажатие — вернуть на место по умолчанию' : 'Потяните, чтобы передвинуть панель'"
      aria-label="Передвинуть панель"
      @pointerdown="startMove"
      @dblclick="resetPlace"
    >
      <Icon name="grip" :size="14" />
    </button>
    <div v-if="colored" class="row">
      <button
        v-for="c in DRAW_COLORS"
        :key="c"
        class="swatch"
        :class="{ on: c === d.color }"
        :style="{ background: c }"
        :aria-label="'Цвет ' + c"
        @click="layer.setStyle({ color: c })"
      />
      <label class="swatch custom" title="Свой цвет">
        <input type="color" :value="d.color" @change="layer.setStyle({ color: ($event.target as HTMLInputElement).value })" />
      </label>
    </div>

    <div v-if="position" class="row prices">
      <label title="Цена входа">
        <span>Вход</span>
        <input class="field" inputmode="decimal" :value="fmt(d.pts[0].p)" @change="setPrice(0, $event)" @keydown.enter="blur" />
      </label>
      <label title="Стоп-лосс">
        <span class="down">Стоп</span>
        <input class="field" inputmode="decimal" :value="fmt(d.pts[2].p)" @change="setPrice(2, $event)" @keydown.enter="blur" />
      </label>
      <label title="Тейк-профит">
        <span class="up">Тейк</span>
        <input class="field" inputmode="decimal" :value="fmt(d.pts[1].p)" @change="setPrice(1, $event)" @keydown.enter="blur" />
      </label>
    </div>

    <div class="row">
      <template v-if="styled">
        <button
          v-for="w in WIDTHS"
          :key="w"
          class="btn sm"
          :class="{ on: (d.width ?? 1) === w }"
          :title="'Толщина ' + w"
          @click="layer.setStyle({ width: w })"
        >
          <svg width="18" height="14" viewBox="0 0 18 14" aria-hidden="true"><path d="M2 7h14" stroke="currentColor" :stroke-width="w" /></svg>
        </button>
        <span class="sep" />
        <button
          v-for="s in DASH_LIST"
          :key="s.id"
          class="btn sm"
          :class="{ on: (d.dash ?? 'solid') === s.id }"
          :title="s.label"
          @click="layer.setStyle({ dash: s.id })"
        >
          <svg width="18" height="14" viewBox="0 0 18 14" aria-hidden="true">
            <path d="M1 7h16" stroke="currentColor" stroke-width="1.6" :stroke-dasharray="s.pattern" />
          </svg>
        </button>
        <span class="sep" />
        <button v-if="hasText(d.type)" class="btn sm" :class="{ on: !!d.text }" title="Подпись" @click="editText"><Icon name="text" :size="15" /></button>
        <button class="btn sm" title="Сделать стилем по умолчанию для этого инструмента" @click="makeDefault"><Icon name="pin" :size="15" /></button>
      </template>
      <template v-if="isText">
        <button class="btn sm" title="Изменить текст (двойной щелчок)" @click="layer.editText(d)"><Icon name="pencil" :size="15" /></button>
        <select class="field vis" title="Размер шрифта" :value="d.size ?? 12" @change="layer.setTextStyle({ size: Number(($event.target as HTMLSelectElement).value) })">
          <option v-for="n in TEXT_SIZES" :key="n" :value="n">{{ n }} px</option>
        </select>
        <button class="btn sm" :class="{ on: !!d.bg }" title="Подложка под текстом" @click="layer.setTextStyle({ bg: !d.bg })"><Icon name="rect" :size="15" /></button>
        <button class="btn sm" :class="{ on: !!d.pin }" title="Закрепить на экране: текст не уезжает при прокрутке и виден в том же месте на всех интервалах" @click="layer.togglePin()">
          <Icon name="pin" :size="15" />
        </button>
        <span class="sep" />
      </template>
      <template v-if="position">
        <b class="kind" :class="d.type === 'long' ? 'up' : 'down'">{{ d.type === 'long' ? 'Лонг' : 'Шорт' }}</b>
        <span class="muted">R/R {{ rr }}</span>
        <span class="grow" />
      </template>
      <select class="field vis" title="На каких интервалах показывать" :value="vis" @change="layer.setVisibility(($event.target as HTMLSelectElement).value as Visibility)">
        <option v-for="v in VIS" :key="v.id" :value="v.id">{{ v.label }}</option>
      </select>
      <template v-if="position">
        <button class="btn sm" title="Вставить текст сделки из буфера: ТВХ / SL / TP разложатся по этой позиции" @click="pasteFromClipboard()"><Icon name="paste" :size="16" /></button>
        <button class="btn sm" title="Скопировать позицию текстом: вход, стоп, тейк" @click="copyTrade"><Icon name="share" :size="16" /></button>
      </template>
      <button class="btn sm" title="Дублировать (или тяните с Ctrl)" @click="duplicate"><Icon name="copy" :size="15" /></button>
      <button class="btn sm" title="Удалить (Delete)" @click="layer.removeSelected()"><Icon name="trash" :size="15" /></button>
    </div>
    <p v-if="position && !isPhone" class="hint muted">Ctrl+V — вставить текст сделки (ТВХ / SL / TP), Ctrl+C — скопировать его</p>
  </div>
</template>

<style scoped>
.dbar {
  position: absolute;
  z-index: 7;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 5px 6px 5px 22px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: var(--shadow);
}
.dbar.moving {
  opacity: 0.9;
}
/* ручка: полоса во всю высоту слева — за неё панель перетаскивают */
.grip {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 20px;
  display: grid;
  place-items: center;
  border-radius: 8px 0 0 8px;
  color: var(--muted);
  cursor: grab;
  touch-action: none;
}
.grip:hover,
.dbar.moving .grip {
  background: var(--hover);
  color: var(--text);
}
.dbar.moving .grip {
  cursor: grabbing;
}
/* не помещается в ширину окна — кнопки переходят на следующую строку */
.row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
}
.prices {
  gap: 6px;
}
.prices label {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 11px;
  color: var(--muted);
}
.prices .field {
  width: 100px;
  height: 26px;
  padding: 0 6px;
  font-size: 12.5px;
}
.kind {
  font-size: 12px;
  padding: 0 2px;
}
.grow {
  flex: 1;
}
.vis {
  width: auto;
  height: 26px;
  padding: 0 2px 0 4px;
  font-size: 12px;
}
.hint {
  margin: 0;
  font-size: 11px;
}
.swatch {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 2px solid transparent;
  flex: none;
}
.swatch.on {
  border-color: var(--text);
}
.swatch.custom {
  position: relative;
  overflow: hidden;
  cursor: pointer;
  background: conic-gradient(#f0566b, #e8a838, #1fb28a, #4c8dff, #a78bfa, #f0566b);
}
.swatch.custom input {
  position: absolute;
  inset: -6px;
  width: 40px;
  height: 40px;
  opacity: 0;
  cursor: pointer;
}
.sep {
  width: 1px;
  height: 16px;
  background: var(--border);
}
@media (max-width: 719px) {
  .grip {
    width: 26px;
  }
  .dbar {
    padding-left: 30px;
  }
  .prices label {
    flex: 1 1 0;
    min-width: 0;
  }
  .swatch {
    width: 26px;
    height: 26px;
  }
  .btn.sm {
    height: 30px;
    min-width: 28px;
  }
  .prices .field {
    width: 100%;
    min-width: 70px;
    height: 32px;
  }
}
</style>
