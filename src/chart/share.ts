import { symbolKey, type SymbolRef } from '../types'
import { app, activeIndex, activePane } from '../stores/app'
import { addDrawing, drawings, styleFor, type Drawing } from '../stores/drawings'
import { tickers } from '../stores/tickers'
import { markOf } from '../stores/watchlist'
import { nearestLevels, shareQuery, type SharePack, type SharePos } from '../lib/share'
import { chartAt } from './registry'
import { isPosition } from './drawings'
import { applySetup } from './setup'

const uid = () => Math.random().toString(36).slice(2, 10)

/** Что можно отправить с текущего графика: 3 ближайших к цене уровня, 3 последние позиции, направление, дата */
export function shareOptions() {
  const pane = activePane.value
  const ref = pane.symbol
  const key = symbolKey(ref)
  const list = drawings[key] ?? []
  const chart = chartAt(activeIndex.value)
  const last = tickers[key]?.last ?? chart?.bars[chart.bars.length - 1]?.close ?? 0
  const levels = nearestLevels(list.filter((d) => d.type === 'hline' || d.type === 'hray').map((d) => d.pts[0].p), last)
  const positions: SharePos[] = list
    .filter((d) => isPosition(d.type) && d.pts.length >= 3)
    .sort((a, b) => b.pts[0].t - a.pts[0].t)
    .slice(0, 3)
    .map((d) => ({ side: d.type as 'long' | 'short', entry: d.pts[0].p, target: d.pts[1].p, stop: d.pts[2].p, t: d.pts[0].t, t2: d.pts[1].t }))
  const t = chart?.viewedTime()
  let date: SharePack['date']
  if (t) {
    const d = new Date(t * 1000)
    date = { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() }
  }
  const selected = chart?.draw.selected()
  return {
    ref,
    last,
    precision: chart?.ui.precision ?? 2,
    side: markOf(ref) ?? undefined,
    levels,
    positions,
    date,
    /** уровень, выбранный на графике: его предлагаем первым */
    selectedLevel: selected && (selected.type === 'hline' || selected.type === 'hray') ? selected.pts[0].p : undefined,
  }
}

/** Полная ссылка на приложение с тем, чем делятся */
export function shareUrl(pack: SharePack): string {
  return new URL('./', location.href).href + shareQuery(pack)
}

/** Собирает посылку: биржа и рынок указываются, только если отличаются от «по умолчанию» */
export function makePack(ref: SymbolRef, part: Omit<SharePack, 'symbol' | 'exchange' | 'market'>): SharePack {
  const pack: SharePack = { symbol: ref.symbol, ...part }
  if (ref.exchange !== app.defaults.exchange) pack.exchange = ref.exchange
  if (ref.market !== app.defaults.market) pack.market = ref.market
  return pack
}

const same = (a: number, b: number) => Math.abs(a - b) <= Math.abs(a) * 1e-9

/** Открывает присланное: монета, направление, дата, уровни и позиции. Уже существующее не дублируется */
export function applyShare(pack: SharePack) {
  const ref: SymbolRef = { exchange: pack.exchange ?? app.defaults.exchange, market: pack.market ?? app.defaults.market, symbol: pack.symbol }
  const key = symbolKey(ref)
  applySetup({ symbol: pack.symbol, exchange: pack.exchange, market: pack.market, side: pack.side, date: pack.date, level: pack.levels[0] })
  const have = () => drawings[key] ?? []
  for (const level of pack.levels.slice(1)) {
    if (have().some((d) => (d.type === 'hline' || d.type === 'hray') && same(d.pts[0].p, level))) continue
    const st = styleFor('hline')
    addDrawing(key, { id: uid(), type: 'hline', pts: [{ t: Math.floor(Date.now() / 1000), p: level }], color: st.color, width: st.width, dash: st.dash })
  }
  for (const x of pack.positions) {
    if (have().some((d) => isPosition(d.type) && same(d.pts[0].p, x.entry) && same(d.pts[2].p, x.stop) && same(d.pts[1].p, x.target))) continue
    const d: Drawing = {
      id: uid(),
      type: x.side,
      color: styleFor(x.side).color,
      pts: [
        { t: x.t, p: x.entry },
        { t: Math.max(x.t2, x.t + 60), p: x.target },
        { t: x.t, p: x.stop },
      ],
    }
    addDrawing(key, d)
  }
}
