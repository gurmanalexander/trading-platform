import type { ExchangeId, MarketId } from '../types'

/**
 * «Сетап» одной строкой: дата, монета, направление и уровень в любом порядке, любая часть
 * может отсутствовать. Пример: «10.11.2026 #1000PEPEUSDT Long 0,0053656».
 * Такую строку можно вставить на график или открыть ссылкой.
 */
export interface Setup {
  date?: { y: number; m: number; d: number }
  symbol?: string
  exchange?: ExchangeId
  market?: MarketId
  side?: 'long' | 'short'
  level?: number
}

const QUOTES = ['USDT', 'USDC', 'FDUSD', 'PERP', 'USD', 'BTC', 'ETH']
const SIDES: Record<string, 'long' | 'short'> = { long: 'long', лонг: 'long', buy: 'long', short: 'short', шорт: 'short', sell: 'short' }
const EXCHANGES: Record<string, ExchangeId> = { binance: 'binance', бинанс: 'binance', bybit: 'bybit', байбит: 'bybit' }
const MARKETS: Record<string, MarketId> = { spot: 'spot', спот: 'spot', futures: 'futures', фьючерсы: 'futures', фьюч: 'futures', фьючи: 'futures', perp: 'futures' }

function parseDate(tok: string): Setup['date'] | null {
  let m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/.exec(tok)
  let y: number, mo: number, d: number
  if (m) {
    d = +m[1]
    mo = +m[2]
    y = m[3].length === 2 ? 2000 + +m[3] : +m[3]
  } else if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(tok))) {
    y = +m[1]
    mo = +m[2]
    d = +m[3]
  } else return null
  // несуществующие даты (31.02) отбрасываем
  const check = new Date(Date.UTC(y, mo - 1, d))
  return check.getUTCMonth() === mo - 1 && check.getUTCDate() === d && y >= 2009 ? { y, m: mo, d } : null
}

/** Результат разбора строки: сам сетап и то, насколько уверенно в ней названа монета */
export interface ParsedLine {
  setup: Setup
  /** монета записана одним словом без решётки и без валюты котировки («BTC») */
  bare: boolean
}

/**
 * Разбирает строку сетапа. null — это не сетап, а обычный текст.
 * Лишние слова (комментарий, результат сделки) не мешают, если монета названа явно —
 * с решёткой или с валютой котировки — и рядом есть дата, направление или уровень.
 */
export function parseLine(text: string): ParsedLine | null {
  if (!text || text.length > 300) return null
  // невидимые символы и кавычки, которые добавляют таблицы и мессенджеры при копировании
  const tokens = text
    .replace(/[\u200b-\u200d\ufeff"«»]/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (!tokens.length || tokens.length > 24) return null
  const out: Setup = {}
  let explicit = false
  let junk = 0
  for (const full of tokens) {
    // «211,89;» и «Short,» — знак препинания в конце не часть значения
    const tok = full.replace(/[,;:.!]+$/, '')
    if (!tok) continue
    const lower = tok.toLowerCase()
    const date = parseDate(tok)
    if (date) {
      if (out.date) junk++
      else out.date = date
    } else if (SIDES[lower]) out.side ??= SIDES[lower]
    else if (EXCHANGES[lower]) out.exchange ??= EXCHANGES[lower]
    else if (MARKETS[lower]) out.market ??= MARKETS[lower]
    else if (/^\d+(?:[.,]\d+)?$/.test(tok)) {
      if (out.level !== undefined) junk++
      else out.level = parseFloat(tok.replace(',', '.'))
    } else {
      const marked = /^[#$]/.test(tok)
      // «BTCUSDT.P» — так фьючерсы пишет TradingView
      const raw = tok.replace(/^[#$]/, '').replace('/', '').replace(/\.P$/i, '').toUpperCase()
      if (!/^[A-Z0-9]{2,20}$/.test(raw) || !/[A-Z]/.test(raw)) {
        junk++
        continue
      }
      const quoted = QUOTES.some((q) => raw.endsWith(q) && raw.length > q.length)
      const strong = marked || quoted
      // вторая монета в строке — лишнее слово; но явная запись важнее случайного слова перед ней
      if (out.symbol && (explicit || !strong)) {
        junk++
        continue
      }
      if (out.symbol) junk++
      // «#PEPE» и «PEPE» — это PEPEUSDT
      out.symbol = quoted ? raw : raw + 'USDT'
      explicit = strong
    }
  }
  const detailed = !!out.date || !!out.side || out.level !== undefined
  if (!out.symbol && !detailed) return null
  // одно лишь число — не сетап
  if (!out.symbol && !out.date && !out.side) return null
  // лишние слова допустимы только рядом с явно названной монетой и её данными
  if (junk && !(explicit && detailed)) return null
  return { setup: out, bare: !!out.symbol && !explicit }
}

/** То же для одной строки: одиночное слово без решётки и без валюты котировки — обычный текст, а не монета */
export function parseSetup(text: string): Setup | null {
  const r = parseLine(text)
  if (!r) return null
  const s = r.setup
  if (r.bare && !s.date && !s.side && s.level === undefined) return null
  return s
}

/**
 * Несколько строк сетапов. null — строка одна (это не пачка). Строки, которые понять не удалось,
 * возвращаются в skipped: остальные всё равно применяются.
 */
export function parseLines(text: string): { list: Setup[]; skipped: string[] } | null {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  if (lines.length < 2) return null
  const parsed = lines.map((l) => {
    const r = parseLine(l)
    return r?.setup.symbol ? r : null
  })
  // столбик тикеров («BTC», «ETH») годится, только когда понятна каждая строка;
  // иначе это может быть обычный текст, и берутся лишь строки с явно названной монетой
  const clean = parsed.every(Boolean)
  const list: Setup[] = []
  const skipped: string[] = []
  parsed.forEach((r, i) => {
    if (r && (clean || !r.bare)) list.push(r.setup)
    else skipped.push(lines[i])
  })
  return { list, skipped }
}

const pad = (n: number) => String(n).padStart(2, '0')

export function formatSetup(s: Setup): string {
  const parts: string[] = []
  if (s.date) parts.push(`${pad(s.date.d)}.${pad(s.date.m)}.${s.date.y}`)
  if (s.exchange) parts.push(s.exchange)
  if (s.market) parts.push(s.market)
  if (s.symbol) parts.push('#' + s.symbol)
  if (s.side) parts.push(s.side === 'long' ? 'Long' : 'Short')
  if (s.level !== undefined) parts.push(String(s.level))
  return parts.join(' ')
}

/**
 * Где на экране должно оказаться начало даты — доля ширины графика слева направо.
 * На дневке дата встаёт в правой трети (видно, что было до неё), на часовике — посередине,
 * на младших интервалах — в левой трети (видно, как развивался день).
 */
export function focusFraction(tfSec: number): number {
  if (tfSec >= 86400) return 0.8
  if (tfSec >= 3600) return 0.5
  return 0.2
}

/** Буквы русской раскладки → клавиши латинской: «иес» → «btc» */
const RU = 'йцукенгшщзфывапролдячсмить'
const EN = 'qwertyuiopasdfghjklzxcvbnm'
export function fromRuLayout(text: string): string {
  let out = ''
  for (const ch of text) {
    const i = RU.indexOf(ch.toLowerCase())
    out += i >= 0 ? EN[i] : ch
  }
  return out
}
