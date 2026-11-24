<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, onUpdated, reactive, ref } from 'vue'
import Icon from './Icon.vue'
import { DRAW_COLORS, defaultVisibility, type Dash, type Visibility } from '../stores/drawings'
import { hasLineStyle, hasText, isPosition, TEXT_SIZES, type DrawingsLayer } from '../chart/drawings'
import { applyRR, fmtQty, fmtUsd, positionSize, riskReward } from '../chart/position'
import { app, isPhone, toast } from '../stores/app'
import { pasteFromClipboard } from '../chart/setup'
import { t } from '../lib/i18n'

// Панель выбранного рисунка: у линий — цвет, толщина, вид и подпись; у позиции — вход, стоп и цель числами
// host — область графика, на котором выбран рисунок; paneW/paneH — её размер (меняется — пересчитываем место)
const props = defineProps<{ layer: DrawingsLayer; host?: HTMLElement; paneW: number; paneH: number; precision: number }>()

const d = computed(() => props.layer.selected())
const styled = computed(() => !!d.value && hasLineStyle(d.value.type))
const position = computed(() => !!d.value && isPosition(d.value.type) && d.value.pts.length >= 3)
const isText = computed(() => d.value?.type === 'text')
// цвет выбирается и у линий, и у текста
const colored = computed(() => styled.value || isText.value)
// Где стоит панель. Она рисуется поверх всего приложения (в body), поэтому может выходить за край
// своего графика — на соседний график, панели и полосы; граница — только окно браузера.
// Пока её не трогали — сама: на компьютере над рисунком (нет места сверху — под ним), на телефоне —
// внизу графика, чтобы не закрывать то, что правят. Перетащили за ручку — остаётся там, куда
// поставили, для всех рисунков и всех графиков; двойное нажатие на ручку возвращает её на место по умолчанию.
const bar = ref<HTMLElement>()
const size = reactive({ w: 0, h: 0 })
function measure() {
  const el = bar.value
  if (!el) return
  size.w = el.offsetWidth
  size.h = el.offsetHeight
}
const view = reactive({ w: window.innerWidth, h: window.innerHeight })
function onResize() {
  view.w = window.innerWidth
  view.h = window.innerHeight
}
onMounted(() => {
  measure()
  window.addEventListener('resize', onResize)
})
onUpdated(measure)
onBeforeUnmount(() => window.removeEventListener('resize', onResize))
const MARGIN = 4
/** свободное место окна браузера: на сколько панель может сдвинуться по каждой оси */
const free = computed(() => {
  const w = size.w || (position.value ? 330 : 280)
  const h = size.h || (colored.value ? 80 : position.value ? 104 : 42)
  return { x: Math.max(0, view.w - w - MARGIN * 2), y: Math.max(0, view.h - h - MARGIN * 2), w, h }
})
const clampX = (x: number) => MARGIN + Math.max(0, Math.min(free.value.x, x - MARGIN))
const clampY = (y: number) => MARGIN + Math.max(0, Math.min(free.value.y, y - MARGIN))
const pos = computed(() => {
  const f = free.value
  const px = (left: number, top: number) => ({ left: Math.round(left) + 'px', top: Math.round(top) + 'px', maxWidth: view.w - MARGIN * 2 + 'px' })
  const m = app.drawBarAt
  if (m) return px(MARGIN + m.x * f.x, MARGIN + m.y * f.y)
  // место графика на экране; от размера окна графика зависит, поэтому пересчитывается вместе с ним
  void props.paneW
  void props.paneH
  const r = props.host?.getBoundingClientRect()
  if (!r) return null
  // телефон: по центру графика, над кнопками внизу
  if (isPhone.value) return px(clampX(r.left + (r.width - f.w) / 2), clampY(r.bottom - f.h - 62))
  const a = props.layer.anchor.value
  if (!a) return null
  let top = r.top + a.y - f.h - 12
  // сверху не помещается (или там легенда графика) — ставим под рисунком
  if (top < r.top + 30) top = r.top + a.y + 18
  return px(clampX(r.left + a.x), clampY(top))
})

// ---------- перетаскивание панели за ручку ----------

