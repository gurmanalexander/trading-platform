<script setup lang="ts">
import { computed } from 'vue'
import Icon from './Icon.vue'
import { DRAW_COLORS, defaultVisibility, type Dash, type Visibility } from '../stores/drawings'
import { hasLineStyle, hasText, isPosition, type DrawingsLayer } from '../chart/drawings'
import { riskReward } from '../chart/position'
import { toast } from '../stores/app'

// Панель выбранного рисунка: у линий — цвет, толщина, вид и подпись; у позиции — вход, стоп и цель числами
const props = defineProps<{ layer: DrawingsLayer; maxX: number; precision: number }>()

const d = computed(() => props.layer.selected())
const styled = computed(() => !!d.value && hasLineStyle(d.value.type))
const position = computed(() => !!d.value && isPosition(d.value.type) && d.value.pts.length >= 3)
const pos = computed(() => {
  const a = props.layer.anchor.value
  if (!a) return null
  const width = position.value ? 330 : 250
  return { left: Math.max(6, Math.min(props.maxX - width, a.x)) + 'px', top: Math.max(34, a.y - (styled.value ? 84 : position.value ? 108 : 46)) + 'px' }
})

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
function duplicate() {
  if (props.layer.copySelected()) props.layer.paste()
}
</script>

<template>
  <div v-if="d && pos" class="dbar" :style="pos" @pointerdown.stop @keydown.stop>
    <div v-if="styled" class="row">
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
      <template v-if="position">
        <b class="kind" :class="d.type === 'long' ? 'up' : 'down'">{{ d.type === 'long' ? 'Лонг' : 'Шорт' }}</b>
        <span class="muted">R/R {{ rr }}</span>
        <span class="grow" />
      </template>
      <select class="field vis" title="На каких интервалах показывать" :value="vis" @change="layer.setVisibility(($event.target as HTMLSelectElement).value as Visibility)">
        <option v-for="v in VIS" :key="v.id" :value="v.id">{{ v.label }}</option>
      </select>
      <button class="btn sm" title="Дублировать (или тяните с Ctrl)" @click="duplicate"><Icon name="copy" :size="15" /></button>
      <button class="btn sm" title="Удалить (Delete)" @click="layer.removeSelected()"><Icon name="trash" :size="15" /></button>
    </div>
    <p v-if="position" class="hint muted">Ctrl+V — вставить текст сделки (ТВХ / SL / TP), Ctrl+C — скопировать его</p>
  </div>
</template>

<style scoped>
.dbar {
  position: absolute;
  z-index: 7;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 5px 6px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: var(--shadow);
}
.row {
  display: flex;
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
  .swatch {
    width: 26px;
    height: 26px;
  }
  .btn.sm {
    height: 30px;
    min-width: 28px;
  }
  .prices .field {
    width: 92px;
    height: 32px;
  }
}
</style>
