import { symbolKey, type SymbolRef } from '../types'
import { activeIndex, activePane, setSymbol, toast } from '../stores/app'
import { addDrawing, selection, styleFor, type Drawing } from '../stores/drawings'
import { getTf } from '../lib/timeframes'
import type { Signal } from '../lib/signal'
import { chartAt } from './registry'
import { isPosition } from './drawings'
import { barStart, setPositionPrices } from './position'

/**
 * Применяет сделку из текста: цены раскладываются по выбранной позиции, а если позиция
 * не выбрана — на графике появляется новая (и открывается инструмент из текста).
 */
export function applySignal(sig: Signal): boolean {
  const sel = selection.value
  const layer = sel ? chartAt(sel.pane)?.draw : undefined
  const cur = layer?.selected()
  if (layer && cur && isPosition(cur.type)) {
    const ok = layer.applySignal(sig)
    if (ok) toast('Цены позиции обновлены из текста')
    else toast('Не получилось: стоп и цель должны быть по разные стороны от входа', 'error')
    return ok
  }
  if (sig.entry === undefined || sig.stop === undefined || sig.target === undefined) {
    toast('Чтобы создать позицию из текста, нужны вход, стоп и цель. Либо выделите позицию и вставьте снова', 'error')
    return false
  }
  const pane = activePane.value
  const ref: SymbolRef = { exchange: pane.symbol.exchange, market: pane.symbol.market, symbol: sig.symbol ?? pane.symbol.symbol }
  // вход — начало текущей свечи активного окна (17:12 на пятиминутках — это свеча 17:10);
  // ширина — сутки на интервале до часа, чтобы позицию было видно на любом внутридневном графике
  const t = barStart(Math.floor(Date.now() / 1000), getTf(pane.tf).sec)
  const d: Drawing = {
    id: Math.random().toString(36).slice(2, 10),
    type: 'long',
    color: styleFor('long').color,
    pts: [
      { t, p: sig.entry },
      { t: t + Math.min(getTf(pane.tf).sec, 3600) * 24, p: sig.target },
      { t, p: sig.stop },
    ],
  }
  if (!setPositionPrices(d, sig.entry, sig.stop, sig.target)) {
    toast('Не получилось: стоп и цель должны быть по разные стороны от входа', 'error')
    return false
  }
  addDrawing(symbolKey(ref), d)
  if (ref.symbol !== pane.symbol.symbol) setSymbol(ref)
  selection.value = { pane: activeIndex.value, id: d.id }
  toast(`${d.type === 'long' ? 'Лонг' : 'Шорт'} ${ref.symbol} добавлен на график`)
  return true
}