const moving = ref(false)
function startMove(e: PointerEvent) {
  const el = bar.value
  if (!el || e.button > 0) return
  e.preventDefault()
  const grip = e.currentTarget as HTMLElement
  grip.setPointerCapture(e.pointerId)
  const box = el.getBoundingClientRect()
  const x0 = e.clientX - box.left
  const y0 = e.clientY - box.top
  let moved = false
  const move = (ev: PointerEvent) => {
    if (!moved && Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) < 4) return
    moved = true
    moving.value = true
    const f = free.value
    const part = (v: number, room: number) => (room > 0 ? Math.min(1, Math.max(0, (v - MARGIN) / room)) : 0)
    app.drawBarAt = { x: part(ev.clientX - x0, f.x), y: part(ev.clientY - y0, f.y) }
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
  app.drawBarAt = null
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
/** R/R позиции: целым или с одним-двумя знаками, без хвостовых нулей */
const rr = computed(() => (d.value && position.value ? String(+riskReward(d.value).toFixed(2)) : ''))
const step = () => 1 / 10 ** props.precision
/** объём по депозиту и риску из настроек; пусто, пока депозит не задан */
const posSize = computed(() => {
  const s = d.value && position.value ? positionSize(d.value, app.risk.deposit, app.risk.pct) : null
  return s ? t('Объём {qty} · {notional} · риск {risk}', { qty: fmtQty(s.qty), notional: fmtUsd(s.notional), risk: fmtUsd(s.risk) }) : ''
})

/** Поле цены позиции: 0 — вход, 2 — стоп, 1 — цель (номер точки рисунка) */
function setPrice(index: 0 | 1 | 2, e: Event) {
  const cur = d.value
  const input = e.target as HTMLInputElement
  if (!cur) return
  const v = parseFloat(input.value.replace(',', '.'))
  const next = cur.pts.map((p) => p.p)
  next[index] = v
  // привязка R/R: вписали стоп или вход — цель встаёт на прежний R/R; вписали цель — подтягивается стоп
  const ratio = riskReward(cur)
  if (app.rrLock && ratio > 0 && v > 0) {
    const r = applyRR(next[0], next[2], next[1], cur.type as 'long' | 'short', ratio, index === 1 ? 'target' : 'stop', step())
    next[1] = r.target
    next[2] = r.stop
  }
  if (!(v > 0) || !props.layer.setPosition(next[0], next[2], next[1])) {
    input.value = fmt(cur.pts[index].p)
    toast(t('Стоп и цель должны быть по разные стороны от входа'), 'error')
  }
}

/** Вписали R/R: цель встаёт на столько рисков от входа; число запоминается для новых позиций */
function setRR(e: Event) {
  const cur = d.value
  const input = e.target as HTMLInputElement
  if (!cur) return
  const v = parseFloat(input.value.replace(',', '.'))
  if (!(v > 0 && v <= 100)) {
    input.value = rr.value
    return
  }
  app.posRR = v
  const r = applyRR(cur.pts[0].p, cur.pts[2].p, cur.pts[1].p, cur.type as 'long' | 'short', v, 'stop', step())
  props.layer.setPosition(cur.pts[0].p, r.stop, r.target)
  input.value = rr.value
}

/** Enter завершает ввод и возвращает клавиатуру графику (стрелки снова двигают позицию) */
function blur(e: Event) {
  ;(e.target as HTMLInputElement).blur()
}

function editText() {
  const cur = d.value?.text ?? ''
  const next = prompt(t('Подпись к линии (пусто — убрать)'), cur)
  if (next !== null) props.layer.setStyle({ text: next.trim().slice(0, 60) })
}
function makeDefault() {
  props.layer.saveAsDefault()
  toast(t('Стиль сохранён: новые рисунки этого инструмента будут такими же'))
}
async function copyTrade() {
  const text = props.layer.copyText()
  try {
    await navigator.clipboard.writeText(text)
    toast(t('Позиция скопирована текстом'))
  } catch {
    prompt(t('Скопируйте вручную'), text)
  }
}
function duplicate() {
  if (props.layer.copySelected()) props.layer.paste()
}
</script>

<template>
  <Teleport to="body">
  <div v-if="d && pos" ref="bar" class="dbar" :class="{ moving }" :style="pos" @pointerdown.stop @keydown.stop>
    <button
      class="grip"
      :title="app.drawBarAt ? t('Потяните, чтобы передвинуть панель. Двойное нажатие — вернуть на место по умолчанию') : t('Потяните, чтобы передвинуть панель')"
      :aria-label="t('Передвинуть панель')"
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
        :aria-label="t('Цвет {color}', { color: c })"
        @click="layer.setStyle({ color: c })"
      />
      <label class="swatch custom" :title="t('Свой цвет')">
        <input type="color" :value="d.color" @change="layer.setStyle({ color: ($event.target as HTMLInputElement).value })" />
      </label>
    </div>

    <div v-if="position" class="row prices">
      <label :title="t('Цена входа')">
        <span>{{ t('Вход') }}</span>
        <input class="field" inputmode="decimal" :value="fmt(d.pts[0].p)" @change="setPrice(0, $event)" @keydown.enter="blur" />
      </label>
      <label :title="t('Стоп-лосс')">
        <span class="down">{{ t('Стоп') }}</span>
        <input class="field" inputmode="decimal" :value="fmt(d.pts[2].p)" @change="setPrice(2, $event)" @keydown.enter="blur" />
      </label>
      <label :title="t('Тейк-профит')">
        <span class="up">{{ t('Тейк') }}</span>
        <input class="field" inputmode="decimal" :value="fmt(d.pts[1].p)" @change="setPrice(1, $event)" @keydown.enter="blur" />
      </label>
      <div class="rr">
        <label :title="t('Соотношение прибыли к риску: цель — на столько стопов от входа. Новые позиции получают это же значение')">
          <span>R/R</span>
          <input class="field" inputmode="decimal" :value="rr" @change="setRR" @keydown.enter="blur" />
        </label>
        <button
          class="btn sm lock"
          :class="{ on: app.rrLock }"
          :title="app.rrLock ? t('Привязка R/R включена: тянешь стоп — тейк следует за ним, и наоборот. Нажмите, чтобы двигать их отдельно') : t('Привязка R/R выключена: стоп и тейк двигаются отдельно. Нажмите, чтобы связать их')"
          :aria-pressed="app.rrLock"
          @click="app.rrLock = !app.rrLock"
        >
          <Icon :name="app.rrLock ? 'lock' : 'unlock'" :size="14" />
        </button>
      </div>
    </div>

    <div class="row">
      <template v-if="styled">
        <button
          v-for="w in WIDTHS"
          :key="w"
          class="btn sm"
          :class="{ on: (d.width ?? 1) === w }"
          :title="t('Толщина {n}', { n: w })"
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
          :title="t(s.label)"
          @click="layer.setStyle({ dash: s.id })"
        >
          <svg width="18" height="14" viewBox="0 0 18 14" aria-hidden="true">
            <path d="M1 7h16" stroke="currentColor" stroke-width="1.6" :stroke-dasharray="s.pattern" />
          </svg>
        </button>
        <span class="sep" />
        <button v-if="hasText(d.type)" class="btn sm" :class="{ on: !!d.text }" :title="t('Подпись')" @click="editText"><Icon name="text" :size="15" /></button>
        <button class="btn sm" :title="t('Сделать стилем по умолчанию для этого инструмента')" @click="makeDefault"><Icon name="pin" :size="15" /></button>
      </template>
      <template v-if="isText">
        <button class="btn sm" :title="t('Изменить текст (двойной щелчок)')" @click="layer.editText(d)"><Icon name="pencil" :size="15" /></button>
        <select class="field vis" :title="t('Размер шрифта')" :value="d.size ?? 12" @change="layer.setTextStyle({ size: Number(($event.target as HTMLSelectElement).value) })">
          <option v-for="n in TEXT_SIZES" :key="n" :value="n">{{ n }} px</option>
        </select>
        <button class="btn sm" :class="{ on: !!d.bg }" :title="t('Подложка под текстом')" @click="layer.setTextStyle({ bg: !d.bg })"><Icon name="rect" :size="15" /></button>
        <button class="btn sm" :class="{ on: !!d.pin }" :title="t('Закрепить на экране: текст не уезжает при прокрутке и виден в том же месте на всех интервалах')" @click="layer.togglePin()">
          <Icon name="pin" :size="15" />
        </button>
        <span class="sep" />
      </template>
      <template v-if="position">
        <b class="kind" :class="d.type === 'long' ? 'up' : 'down'">{{ d.type === 'long' ? t('Лонг') : t('Шорт') }}</b>
        <span v-if="posSize" class="muted" :title="t('По депозиту и риску на сделку из настроек «Шрифты, таймер, размер позиции»')">{{ posSize }}</span>
        <button v-else class="btn sm muted" :title="t('Задать депозит и риск на сделку — появится объём позиции')" @click="app.viewOpen = true">{{ t('объём?') }}</button>
        <span class="grow" />
      </template>
      <select class="field vis" :title="t('На каких интервалах показывать')" :value="vis" @change="layer.setVisibility(($event.target as HTMLSelectElement).value as Visibility)">
        <option v-for="v in VIS" :key="v.id" :value="v.id">{{ t(v.label) }}</option>
      </select>
      <template v-if="position">
        <button class="btn sm" :title="t('Вставить текст сделки из буфера: ТВХ / SL / TP разложатся по этой позиции')" @click="pasteFromClipboard()"><Icon name="paste" :size="16" /></button>
        <button class="btn sm" :title="t('Скопировать позицию текстом: вход, стоп, тейк')" @click="copyTrade"><Icon name="share" :size="16" /></button>
      </template>
      <button class="btn sm" :title="t('Дублировать (или тяните с Ctrl)')" @click="duplicate"><Icon name="copy" :size="15" /></button>
      <button class="btn sm" :title="t('Удалить (Delete)')" @click="layer.removeSelected()"><Icon name="trash" :size="15" /></button>
    </div>
    <p v-if="position && !isPhone" class="hint muted">{{ t('Ctrl+V — вставить текст сделки (ТВХ / SL / TP), Ctrl+C — скопировать его') }}</p>
  </div>
  </Teleport>
</template>

<style scoped>
.dbar {
  /* поверх всего приложения, но под окнами-диалогами и выпадающими меню */
  position: fixed;
  z-index: 40;
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
.rr {
  display: flex;
  align-items: flex-end;
  gap: 2px;
}
.rr .field {
  width: 52px;
}
.lock {
  height: 26px;
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
