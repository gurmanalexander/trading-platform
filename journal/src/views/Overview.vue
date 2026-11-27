<script setup lang="ts">
import { computed } from 'vue'
import ColumnBars, { type Column } from '../components/ColumnBars.vue'
import EquityChart from '../components/EquityChart.vue'
import RowBars, { type Row } from '../components/RowBars.vue'
import { HOLD_BUCKETS, byHold, byHour, bySide, bySymbol, byTag, byWeekday, dayIndex, dayStart, type Group } from '../core/stats'
import { netOf } from '../core/types'
import { fmtDate, fmtMoney, fmtPct, fmtPrice, fmtQty, fmtRatio, fmtShort, fmtSpan } from '../lib/format'
import { locale, plural, t } from '../lib/i18n'
import { prefs, snapshots, tagsOf, tzMin } from '../store/journal'
import { accountOf, curve, days, periodStart, periodTrades, shownAccounts, summary, ui } from '../store/view'

const s = summary

const tone = (v: number) => (v > 0 ? 'up' : v < 0 ? 'down' : '')

/** Столбики по дням; на длинном периоде дни складываются в недели, чтобы столбики оставались различимыми */
const dayCols = computed<Column[]>(() => {
  const list = days.value
  if (!list.length) return []
  const today = dayIndex(ui.now, tzMin)
  const from = periodStart(prefs.period, ui.now)
  const first = Math.min(list[0].day, from != null ? dayIndex(from, tzMin) : list[0].day)
  const map = new Map(list.map((d) => [d.day, d]))
  const span = today - first + 1
  const step = span > 100 ? 7 : 1
  const out: Column[] = []
  for (let d = first; d <= today; d += step) {
    let net = 0
    let trades = 0
    let wins = 0
    for (let k = 0; k < step; k++) {
      const x = map.get(d + k)
      if (x) {
        net += x.net
        trades += x.trades
        wins += x.wins
      }
    }
    const a = dayStart(d, tzMin)
    const title = step === 1 ? fmtDate(a, true) : `${fmtDate(a)} – ${fmtDate(dayStart(Math.min(d + 6, today), tzMin), true)}`
    out.push({ key: d, label: new Date(a).toLocaleDateString(locale(), { day: 'numeric', month: 'numeric' }), title, net, trades, wins })
  }
  return out
})
const dayStep = computed(() => (dayCols.value.length > 1 && Number(dayCols.value[1].key) - Number(dayCols.value[0].key) === 7 ? 7 : 1))

const row = (g: Group, label: string): Row => ({ key: g.key, label, net: g.net, trades: g.trades, wins: g.wins })

/** Монеты: лучшие и худшие по итогу, не больше восьми строк */
const symbols = computed<Row[]>(() => {
  const all = bySymbol(periodTrades.value)
  const pick = all.length <= 8 ? all : [...all.slice(0, 4), ...all.slice(-4)]
  return pick.map((g) => row(g, g.key))
})
const symbolCount = computed(() => bySymbol(periodTrades.value).length)

const sides = computed<Row[]>(() => bySide(periodTrades.value).map((g) => row(g, g.key === 'long' ? t('Лонг') : t('Шорт'))))

const HOLD_LABELS = () => [t('до 5 мин'), t('5–15 мин'), t('15–60 мин'), t('1–4 ч'), t('4–24 ч'), t('дольше суток')]
const holds = computed<Row[]>(() => {
  const labels = HOLD_LABELS()
  return byHold(periodTrades.value).map((g, i) => row(g, labels[i] ?? String(HOLD_BUCKETS[i])))
})

