import type { Fill, Funding, Trade } from './types'

/**
 * Собирает сделки из исполнений.
 *
 * По каждому инструменту ведутся две «книги» — лонг и шорт. Исполнение делится на закрывающую
 * часть (уменьшает встречную книгу) и открывающую (увеличивает свою). В одностороннем режиме
 * ненулевой бывает только одна книга, в режиме хеджирования — обе, и логика одна и та же.
 * Сделка начинается, когда книга уходит от нуля, и заканчивается, когда возвращается к нулю;
 * переворот позиции одним ордером даёт две сделки.
 *
 * Как делить исполнение, сообщает биржа, если может: Binance — стороной позиции (ps),
 * Bybit — закрытым объёмом (closed). Иначе закрывается столько, сколько есть во встречной книге.
 */
interface Book {
  dir: 1 | -1
  size: number
  /** стоимость открытой части по ценам входа */
  cost: number
  trade: Trade | null
  /** суммы для средних цен текущей сделки */
  inQty: number
  inVal: number
  outQty: number
  outVal: number
}

const newBook = (dir: 1 | -1): Book => ({ dir, size: 0, cost: 0, trade: null, inQty: 0, inVal: 0, outQty: 0, outVal: 0 })

/** Объёмы приходят десятичными дробями: остаток меньше этой доли размера считаем нулём */
const EPS = 1e-9
const isZero = (v: number, scale: number) => Math.abs(v) <= EPS * Math.max(1, Math.abs(scale))

type Event = { t: number; fill?: Fill; funding?: Funding }

export function buildTrades(acct: string, fills: Fill[], funding: Funding[] = []): Trade[] {
  const events: Event[] = [...dedupe(fills).map((fill) => ({ t: fill.t, fill })), ...dedupe(funding).map((f) => ({ t: f.t, funding: f }))]
  // при равном времени порядок исполнений — как на бирже (по идентификатору), фандинг — после них
  events.sort((a, b) => a.t - b.t || Number(!!a.funding) - Number(!!b.funding) || cmpId(a.fill?.id ?? '', b.fill?.id ?? ''))

  const books = new Map<string, { long: Book; short: Book }>()
  const out: Trade[] = []
  const booksOf = (sym: string) => {
    let b = books.get(sym)
    if (!b) books.set(sym, (b = { long: newBook(1), short: newBook(-1) }))
    return b
  }

  const start = (book: Book, sym: string, f: Fill, partial = false): Trade => {
    const trade: Trade = {
      id: `${acct}:${sym}:${book.dir > 0 ? 'L' : 'S'}:${f.id}`,
      acct,
      sym,
      side: book.dir,
      open: f.t,
      close: 0,
      entry: 0,
      exit: 0,
      qty: 0,
      vol: 0,
      gross: 0,
      fee: 0,
      funding: 0,
      fills: 0,
    }
    if (partial) trade.partial = true
    book.trade = trade
    book.inQty = book.inVal = book.outQty = book.outVal = 0
    out.push(trade)
    return trade
  }

  const finish = (book: Book, t: number) => {
    const trade = book.trade!
    trade.close = t
    book.trade = null
    book.size = 0
    book.cost = 0
  }

  /** Закрывающая часть исполнения: уменьшает книгу, фиксирует результат */
  const reduce = (book: Book, sym: string, f: Fill, qty: number, feePart: number, pnlPart: number | undefined) => {
    let trade = book.trade
    const known = Math.min(qty, book.size)
    const orphan = qty - known
    if (!trade || isZero(book.size, qty)) {
      // закрывается позиция, открытая до начала загруженной истории
      trade = start(book, sym, f, true)
      trade.qty = qty
    } else if (!isZero(orphan, qty)) {
      trade.partial = true
    }
    const avg = book.size > 0 ? book.cost / book.size : 0
    const computed = known > 0 ? (f.px - avg) * known * book.dir : 0
    trade.gross += pnlPart ?? computed
    trade.fee += feePart
    trade.vol += f.px * qty
    trade.fills++
    book.outQty += qty
    book.outVal += f.px * qty
    trade.exit = book.outVal / book.outQty
    book.cost -= avg * known
    book.size -= known
    if (isZero(book.size, trade.qty)) finish(book, f.t)
  }

  /** Открывающая часть: увеличивает книгу */
  const add = (book: Book, sym: string, f: Fill, qty: number, feePart: number) => {
    const trade = book.trade ?? start(book, sym, f)
    book.size += qty
    book.cost += f.px * qty
    book.inQty += qty
    book.inVal += f.px * qty
    trade.entry = book.inVal / book.inQty
    trade.qty = Math.max(trade.qty, book.size)
    trade.fee += feePart
    trade.vol += f.px * qty
    trade.fills++
  }

  for (const ev of events) {
    if (ev.funding) {
      const b = books.get(ev.funding.sym)
      const live = b ? [b.long, b.short].filter((x) => x.trade) : []
      for (const x of live) x.trade!.funding += ev.funding.amt / live.length
      continue
    }
    const f = ev.fill!
    if (!(f.qty > 0) || !(f.px > 0)) continue
    const b = booksOf(f.sym)
    const own = f.side > 0 ? b.long : b.short
    const opp = f.side > 0 ? b.short : b.long

    let closing: number
    if (f.ps) {
      // режим хеджирования: исполнение целиком относится к названной книге
      const target = f.ps === 'L' ? b.long : b.short
      if (target.dir === f.side) add(target, f.sym, f, f.qty, f.fee)
      else reduce(target, f.sym, f, f.qty, f.fee, f.pnl)
      continue
    } else if (f.closed != null) closing = Math.min(f.qty, Math.max(0, f.closed))
    else {
      closing = Math.min(f.qty, opp.size)
      // встречной позиции в истории нет, но биржа сообщила результат — значит, это закрытие
      // позиции, открытой до начала загруженной истории
      if (isZero(closing, f.qty) && f.pnl) closing = f.qty
    }

    const opening = f.qty - closing
    const hasClose = !isZero(closing, f.qty)
    const hasOpen = !isZero(opening, f.qty)
    if (hasClose) reduce(opp, f.sym, f, closing, hasOpen ? (f.fee * closing) / f.qty : f.fee, f.pnl)
    if (hasOpen) add(own, f.sym, f, opening, hasClose ? (f.fee * opening) / f.qty : f.fee)
  }
  return out
}

function dedupe<T extends { id: string }>(list: T[]): T[] {
  const seen = new Set<string>()
  return list.filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true)))
}

/**
 * Порядок исполнений с одинаковым временем — по идентификатору биржи. Числовая часть (весь
 * идентификатор или хвост после «:») сравнивается как число: «…:99» раньше «…:100».
 */
function cmpId(a: string, b: string): number {
  const ia = a.lastIndexOf(':') + 1
  const ib = b.lastIndexOf(':') + 1
  const pa = a.slice(0, ia)
  const pb = b.slice(0, ib)
  if (pa !== pb) return pa < pb ? -1 : 1
  const ta = a.slice(ia)
  const tb = b.slice(ib)
  if (/^\d+$/.test(ta) && /^\d+$/.test(tb) && ta.length !== tb.length) return ta.length - tb.length
  return ta < tb ? -1 : ta > tb ? 1 : 0
}
