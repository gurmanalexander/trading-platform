<script setup lang="ts">
import { computed } from 'vue'
import Icon from './Icon.vue'
import { DRAW_COLORS, type Dash } from '../stores/drawings'
import { hasLineStyle, hasText, isPosition, type DrawingsLayer } from '../chart/drawings'
import { toast } from '../stores/app'

// Панель выбранного рисунка: цвет, толщина, вид линии, подпись
const props = defineProps<{ layer: DrawingsLayer; maxX: number }>()

const d = computed(() => props.layer.selected())
const styled = computed(() => !!d.value && hasLineStyle(d.value.type))
const pos = computed(() => {
  const a = props.layer.anchor.value
  if (!a) return null
  return { left: Math.max(6, Math.min(props.maxX - 250, a.x)) + 'px', top: Math.max(34, a.y - (styled.value ? 84 : d.value && isPosition(d.value.type) ? 78 : 46)) + 'px' }
})

const WIDTHS = [1, 2, 3, 4]
const DASH_LIST: { id: Dash; label: string; pattern: string }[] = [
  { id: 'solid', label: 'Сплошная', pattern: '' },
  { id: 'dashed', label: 'Штриховая', pattern: '5 3' },
  { id: 'dotted', label: 'Пунктирная', pattern: '1.5 3' },
]

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
  <div v-if="d && pos" class="dbar" :style="pos" @pointerdown.stop>
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
      <button class="btn sm" title="Дублировать" @click="duplicate"><Icon name="copy" :size="15" /></button>
      <button class="btn sm" title="Удалить (Delete)" @click="layer.removeSelected()"><Icon name="trash" :size="15" /></button>
    </div>
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
}
</style>