const WEEKDAYS = () => [t('Пн'), t('Вт'), t('Ср'), t('Чт'), t('Пт'), t('Сб'), t('Вс')]
const WEEKDAYS_FULL = () => [t('Понедельник'), t('Вторник'), t('Среда'), t('Четверг'), t('Пятница'), t('Суббота'), t('Воскресенье')]
const weekdays = computed<Column[]>(() => {
  const short = WEEKDAYS()
  const full = WEEKDAYS_FULL()
  return byWeekday(periodTrades.value, tzMin).map((g, i) => ({ key: i, label: short[i], title: full[i], net: g.net, trades: g.trades, wins: g.wins }))
})
const hours = computed<Column[]>(() =>
  byHour(periodTrades.value, tzMin).map((g, i) => ({ key: i, label: i % 3 === 0 ? String(i) : '', title: t('Вход в {a}:00–{b}:00', { a: i, b: i + 1 }), net: g.net, trades: g.trades, wins: g.wins })),
)

const tags = computed<Row[]>(() =>
  byTag(periodTrades.value, tagsOf)
    .slice(0, 8)
    .map((g) => row(g, g.key)),
)

/** Открытые позиции и средства показываемых счетов */
const positions = computed(() => shownAccounts.value.flatMap((id) => (snapshots[id]?.positions ?? []).map((p) => ({ ...p, acct: id }))))
const equity = computed(() => shownAccounts.value.reduce((sum, id) => sum + (snapshots[id]?.equity ?? 0), 0))
const upnl = computed(() => positions.value.reduce((sum, p) => sum + p.upnl, 0))

function pickDay(key: string | number) {
  if (dayStep.value !== 1) return
  ui.day = Number(key)
  ui.tab = 'trades'
}
function pickSymbol(sym: string) {
  ui.sym = sym
  ui.tab = 'trades'
}
function pickSide(key: string) {
  ui.side = key === 'long' ? 1 : -1
  ui.tab = 'trades'
}
function pickTag(tag: string) {
  ui.tag = tag
  ui.tab = 'trades'
}
</script>

