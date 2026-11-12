import { sameSymbol, symbolKey, type SymbolRef } from '../types'
import { app, activeIndex, activePane, isPhone, paneCount, toast } from '../stores/app'
import { addDrawing, drawings, selection, styleFor } from '../stores/drawings'
import { activeList, markOf, setMark } from '../stores/watchlist'
import { dateFocus } from '../stores/sync'
import { formatSetup, parseSetup, type Setup } from '../lib/setup'
import { parseSignal, type Signal } from '../lib/signal'
import { chartAt } from './registry'
import { applySignal } from './trade'

let focusId = 1

/** Уровень считается уже существующим, если на этой цене есть горизонтальная линия или луч */
function hasLevel(key: string, price: number): boolean {
  const eps = Math.abs(price) * 1e-9
  return (drawings[key] ?? []).some((d) => (d.type === 'hline' || d.type === 'hray') && Math.abs(d.pts[0].p - price) <= eps)
}

/** Инструмент сетапа: биржа и рынок — из строки, а если их там нет — из настроек по умолчанию */
function refOf(s: Setup): SymbolRef {
  const cur = activePane.value.symbol
  return s.symbol
    ? { exchange: s.exchange ?? app.defaults.exchange, market: s.market ?? app.defaults.market, symbol: s.symbol }
    : { exchange: s.exchange ?? cur.exchange, market: s.market ?? cur.market, symbol: cur.symbol }
}

/** Ставит отметку направления и уровень (если такого ещё нет). Возвращает, появился ли новый уровень */
function markAndLevel(ref: SymbolRef, s: Setup): boolean {
  if (s.side) setMark(ref, s.side)
  if (s.level === undefined || hasLevel(symbolKey(ref), s.level)) return false
  const st = styleFor('hline')
  addDrawing(symbolKey(ref), {
    id: Math.random().toString(36).slice(2, 10),
    type: 'hline',
    pts: [{ t: Math.floor(Date.now() / 1000), p: s.level }],
    color: st.color,
    width: st.width,
    dash: st.dash,
  })
  return true
}

/**
 * Открывает сетап: монета — во всех окнах раскладки, направление — отметкой, уровень —
 * горизонтальной линией (если такой ещё нет), дата — сдвигом всех графиков к ней.
 * quiet — без сообщения (когда сетап открывается в составе пачки).
 */
export function applySetup(s: Setup, quiet = false) {
  const ref = refOf(s)
  const key = symbolKey(ref)

  for (let i = 0; i < paneCount.value; i++) {
    if (!sameSymbol(app.panes[i].symbol, ref)) app.panes[i].symbol = { ...ref }
  }
  if (isPhone.value) app.mobileTab = 'chart'

  let levelNote = ''
  if (s.level !== undefined) levelNote = markAndLevel(ref, s) ? `, уровень ${s.level}` : ', уровень уже есть'
  else markAndLevel(ref, s)
  if (s.date) {
    dateFocus.value = { id: focusId++, key, ...s.date, at: Date.now() }
    // окна, где монета уже открыта, сдвигаются сразу; остальные — когда загрузят данные
    for (let i = 0; i < paneCount.value; i++) chartAt(i)?.onDateFocus()
  }
  selection.value = null
  if (quiet) return
  const side = s.side ? (s.side === 'long' ? ', лонг' : ', шорт') : ''
  const date = s.date ? `, ${String(s.date.d).padStart(2, '0')}.${String(s.date.m).padStart(2, '0')}.${s.date.y}` : ''
  toast(`${ref.symbol}${date}${side}${levelNote}`)
}

/**
 * Несколько сетапов сразу (по одному в строке): каждая монета добавляется в конец текущего
 * списка, получает отметку направления и уровень. На графике открывается первая.
 */
export function applyBatch(list: Setup[]) {
  const target = activeList.value
  const added: string[] = []
  for (const s of list) {
    if (!s.symbol) continue
    const ref = refOf(s)
    if (!target.items.some((r) => sameSymbol(r, ref))) {
      target.items.push({ ...ref })
      added.push(ref.symbol.replace(/USDT$/, ''))
    }
    markAndLevel(ref, s)
  }
  target.collapsed = false
  const first = list.find((s) => s.symbol)
  if (first) applySetup(first, true)
  const total = list.filter((s) => s.symbol).length
  toast(
    added.length
      ? `В список «${target.name}» добавлено ${added.length}: ${added.join(', ')}` + (added.length < total ? ` (остальные ${total - added.length} уже были)` : '')
      : `Все ${total} уже есть в списке «${target.name}» — направление и уровни обновлены`,
    'info',
    6000,
  )
}

export type Pasted = { kind: 'signal'; signal: Signal } | { kind: 'setup'; setup: Setup } | { kind: 'batch'; list: Setup[] }

/** Что за текст вставили: сделка, один сетап или несколько строк сетапов. null — обычный текст */
export function recognize(text: string): Pasted | null {
  const signal = parseSignal(text)
  if (signal) return { kind: 'signal', signal }
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  if (lines.length > 1) {
    const list = lines.map(parseSetup)
    // пачка — только если каждая строка понятна и в каждой есть монета
    if (list.every((s) => s && s.symbol)) return { kind: 'batch', list: list as Setup[] }
    return null
  }
  const setup = parseSetup(text)
  return setup ? { kind: 'setup', setup } : null
}

/** Применяет вставленный текст. false — текст не распознан */
export function applyPastedText(text: string): boolean {
  const r = recognize(text)
  if (!r) return false
  if (r.kind === 'signal') applySignal(r.signal)
  else if (r.kind === 'batch') applyBatch(r.list)
  else applySetup(r.setup)
  return true
}

/** Ссылка на то, что сейчас открыто: монета, отметка направления, выбранный уровень и дата, если график отмотан */
export function shareLink(): string {
  const pane = activePane.value
  const ref = pane.symbol
  const chart = chartAt(activeIndex.value)
  const setup: Setup = { symbol: ref.symbol }
  if (ref.exchange !== app.defaults.exchange) setup.exchange = ref.exchange
  if (ref.market !== app.defaults.market) setup.market = ref.market
  const mark = markOf(ref)
  if (mark) setup.side = mark
  const sel = chart?.draw.selected()
  if (sel && (sel.type === 'hline' || sel.type === 'hray')) setup.level = sel.pts[0].p
  const t = chart?.viewedTime()
  if (t) {
    const d = new Date(t * 1000)
    setup.date = { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() }
  }
  return new URL('./', location.href).href + '?q=' + encodeURIComponent(formatSetup(setup))
}

/** Текст сетапа из адреса страницы: параметр q, «хвост» пути и часть после решётки */
export function setupTextFromUrl(): string {
  const parts: string[] = []
  const q = new URLSearchParams(location.search).get('q')
  if (q) parts.push(q)
  // сервер мог отдать приложение по адресу вида /папка/10.11.2026 — тогда дата лежит в последнем звене пути
  let tail = ''
  try {
    tail = decodeURIComponent(location.pathname.split('/').pop() ?? '')
  } catch {
    /* битая кодировка в адресе — игнорируем */
  }
  if (tail && !/\.html?$/i.test(tail)) parts.push(tail)
  if (location.hash.length > 1) {
    try {
      // решётка в адресе — та самая, что стоит перед монетой: «…/10.11.2026 #1000PEPEUSDT Long»
      parts.push('#' + decodeURIComponent(location.hash.slice(1)))
    } catch {
      /* то же */
    }
  }
  return parts.join(' ').trim()
}
