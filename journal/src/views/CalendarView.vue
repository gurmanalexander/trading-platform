<script setup lang="ts">
import { computed } from 'vue'
import { dayIndex, dayStart, type DayStat } from '../core/stats'
import { fmtDate, fmtMoney, fmtShort } from '../lib/format'
import { locale, plural, t } from '../lib/i18n'
import { prefs, tzMin } from '../store/journal'
import { days, periodStart, ui } from '../store/view'

/** Календарь: месяц — сетка недель, в клетке итог дня. Цвет клетки — знак и величина итога */
interface Cell {
  day: number
  n: number
  stat?: DayStat
  future: boolean
}
interface Month {
  key: string
  title: string
  net: number
  trades: number
  weeks: { cells: (Cell | null)[]; net: number; trades: number }[]
}

/** «Ноябрь 2026» — с заглавной буквы и без «г.» */
function monthTitle(y: number, m: number): string {
  const name = new Date(Date.UTC(y, m, 15)).toLocaleDateString(locale(), { month: 'long', timeZone: 'UTC' })
  return name.charAt(0).toUpperCase() + name.slice(1) + ' ' + y
}

const WEEKDAYS = () => [t('Пн'), t('Вт'), t('Ср'), t('Чт'), t('Пт'), t('Сб'), t('Вс')]

const months = computed<Month[]>(() => {
  const map = new Map(days.value.map((d) => [d.day, d]))
  const today = dayIndex(ui.now, tzMin)
  const from = periodStart(prefs.period, ui.now)
  const first = from != null ? dayIndex(from, tzMin) : (days.value[0]?.day ?? today)
  const out: Month[] = []
  // идём по месяцам от текущего назад; локальные даты считаем через сдвинутое время
  const local = (day: number) => new Date(day * 86_400_000)
  let y = local(today).getUTCFullYear()
  let m = local(today).getUTCMonth()
  for (let guard = 0; guard < 36; guard++) {
    const start = Math.floor(Date.UTC(y, m, 1) / 86_400_000)
    const end = Math.floor(Date.UTC(y, m + 1, 0) / 86_400_000)
    if (end < first) break
    const month: Month = { key: `${y}-${m}`, title: monthTitle(y, m), net: 0, trades: 0, weeks: [] }
    const lead = (start + 3) % 7 // сколько пустых клеток до первого числа (неделя с понедельника)
    let week: Month['weeks'][number] = { cells: Array(lead).fill(null), net: 0, trades: 0 }
    for (let d = start; d <= end; d++) {
      const stat = map.get(d)
      week.cells.push({ day: d, n: d - start + 1, stat, future: d > today })
      if (stat) {
        week.net += stat.net
        week.trades += stat.trades
        month.net += stat.net
        month.trades += stat.trades
      }
      if (week.cells.length === 7) {
        month.weeks.push(week)
        week = { cells: [], net: 0, trades: 0 }
      }
    }
    if (week.cells.length) {
      while (week.cells.length < 7) week.cells.push(null)
      month.weeks.push(week)
    }
    out.push(month)
    if (--m < 0) {
      m = 11
      y--
    }
  }
  return out
})

/** Насыщенность заливки: от слабой к сильной по величине итога относительно самого большого дня */
const max = computed(() => Math.max(1e-9, ...days.value.map((d) => Math.abs(d.net))))
function tint(stat?: DayStat) {
  if (!stat || !stat.net) return undefined
  const k = 10 + Math.round(Math.sqrt(Math.abs(stat.net) / max.value) * 38)
  return { background: `color-mix(in srgb, var(${stat.net > 0 ? '--up' : '--down'}) ${k}%, transparent)` }
}
const hint = (c: Cell) =>
  c.stat ? `${fmtDate(dayStart(c.day, tzMin), true)} · ${fmtMoney(c.stat.net)} · ${plural(c.stat.trades, ['сделка', 'сделки', 'сделок'], ['trade', 'trades'])}` : fmtDate(dayStart(c.day, tzMin), true)

function pick(c: Cell) {
  if (!c.stat) return
  ui.day = c.day
  ui.tab = 'trades'
}
const tone = (v: number) => (v > 0 ? 'up' : v < 0 ? 'down' : '')
</script>

<template>
  <div class="cal">
    <section v-for="mo in months" :key="mo.key" class="card">
      <header class="cal-head">
        <h3>{{ mo.title }}</h3>
        <span class="muted">
          {{ plural(mo.trades, ['сделка', 'сделки', 'сделок'], ['trade', 'trades']) }} · <b :class="tone(mo.net)">{{ fmtMoney(mo.net) }}</b>
        </span>
      </header>
      <div class="cal-grid" role="grid">
        <div v-for="w in WEEKDAYS()" :key="w" class="cal-wd muted">{{ w }}</div>
        <div class="cal-wd muted wk">{{ t('Неделя') }}</div>
        <template v-for="(week, wi) in mo.weeks" :key="wi">
          <template v-for="(c, ci) in week.cells" :key="ci">
            <div v-if="!c" class="cal-cell empty" />
            <button v-else class="cal-cell" :class="{ has: c.stat, future: c.future }" :style="tint(c.stat)" :title="hint(c)" :disabled="!c.stat" @click="pick(c)">
              <span class="cal-n">{{ c.n }}</span>
              <template v-if="c.stat">
                <span class="cal-v">{{ fmtShort(c.stat.net) }}</span>
                <span class="cal-t muted">{{ c.stat.trades }}</span>
              </template>
            </button>
          </template>
          <div class="cal-cell wk">
            <template v-if="week.trades">
              <span class="cal-v" :class="tone(week.net)">{{ fmtShort(week.net) }}</span>
              <span class="cal-t muted">{{ week.trades }}</span>
            </template>
          </div>
        </template>
      </div>
    </section>
    <p v-if="!months.length" class="card muted none">{{ t('За этот период сделок нет') }}</p>
  </div>
</template>

<style>
.cal {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 520px), 1fr));
  gap: 12px;
}
.cal-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 10px;
}
.cal-head h3 {
  margin: 0;
  font-size: 14px;
}
.cal-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr)) minmax(0, 0.9fr);
  gap: 4px;
}
.cal-wd {
  font-size: 11px;
  text-align: center;
  padding-bottom: 2px;
}
.cal-cell {
  position: relative;
  min-height: 54px;
  border-radius: 8px;
  background: var(--panel-2);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 14px 2px 4px;
  gap: 0;
  color: var(--text);
  cursor: default;
}
.cal-cell.empty {
  background: transparent;
}
.cal-cell.future {
  opacity: 0.4;
}
.cal-cell.has {
  cursor: pointer;
}
.cal-cell.has:hover {
  outline: 2px solid var(--focus);
  outline-offset: -2px;
}
.cal-cell.wk {
  background: transparent;
  border: 1px dashed var(--border);
  padding-top: 4px;
}
.cal-n {
  position: absolute;
  top: 4px;
  left: 6px;
  font-size: 11px;
  color: var(--muted);
}
.cal-v {
  font-size: 13px;
  font-weight: 600;
}
.cal-t {
  font-size: 10.5px;
}
@media (max-width: 719px) {
  .cal-grid {
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 3px;
  }
  .wk {
    display: none !important;
  }
  .cal-cell {
    min-height: 48px;
    border-radius: 6px;
  }
  .cal-v {
    font-size: 11.5px;
  }
}
</style>