<template>
  <div class="ov">
    <section class="card hero">
      <div class="hero-head">
        <div>
          <div class="cap">{{ t('Чистый результат') }}</div>
          <div class="hero-num" :class="tone(s.net)">{{ fmtMoney(s.net) }} <small>USD</small></div>
          <div class="muted hero-sub">
            {{ plural(s.trades, ['сделка', 'сделки', 'сделок'], ['trade', 'trades']) }} · {{ t('оборот {v}', { v: fmtShort(s.volume, false) }) }} ·
            {{ t('до комиссий {v}', { v: fmtMoney(s.gross) }) }}
          </div>
        </div>
        <div v-if="equity" class="hero-side">
          <div class="cap">{{ t('Средства на счетах') }}</div>
          <div class="side-num">{{ fmtMoney(equity, { sign: false }) }}</div>
          <div v-if="positions.length" class="muted hero-sub">
            {{ t('в открытых позициях') }} <span :class="tone(upnl)">{{ fmtMoney(upnl) }}</span>
          </div>
        </div>
      </div>
      <EquityChart :points="curve" :height="230" />
    </section>

    <section class="kpis">
      <div class="card kpi">
        <div class="cap">{{ t('Прибыльных сделок') }}</div>
        <div class="kpi-num">{{ s.trades ? fmtPct(s.winRate) : '—' }}</div>
        <div class="meter" role="img" :aria-label="t('Доля прибыльных сделок')"><span :style="{ width: s.winRate * 100 + '%' }" /></div>
        <div class="muted kpi-sub">{{ t('{w} в плюс · {l} в минус', { w: s.wins, l: s.losses }) }}</div>
      </div>
      <div class="card kpi">
        <div class="cap">{{ t('Профит-фактор') }}</div>
        <div class="kpi-num">{{ s.trades ? fmtRatio(s.profitFactor) : '—' }}</div>
        <div class="muted kpi-sub">{{ t('прибыль ÷ убыток; больше 1 — в плюсе') }}</div>
      </div>
      <div class="card kpi">
        <div class="cap">{{ t('Средняя сделка') }}</div>
        <div class="kpi-num" :class="tone(s.expectancy)">{{ s.trades ? fmtMoney(s.expectancy) : '—' }}</div>
        <div class="muted kpi-sub">{{ t('плюс {w} · минус {l}', { w: fmtMoney(s.avgWin, { sign: false }), l: fmtMoney(s.avgLoss, { sign: false }) }) }}</div>
      </div>
      <div class="card kpi">
        <div class="cap">{{ t('Макс. просадка') }}</div>
        <div class="kpi-num" :class="s.maxDrawdown > 0 ? 'down' : ''">{{ s.trades ? fmtMoney(-s.maxDrawdown) : '—' }}</div>
        <div class="muted kpi-sub">{{ t('серии: {w} в плюс, {l} в минус', { w: s.winStreak, l: s.lossStreak }) }}</div>
      </div>
      <div class="card kpi">
        <div class="cap">{{ t('Комиссии и фандинг') }}</div>
        <div class="kpi-num">{{ s.trades ? fmtMoney(-s.fees + s.funding) : '—' }}</div>
        <div class="muted kpi-sub">{{ t('комиссии {f} · фандинг {u}', { f: fmtMoney(-s.fees), u: fmtMoney(s.funding) }) }}</div>
      </div>
      <div class="card kpi">
        <div class="cap">{{ t('Время в сделке') }}</div>
        <div class="kpi-num">{{ s.trades ? fmtSpan(s.avgHold) : '—' }}</div>
        <div class="muted kpi-sub">{{ t('в плюс {w} · в минус {l}', { w: fmtSpan(s.avgHoldWin), l: fmtSpan(s.avgHoldLoss) }) }}</div>
      </div>
      <div class="card kpi">
        <div class="cap">{{ t('Лучшая сделка') }}</div>
        <div class="kpi-num up">{{ s.best ? fmtMoney(netOf(s.best)) : '—' }}</div>
        <button v-if="s.best" class="muted kpi-sub linkish" @click="ui.open = s.best!.id">{{ s.best.sym }} · {{ fmtDate(s.best.close) }}</button>
      </div>
      <div class="card kpi">
        <div class="cap">{{ t('Худшая сделка') }}</div>
        <div class="kpi-num down">{{ s.worst ? fmtMoney(netOf(s.worst)) : '—' }}</div>
        <button v-if="s.worst" class="muted kpi-sub linkish" @click="ui.open = s.worst!.id">{{ s.worst.sym }} · {{ fmtDate(s.worst.close) }}</button>
      </div>
    </section>

    <section v-if="positions.length" class="card">
      <h3>{{ t('Открытые позиции') }}</h3>
      <div class="opos-list">
        <div v-for="p in positions" :key="p.acct + p.sym + p.side" class="opos">
          <b>{{ p.sym }}</b>
          <span class="pill" :class="p.side > 0 ? 'long' : 'short'">{{ (p.side > 0 ? 'Long' : 'Short') + (p.leverage ? ' ' + p.leverage + '×' : '') }}</span>
          <span class="muted">{{ fmtQty(p.qty) }} @ {{ fmtPrice(p.entry) }}</span>
          <span class="muted opos-acct">{{ accountOf(p.acct)?.label }}</span>
          <span class="grow" />
          <span :class="tone(p.upnl)">{{ fmtMoney(p.upnl) }}</span>
        </div>
      </div>
    </section>

    <section class="grid">
      <div class="card wide">
        <h3>{{ dayStep === 1 ? t('Результат по дням') : t('Результат по неделям') }}</h3>
        <ColumnBars v-if="dayCols.length" :items="dayCols" :height="170" :label="t('Результат по дням')" @pick="pickDay" />
        <p v-else class="muted none">{{ t('За этот период закрытых сделок нет') }}</p>
      </div>
      <div class="card">
        <h3>
          {{ t('Монеты') }} <span v-if="symbolCount > 8" class="muted h-note">{{ t('4 лучших и 4 худших из {n}', { n: symbolCount }) }}</span>
        </h3>
        <RowBars v-if="symbols.length" :items="symbols" clickable @pick="pickSymbol" />
        <p v-else class="muted none">{{ t('Нет данных') }}</p>
      </div>
      <div class="card">
        <h3>{{ t('Лонг и шорт') }}</h3>
        <RowBars :items="sides" clickable @pick="pickSide" />
        <h3 class="mt">{{ t('Время удержания') }}</h3>
        <RowBars :items="holds" />
      </div>
      <div class="card">
        <h3>{{ t('Дни недели') }} <span class="muted h-note">{{ t('по дню закрытия') }}</span></h3>
        <ColumnBars :items="weekdays" :height="150" :label="t('Результат по дням недели')" />
      </div>
      <div class="card">
        <h3>{{ t('Часы входа') }} <span class="muted h-note">{{ t('ваше местное время') }}</span></h3>
        <ColumnBars :items="hours" :height="150" :label="t('Результат по часу входа')" />
      </div>
      <div v-if="tags.length" class="card wide">
        <h3>{{ t('Метки') }}</h3>
        <RowBars :items="tags" clickable @pick="pickTag" />
      </div>
    </section>
  </div>
