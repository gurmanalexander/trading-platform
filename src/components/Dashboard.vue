<script setup lang="ts">
import { computed, onBeforeUnmount } from 'vue'
import Icon from './Icon.vue'
import Modal from './Modal.vue'
import { symbolKey, type SymbolRef } from '../types'
import { app, isPhone, setSymbol, showPanel } from '../stores/app'
import { lists, sideOf } from '../stores/watchlist'
import { tickers, useTickers } from '../stores/tickers'
import { dayStats, dayProgress, useDayStats } from '../stores/atr'
import { tracked, currentR, useTrackedPositions } from '../stores/positions'
import { drawings } from '../stores/drawings'
import { alerts, unreadAlerts, waitingAlerts } from '../stores/alerts'
import { settings as screener, total as screened, universe, startAutoRefresh } from '../stores/screener'
import { FRESH_BELOW, SPENT_ABOVE, spentTone } from '../lib/atr'
import { EXCHANGE_NAMES, MARKET_NAMES } from '../types'
import { fmtPct, fmtPrice, precisionOf } from '../lib/format'
import { fmtR } from '../chart/position'

// Обзор: что происходит с монетами из списков — сделки, близость к уровням, исчерпание ATR, оповещения, рынок.
// Все цифры считаются из того, что уже есть в приложении: списки, рисунки, живые цены, дневные свечи.

/** Монеты всех списков без повторов, с названием списка, где монета встретилась первой */
const coins = computed(() => {
  const seen = new Map<string, { ref: SymbolRef; list: string; color: string }>()
  for (const l of lists.all) for (const r of l.items) if (!seen.has(symbolKey(r))) seen.set(symbolKey(r), { ref: r, list: l.name, color: l.color })
  return [...seen.entries()].map(([key, v]) => ({ key, ...v }))
})
const refs = computed(() => coins.value.map((c) => c.ref))
useTickers(() => refs.value)
useDayStats(() => refs.value)
useTrackedPositions(() => refs.value)
// отбор обновляется, пока обзор открыт: нужны его итоги
const stopScreener = startAutoRefresh()
onBeforeUnmount(stopScreener)

const name = (ref: SymbolRef) => ref.symbol.replace(/USDT$/, '')
const price = (key: string, v: number) => fmtPrice(v, precisionOf(key, v))

// ---------- сводка ----------

const sides = computed(() => {
  let long = 0
  let short = 0
  for (const c of coins.value) {
    const s = sideOf(c.ref)
    if (s === 'long') long++
    else if (s === 'short') short++
  }
  return { long, short, none: coins.value.length - long - short }
})

// ---------- сделки ----------

const STATE = { pending: 'ждёт входа', open: 'идёт', tp: 'тейк', sl: 'стоп' } as const
const trades = computed(() =>
  coins.value
    .filter((c) => tracked[c.key])
    .map((c) => {
      const p = tracked[c.key]
      return { ...c, p, r: currentR(c.key) }
    })
    // сначала идущие, потом ждущие входа, потом закрытые
    .sort((a, b) => ['open', 'pending', 'tp', 'sl'].indexOf(a.p.status) - ['open', 'pending', 'tp', 'sl'].indexOf(b.p.status) || (b.r ?? 0) - (a.r ?? 0)),
)
const tradeStats = computed(() => {
  const t = trades.value
  const by = (s: string) => t.filter((x) => x.p.status === s)
  const sum = (list: typeof t) => list.reduce((acc, x) => acc + (x.r ?? 0), 0)
  return { open: by('open').length, pending: by('pending').length, tp: by('tp').length, sl: by('sl').length, openR: sum(by('open')), closedR: sum([...by('tp'), ...by('sl')]) }
})

// ---------- уровни ----------

