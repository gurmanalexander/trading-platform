<script setup lang="ts">
import { computed } from 'vue'
import Dropdown from './Dropdown.vue'
import { visibleTfs, type Drawing } from '../stores/drawings'
import type { DrawingsLayer } from '../chart/drawings'
import { ALL_TFS } from '../lib/visibility'
import { TIMEFRAMES } from '../lib/timeframes'
import { toast } from '../stores/app'
import { t } from '../lib/i18n'

// Видимость рисунка по интервалам — как в TradingView: каждый интервал отмечается отдельно,
// группой (минуты, часы, дни и старше) или готовым вариантом.
const props = defineProps<{ layer: DrawingsLayer; d: Drawing }>()

const DAY = 86400
const GROUPS = [
  { label: 'Минуты', test: (sec: number) => sec < 3600 },
  { label: 'Часы', test: (sec: number) => sec >= 3600 && sec < DAY },
  { label: 'Дни и старше', test: (sec: number) => sec >= DAY },
].map((g) => ({ label: g.label, tfs: TIMEFRAMES.filter((f) => g.test(f.sec)) }))

const shown = computed(() => visibleTfs(props.d))
const cur = computed(() => {
  void props.d
  return props.layer.tfSec()
})
const curLabel = computed(() => TIMEFRAMES.find((f) => f.sec === cur.value)?.label ?? '')
const labelOf = (sec: number) => TIMEFRAMES.find((f) => f.sec === sec)?.label ?? ''

const sameAs = (set: number[]) => set.length === shown.value.length && set.every((sec) => shown.value.includes(sec))
const INTRADAY = ALL_TFS.filter((sec) => sec < DAY)
const DAILY = ALL_TFS.filter((sec) => sec >= DAY)
const PRESETS = computed(() => [
  { label: t('все ТФ'), set: ALL_TFS },
  { label: t('< 1Д'), set: INTRADAY },
  { label: t('≥ 1Д'), set: DAILY },
  { label: t('только {tf}', { tf: curLabel.value }), set: [cur.value] },
])

/** Подпись на кнопке: группа, если совпадает, иначе перечень интервалов */
const summary = computed(() => {
  const preset = PRESETS.value.find((p) => sameAs(p.set))
  if (preset) return preset.label
  return shown.value.length <= 3 ? shown.value.map(labelOf).join(', ') : t('{n} ТФ', { n: shown.value.length })
})

function apply(set: number[]) {
  if (!set.length) {
    toast(t('Хотя бы один интервал должен остаться'))
    return
  }
  props.layer.setTfs(set)
  if (!set.includes(cur.value)) toast(t('Рисунок скрыт на этом интервале ({tf})', { tf: curLabel.value }))
}

function toggleTf(sec: number) {
  apply(shown.value.includes(sec) ? shown.value.filter((x) => x !== sec) : [...shown.value, sec])
}

/** Группа отмечена целиком — снимаем всю, иначе отмечаем всю */
const groupState = (tfs: { sec: number }[]) => {
  const n = tfs.filter((f) => shown.value.includes(f.sec)).length
  return n === tfs.length ? 'on' : n ? 'some' : 'off'
}
function toggleGroup(tfs: { sec: number }[]) {
  const secs = tfs.map((f) => f.sec)
  apply(groupState(tfs) === 'on' ? shown.value.filter((x) => !secs.includes(x)) : [...new Set([...shown.value, ...secs])])
}
</script>

<template>
  <Dropdown align="right">
    <template #trigger="{ toggle }">
      <button class="field vis-btn" :title="t('На каких интервалах показывать')" @click="toggle">{{ summary }} <span class="caret">▾</span></button>
    </template>
    <div class="vm">
      <div class="menu-title">{{ t('Видимость на интервалах') }}</div>
      <div class="presets">
        <button v-for="p in PRESETS" :key="p.label" class="chip" :class="{ on: sameAs(p.set) }" @click="apply(p.set)">{{ p.label }}</button>
      </div>
      <div v-for="g in GROUPS" :key="g.label" class="grp">
        <label class="grp-name">
          <input
            type="checkbox"
            :checked="groupState(g.tfs) === 'on'"
            :indeterminate.prop="groupState(g.tfs) === 'some'"
            @change.prevent="toggleGroup(g.tfs)"
          />
          {{ t(g.label) }}
        </label>
        <div class="tfs">
          <button
            v-for="f in g.tfs"
            :key="f.id"
            class="chip"
            :class="{ on: shown.includes(f.sec), here: f.sec === cur }"
            :title="f.sec === cur ? t('Интервал этого графика') : undefined"
            @click="toggleTf(f.sec)"
          >
            {{ f.label }}
          </button>
        </div>
      </div>
    </div>
  </Dropdown>
</template>

<style scoped>
.vis-btn {
  width: auto;
  height: 26px;
  padding: 0 6px;
  font-size: 12px;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
}
.caret {
  font-size: 10px;
  color: var(--muted);
}
.vm {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 2px 4px 6px;
  max-width: 300px;
}
.menu-title {
  padding: 4px 2px 0;
  font-size: 11px;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.presets,
.tfs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.grp {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-top: 6px;
  border-top: 1px solid var(--border);
}
.grp-name {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  cursor: pointer;
}
.grp-name input {
  accent-color: var(--accent);
  width: 15px;
  height: 15px;
  margin: 0;
}
.chip {
  height: 26px;
  min-width: 34px;
  padding: 0 8px;
  border-radius: 5px;
  border: 1px solid var(--border);
  color: var(--muted);
  font-size: 12px;
  white-space: nowrap;
}
.chip:hover {
  color: var(--text);
}
.chip.on {
  color: var(--sel);
  border-color: var(--sel-border);
  background: var(--sel-bg);
}
/* интервал, на котором сейчас смотрят */
.chip.here {
  font-weight: 600;
}
@media (pointer: coarse) {
  .chip {
    height: 32px;
    min-width: 40px;
  }
}
</style>
