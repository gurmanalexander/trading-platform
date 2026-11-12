/** Сделка, описанная текстом: «ARBUSDT SHORT / ТВХ: 0.14991 / SL: 0.15165 / TP: 0.1379» */
export interface Signal {
  symbol?: string
  side?: 'long' | 'short'
  entry?: number
  stop?: number
  target?: number
}

const NUM = String.raw`(\d+(?:[.,]\d+)?)`
const SEP = String.raw`\s*[:=\-–—]?\s*`
// буквы «ТВХ» часто набирают латиницей — принимаем оба написания каждой буквы
const ENTRY = new RegExp(String.raw`(?:[ТT][ВB][ХX]|TVH|вход|точка\s+входа|entry)` + SEP + NUM, 'iu')
const STOP = new RegExp(String.raw`(?:S\/?L|стоп(?:[\s-]?лосс)?|stop(?:[\s-]?loss)?)` + SEP + NUM, 'iu')
const TARGET = new RegExp(String.raw`(?:T\/?P\s?\d?|тейк(?:[\s-]?профит)?|take(?:[\s-]?profit)?|цель|target)` + SEP + NUM, 'iu')
const SIDE = /(?:^|[^\p{L}])(LONG|SHORT|ЛОНГ|ШОРТ|BUY|SELL)(?![\p{L}])/iu
const SYMBOL = /(?:^|[^A-Z0-9])([A-Z0-9]{2,15}?)\s*\/?\s*(USDT|USDC|PERP)(?![A-Z0-9])/

const num = (m: RegExpExecArray | null) => (m ? parseFloat(m[1].replace(',', '.')) : undefined)

/**
 * Достаёт из произвольного текста вход, стоп и цель. Лишние строки до и после не мешают.
 * Возвращает null, если в тексте нет хотя бы двух из трёх цен — значит, это не сделка.
 */
export function parseSignal(text: string): Signal | null {
  if (!text || text.length > 4000) return null
  const entry = num(ENTRY.exec(text))
  const stop = num(STOP.exec(text))
  const target = num(TARGET.exec(text))
  if ([entry, stop, target].filter((v) => v !== undefined && v > 0).length < 2) return null

  const out: Signal = { entry, stop, target }
  const side = SIDE.exec(text)?.[1].toUpperCase()
  if (side) out.side = side === 'LONG' || side === 'ЛОНГ' || side === 'BUY' ? 'long' : 'short'
  else if (entry !== undefined && target !== undefined) out.side = target > entry ? 'long' : 'short'
  else if (entry !== undefined && stop !== undefined) out.side = stop < entry ? 'long' : 'short'

  const sym = SYMBOL.exec(text.toUpperCase())
  if (sym) out.symbol = sym[1] + sym[2]
  return out
}

/** Текст сделки в том же формате — для копирования позиции */
export function formatSignal(symbol: string, side: 'long' | 'short', entry: number, stop: number, target: number, precision: number): string {
  const risk = Math.abs(entry - stop)
  const rr = risk ? Math.abs(target - entry) / risk : 0
  const f = (v: number) => String(+v.toFixed(precision))
  return `${symbol} ${side === 'long' ? 'LONG' : 'SHORT'}\nТВХ: ${f(entry)}\nSL: ${f(stop)}\nTP: ${f(target)}\nR: ${rr.toFixed(2)}`
}