/** Ближайший горизонтальный уровень каждой монеты и расстояние до него в дневных ATR */
const levels = computed(() => {
  const out: { key: string; ref: SymbolRef; color: string; level: number; dist: number; pct: number }[] = []
  for (const c of coins.value) {
    const last = tickers[c.key]?.last
    const atr = dayStats[c.key]?.atr
    if (!last || !atr) continue
    let best: number | null = null
    for (const d of drawings[c.key] ?? []) {
      if (d.type !== 'hline' && d.type !== 'hray') continue
      if (best === null || Math.abs(d.pts[0].p - last) < Math.abs(best - last)) best = d.pts[0].p
    }
    if (best !== null) out.push({ key: c.key, ref: c.ref, color: c.color, level: best, dist: (best - last) / atr, pct: ((best - last) / last) * 100 })
  }
  return out.sort((a, b) => Math.abs(a.dist) - Math.abs(b.dist))
})
/** «У уровня» — ближе четверти дневного ATR */
const NEAR = 0.25
const nearCount = computed(() => levels.value.filter((l) => Math.abs(l.dist) <= NEAR).length)
const noLevels = computed(() => coins.value.length - levels.value.length)

// ---------- ATR ----------

const spent = computed(() => {
  const out: { key: string; ref: SymbolRef; fromOpen: number; traveled: number }[] = []
  for (const c of coins.value) {
    const s = dayStats[c.key]
    const last = tickers[c.key]?.last
    if (!s || !last) continue
    out.push({ key: c.key, ref: c.ref, ...dayProgress(s, last) })
  }
  return out
})
const fresh = computed(() => spent.value.filter((x) => x.fromOpen < FRESH_BELOW).sort((a, b) => a.fromOpen - b.fromOpen))
const tired = computed(() => spent.value.filter((x) => x.fromOpen > SPENT_ABOVE).sort((a, b) => b.fromOpen - a.fromOpen))

// ---------- движение за сутки ----------

const movers = computed(() =>
  coins.value
    .map((c) => ({ ...c, pct: tickers[c.key]?.changePct }))
    .filter((c): c is typeof c & { pct: number } => typeof c.pct === 'number')
    .sort((a, b) => b.pct - a.pct),
)
const gainers = computed(() => movers.value.filter((m) => m.pct > 0).slice(0, 5))
const losers = computed(() => movers.value.filter((m) => m.pct < 0).slice(-5).reverse())
const breadth = computed(() => ({ up: movers.value.filter((m) => m.pct > 0).length, down: movers.value.filter((m) => m.pct < 0).length }))

// ---------- отбор и оповещения ----------

const market = computed(() => {
  const rows = screened.value
  return { total: rows.length, universe: universe.value, up: rows.filter((r) => r.changePct > 0).length, down: rows.filter((r) => r.changePct < 0).length }
})
const fired = computed(() =>
  alerts
    .filter((a) => !a.active && a.triggeredAt)
    .sort((a, b) => (b.triggeredAt ?? 0) - (a.triggeredAt ?? 0))
    .slice(0, 5),
)
const time = (ms: number) => new Date(ms).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

const close = () => (app.dashboardOpen = false)
function open(ref: SymbolRef) {
  setSymbol(ref)
  close()
}
function go(panel: 'screener' | 'watchlist' | 'alerts') {
  showPanel(panel)
  close()
}
</script>

