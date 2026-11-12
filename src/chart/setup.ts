import { sameSymbol, symbolKey, type SymbolRef } from '../types'
import { app, activePane, isPhone, paneCount, toast } from '../stores/app'
import { addDrawing, drawings, selection, styleFor } from '../stores/drawings'
import { activeList, lists, listsOf, setMark } from '../stores/watchlist'
import { dateFocus } from '../stores/sync'
import { parseLines, parseSetup, type Setup } from '../lib/setup'
import { parseSignal, type Signal } from '../lib/signal'
import { chartAt } from './registry'
import { applySignal } from './trade'

let focusId = 1

/** Уровень считается уже существующим, если на этой цене есть горизонтальная линия или луч */
function hasLevel(key: string, price: number): boolean {
  const eps = Math.abs(price) * 1e-9
  return (drawings[key] ?? []).some((d) => (d.type === 'hline' || d.type === 'hray') && Math.abs(d.pts[0].p - price) <= eps)
}

/**
 * Инструмент сетапа: биржа и рынок — из строки, а если их там нет — из настроек по умолчанию.
 * Монета, которая уже лежит в каком-нибудь списке, берётся оттуда (с её биржей и рынком):
 * иначе «та же» монета с другой биржи встала бы в список второй строкой.
 */
function refOf(s: Setup): SymbolRef {
  const cur = activePane.value.symbol
  if (!s.symbol) return { exchange: s.exchange ?? cur.exchange, market: s.market ?? cur.market, symbol: cur.symbol }
  const ref: SymbolRef = { exchange: s.exchange ?? app.defaults.exchange, market: s.market ?? app.defaults.market, symbol: s.symbol }
  if (s.exchange || s.market || listsOf(ref).length) return ref
  for (const l of [activeList.value, ...lists.all]) {
    const same = l.items.find((r) => r.symbol === s.symbol)
    if (same) return { exchange: same.exchange, market: same.market, symbol: same.symbol }
  }
  return ref
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
 * quiet — без сообщения (когда сетап открывается в составе пачки); note — приписка к сообщению.
 */
export function applySetup(s: Setup, quiet = false, note = '') {
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
  toast(`${ref.symbol}${date}${side}${levelNote}${note}`)
}

/**
 * Добавляет монету в конец текущего списка — если её нет ни в одном списке.
 * Возвращает название списка, где она уже лежит, или null, если добавлена.
 */
function addToLists(ref: SymbolRef): string | null {
  const has = listsOf(ref)
  if (has.length) return (has.includes(activeList.value) ? activeList.value : has[0]).name
  const target = activeList.value
  target.items.push({ ...ref })
  target.collapsed = false
  return null
}

/** Вставленный сетап: открывается на графике, а монета попадает в конец текущего списка */
export function applyPastedSetup(s: Setup) {
  if (!s.symbol) return applySetup(s)
  const was = addToLists(refOf(s))
  applySetup(s, false, was ? ` — уже в списке «${was}»` : ` — добавлен в конец списка «${activeList.value.name}»`)
}

/**
 * Несколько сетапов сразу (по одному в строке): монета, которой нет ни в одном списке,
 * добавляется в конец текущего; у той, что уже есть, только обновляются направление и уровень.
 * На графике открывается первая. skipped — строки, которые не удалось понять.
 */
export function applyBatch(list: Setup[], skipped: string[] = []) {
  const short = (ref: SymbolRef) => ref.symbol.replace(/USDT$/, '')
  const added: string[] = []
  const updated: string[] = []
  for (const s of list) {
    if (!s.symbol) continue
    const ref = refOf(s)
    const name = short(ref)
    if (added.includes(name) || updated.includes(name)) {
      // та же монета второй строкой — ещё один уровень для неё
    } else if (addToLists(ref)) updated.push(name)
    else added.push(name)
    markAndLevel(ref, s)
  }
  const first = list.find((s) => s.symbol)
  if (first) applySetup(first, true)
  const parts: string[] = []
  if (added.length) parts.push(`В список «${activeList.value.name}» добавлено ${added.length}: ${added.join(', ')}`)
  if (updated.length) parts.push(`${added.length ? 'у' : 'У'}же в списках, обновлены направление и уровни — ${updated.length}: ${updated.join(', ')}`)
  toast(parts.join('; '), 'info', 7000)
  if (skipped.length) {
    const shown = skipped.slice(0, 3).map((l) => `«${l.length > 40 ? l.slice(0, 40) + '…' : l}»`)
    toast(`Не разобрано строк: ${skipped.length} — ${shown.join(', ')}${skipped.length > 3 ? ' …' : ''}`, 'error', 9000)
  }
}

export type Pasted =
  | { kind: 'signal'; signal: Signal }
  | { kind: 'setup'; setup: Setup }
  | { kind: 'batch'; list: Setup[]; skipped: string[] }

/** Что за текст вставили: сделка, один сетап или несколько строк сетапов. null — обычный текст */
export function recognize(text: string): Pasted | null {
  const signal = parseSignal(text)
  if (signal) return { kind: 'signal', signal }
  const batch = parseLines(text)
  if (batch) return batch.list.length ? { kind: 'batch', ...batch } : null
  const setup = parseSetup(text)
  return setup ? { kind: 'setup', setup } : null
}

/** Применяет вставленный текст. false — текст не распознан */
export function applyPastedText(text: string): boolean {
  const r = recognize(text)
  if (!r) return false
  if (r.kind === 'signal') applySignal(r.signal)
  else if (r.kind === 'batch') applyBatch(r.list, r.skipped)
  else applyPastedSetup(r.setup)
  return true
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