</template>

<style>
.ov {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.card {
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--panel);
  padding: 14px;
  min-width: 0;
}
.card h3 {
  margin: 0 0 10px;
  font-size: 13px;
  font-weight: 600;
}
.card h3.mt {
  margin-top: 16px;
}
.h-note {
  font-weight: 400;
  font-size: 12px;
  margin-left: 4px;
}
.cap {
  color: var(--muted);
  font-size: 12px;
}
.hero-head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}
.hero-num {
  font-size: 34px;
  font-weight: 650;
  letter-spacing: -0.02em;
  line-height: 1.15;
}
.hero-num small {
  font-size: 14px;
  font-weight: 500;
  color: var(--muted);
  letter-spacing: 0;
}
.hero-sub {
  font-size: 12px;
  margin-top: 2px;
}
.hero-side {
  text-align: right;
}
.side-num {
  font-size: 20px;
  font-weight: 600;
}
.kpis {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}
.kpi {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 12px 14px;
}
.kpi-num {
  font-size: 22px;
  font-weight: 620;
  letter-spacing: -0.01em;
}
.kpi-sub {
  font-size: 12px;
  text-align: left;
}
.linkish:hover {
  color: var(--text);
  text-decoration: underline;
}
.meter {
  height: 4px;
  border-radius: 2px;
  background: color-mix(in srgb, var(--down) 55%, transparent);
  overflow: hidden;
  margin: 3px 0 2px;
}
.meter span {
  display: block;
  height: 100%;
  background: var(--up);
  border-right: 2px solid var(--panel);
}
.grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.grid .wide {
  grid-column: 1 / -1;
}
.none {
  margin: 0;
  padding: 18px 0;
  text-align: center;
}
.opos-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.opos {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 30px;
  flex-wrap: wrap;
}
.opos-acct {
  font-size: 12px;
}
.pill {
  font-size: 11px;
  line-height: 1;
  padding: 3px 6px;
  border-radius: 4px;
  font-weight: 600;
  white-space: nowrap;
}
.pill.long {
  color: var(--up);
  background: color-mix(in srgb, var(--up) 15%, transparent);
}
.pill.short {
  color: var(--down);
  background: color-mix(in srgb, var(--down) 15%, transparent);
}
.grow {
  flex: 1;
}
@media (max-width: 899px) {
  .kpis {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }
  .grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .ov,
  .grid {
    gap: 8px;
  }
  .hero-num {
    font-size: 28px;
  }
  .hero-side {
    text-align: left;
  }
  .kpi-num {
    font-size: 19px;
  }
}
</style>