<template>
  <Modal title="Обзор" :width="1040" @close="close">
    <div class="db scroll">
      <div class="tiles">
        <button class="tile" @click="go('watchlist')">
          <span class="cap"><Icon name="list" :size="15" />Монет в списках</span>
          <b>{{ coins.length }}</b>
          <span class="sub"><i class="up">▲ {{ sides.long }}</i><i class="down">▼ {{ sides.short }}</i><i class="muted">без отметки {{ sides.none }}</i></span>
        </button>
        <div class="tile">
          <span class="cap"><Icon name="trendUp" :size="15" />Сделки</span>
          <b>{{ tradeStats.open }}<small> идёт</small></b>
          <span class="sub">
            <i :class="tradeStats.openR >= 0 ? 'up' : 'down'">{{ fmtR(tradeStats.openR) }} сейчас</i>
            <i class="muted">ждут {{ tradeStats.pending }}</i>
            <i class="muted">тейк {{ tradeStats.tp }} · стоп {{ tradeStats.sl }}</i>
          </span>
        </div>
        <div class="tile">
          <span class="cap"><Icon name="target" :size="15" />У уровня</span>
          <b>{{ nearCount }}</b>
          <span class="sub"><i class="muted">ближе {{ NEAR }} ATR</i><i v-if="noLevels" class="muted">без уровней {{ noLevels }}</i></span>
        </div>
        <div class="tile">
          <span class="cap"><Icon name="gauge" :size="15" />ATR за день</span>
          <b><span class="up">{{ fresh.length }}</span><small> / </small><span class="down">{{ tired.length }}</span></b>
          <span class="sub"><i class="up">запас хода &lt; {{ FRESH_BELOW }}%</i><i class="down">на исходе &gt; {{ SPENT_ABOVE }}%</i></span>
        </div>
        <button class="tile" @click="go('alerts')">
          <span class="cap"><Icon name="bell" :size="15" />Оповещения</span>
          <b>{{ waitingAlerts }}<small> ждут</small></b>
          <span class="sub"><i :class="unreadAlerts ? 'warn' : 'muted'">непрочитанных {{ unreadAlerts }}</i></span>
        </button>
        <button class="tile" @click="go('screener')">
          <span class="cap"><Icon name="funnel" :size="15" />Отбор</span>
          <b>{{ market.total }}<small> из {{ market.universe }}</small></b>
          <span class="sub">
            <i class="up">растут {{ market.up }}</i><i class="down">падают {{ market.down }}</i>
            <i class="muted">{{ EXCHANGE_NAMES[screener.exchange] }} · {{ MARKET_NAMES[screener.market] }} · от {{ screener.minVolume }} млн $</i>
          </span>
        </button>
      </div>

      <div class="cards">
        <section class="card">
          <h3>Сделки <span class="muted">— последняя позиция каждой монеты</span></h3>
          <button v-for="t in trades" :key="t.key" class="row" @click="open(t.ref)">
            <i class="dot" :style="{ background: t.color }" />
            <b>{{ name(t.ref) }}</b>
            <span :class="t.p.type === 'long' ? 'up' : 'down'">{{ t.p.type === 'long' ? 'лонг' : 'шорт' }}</span>
            <span class="muted grow">{{ STATE[t.p.status] }} · вход {{ price(t.key, t.p.entry) }}</span>
            <b v-if="t.r != null && t.p.status !== 'pending'" :class="t.r >= 0 ? 'up' : 'down'">{{ fmtR(t.r) }}</b>
          </button>
          <p v-if="!trades.length" class="muted none">Позиций на графиках монет из списков нет.</p>
        </section>

        <section class="card">
          <h3>Ближе всего к уровню</h3>
          <button v-for="l in levels.slice(0, 8)" :key="l.key" class="row" :class="{ near: Math.abs(l.dist) <= NEAR }" @click="open(l.ref)">
            <i class="dot" :style="{ background: l.color }" />
            <b>{{ name(l.ref) }}</b>
            <span class="muted grow">уровень {{ price(l.key, l.level) }} · {{ fmtPct(l.pct) }}</span>
            <b :class="l.dist >= 0 ? 'up' : 'down'">{{ (l.dist >= 0 ? '+' : '') + l.dist.toFixed(2) }} ATR</b>
          </button>
          <p v-if="!levels.length" class="muted none">На монетах из списков нет горизонтальных уровней.</p>
        </section>

        <section class="card">
          <h3>ATR исчерпан <span class="muted">— от открытия дня / по размаху</span></h3>
          <div class="two">
            <div>
              <h4 class="up">Запас хода</h4>
              <button v-for="x in fresh.slice(0, 6)" :key="x.key" class="row" @click="open(x.ref)">
                <b>{{ name(x.ref) }}</b><span class="grow" /><span :class="spentTone(x.fromOpen)">{{ x.fromOpen.toFixed(0) }}%</span><span class="muted">/ {{ x.traveled.toFixed(0) }}%</span>
              </button>
              <p v-if="!fresh.length" class="muted none">нет</p>
            </div>
            <div>
              <h4 class="down">Ход на исходе</h4>
              <button v-for="x in tired.slice(0, 6)" :key="x.key" class="row" @click="open(x.ref)">
                <b>{{ name(x.ref) }}</b><span class="grow" /><span :class="spentTone(x.fromOpen)">{{ x.fromOpen.toFixed(0) }}%</span><span class="muted">/ {{ x.traveled.toFixed(0) }}%</span>
              </button>
              <p v-if="!tired.length" class="muted none">нет</p>
            </div>
          </div>
        </section>

        <section class="card">
          <h3>За сутки в списках <span class="muted">— растут {{ breadth.up }}, падают {{ breadth.down }}</span></h3>
          <div class="two">
            <div>
              <h4 class="up">Растут</h4>
              <button v-for="m in gainers" :key="m.key" class="row" @click="open(m.ref)">
                <b>{{ name(m.ref) }}</b><span class="grow" /><span class="up">{{ fmtPct(m.pct) }}</span>
              </button>
              <p v-if="!gainers.length" class="muted none">нет</p>
            </div>
            <div>
              <h4 class="down">Падают</h4>
              <button v-for="m in losers" :key="m.key" class="row" @click="open(m.ref)">
                <b>{{ name(m.ref) }}</b><span class="grow" /><span class="down">{{ fmtPct(m.pct) }}</span>
              </button>
              <p v-if="!losers.length" class="muted none">нет</p>
            </div>
          </div>
        </section>

        <section v-if="fired.length" class="card">
          <h3>Сработавшие оповещения</h3>
          <button v-for="a in fired" :key="a.id" class="row" :class="{ near: !a.read }" @click="open(a.ref)">
            <b>{{ name(a.ref) }}</b>
            <span :class="a.dir === 'up' ? 'up' : 'down'">{{ a.dir === 'up' ? '≥' : '≤' }} {{ price(symbolKey(a.ref), a.price) }}</span>
            <span class="grow" />
            <span class="muted">{{ time(a.triggeredAt!) }}</span>
          </button>
        </section>
      </div>
      <p v-if="!coins.length" class="muted none big">В списках пока нет монет. Добавьте их из отбора или вставьте строки сетапов — и здесь появится сводка.</p>
      <p v-else-if="isPhone" class="muted foot">Касание строки открывает монету.</p>
    </div>
  </Modal>
</template>

<style scoped>
.db {
  padding: 14px 16px 18px;
}
.tiles {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 10px;
}
.tile {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg);
  text-align: left;
  min-width: 0;
}
button.tile:hover {
  border-color: var(--accent);
}
.cap {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--muted);
}
.tile > b {
  font-size: 24px;
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
}
.tile small {
  font-size: 12px;
  font-weight: 400;
  color: var(--muted);
}
.sub {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 8px;
  font-size: 11.5px;
}
.sub i {
  font-style: normal;
  white-space: nowrap;
}
.warn {
  color: var(--warn);
}
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 12px;
  margin-top: 14px;
}
.card {
  padding: 10px 6px 8px;
  border: 1px solid var(--border);
  border-radius: 10px;
  min-width: 0;
}
h3 {
  margin: 0 6px 6px;
  font-size: 13px;
  font-weight: 600;
}
h3 .muted {
  font-weight: 400;
  font-size: 12px;
}
h4 {
  margin: 2px 6px 2px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.two {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}
.row {
  display: flex;
  align-items: center;
  gap: 7px;
  width: 100%;
  min-width: 0;
  padding: 5px 6px;
  border-radius: 6px;
  font-size: 12.5px;
  text-align: left;
  font-variant-numeric: tabular-nums;
}
.row:hover {
  background: var(--hover);
}
.row.near {
  background: color-mix(in srgb, var(--warn) 12%, transparent);
}
.row .grow {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex: none;
}
.none {
  margin: 4px 6px;
  font-size: 12px;
}
.none.big {
  margin: 30px auto;
  max-width: 420px;
  text-align: center;
  font-size: 13px;
}
.foot {
  margin: 12px 2px 0;
  font-size: 12px;
}
</style>
