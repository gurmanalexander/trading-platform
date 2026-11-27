import type { Account, Fill, Funding, Snapshot } from './types'

/**
 * Демо-данные: правдоподобная история исполнений за несколько месяцев. Нужны, чтобы посмотреть
 * журнал без ключей, а также для снимков экрана и тестов. Генератор детерминированный: один и тот
 * же seed и момент «сейчас» дают одни и те же сделки.
 */
export const DEMO_ACCOUNTS: Account[] = [
  { id: 'demo-binance', exchange: 'binance', label: 'Binance Futures', hint: 'demo', addedAt: 0 },
  { id: 'demo-bybit', exchange: 'bybit', label: 'Bybit', hint: 'demo', addedAt: 0 },
]

export const isDemo = (acct: string) => acct.startsWith('demo-')

function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let x = Math.imul(s ^ (s >>> 15), 1 | s)
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}

const SYMBOLS: [string, number, number][] = [
  // инструмент, цена, знаков в цене
  ['BTCUSDT', 96_000, 1],
  ['ETHUSDT', 3_400, 2],
  ['SOLUSDT', 190, 2],
  ['XRPUSDT', 2.3, 4],
  ['DOGEUSDT', 0.31, 5],
  ['SUIUSDT', 3.9, 4],
  ['LINKUSDT', 22, 3],
  ['1000PEPEUSDT', 0.0185, 7],
]

const HOUR = 3_600_000
const round = (v: number, d: number) => +v.toFixed(d)

export function demoData(acct: string, now = Date.now(), days = 150): { fills: Fill[]; funding: Funding[]; snapshot: Snapshot } {
  const rand = rng(acct === 'demo-bybit' ? 77 : 2024)
  const fills: Fill[] = []
  const funding: Funding[] = []
  const perDay = acct === 'demo-bybit' ? 1.3 : 2.6
  const symbols = acct === 'demo-bybit' ? SYMBOLS.slice(0, 5) : SYMBOLS
  const today = Math.floor(now / 86_400_000)
  let n = 0
  for (let d = days; d >= 1; d--) {
    const day = today - d
    const weekday = (day + 3) % 7
    // в выходные сделок меньше, бывают дни без торговли
    const mean = perDay * (weekday >= 5 ? 0.4 : 1)
    let count = 0
    for (let p = Math.exp(-mean), acc = rand(); acc > p; acc *= rand()) count++
    for (let i = 0; i < count; i++) {
      const [sym, base, digits] = symbols[Math.floor(rand() ** 1.6 * symbols.length)]
      const side: 1 | -1 = rand() < 0.56 ? 1 : -1
      // дрейф цены инструмента за период
      const px0 = base * (1 + 0.25 * Math.sin((day + sym.length * 9) / 23) + (rand() - 0.5) * 0.04)
      const start = day * 86_400_000 + (6 + rand() * 15) * HOUR + rand() * HOUR
      const hold = Math.exp(Math.log(8 * 60_000) + rand() * Math.log(60)) // от 8 минут до ~8 часов
      const risk = 0.004 + rand() * 0.01
      // исход: чуть меньше половины сделок прибыльны, но прибыль в среднем крупнее убытка
      const win = rand() < 0.46 + (side > 0 ? 0.03 : -0.02) + (weekday === 1 ? 0.08 : weekday === 4 ? -0.1 : 0)
      const move = win ? risk * (0.6 + rand() * 3.2) : -risk * (0.5 + rand() * 0.7)
      const entry = round(px0, digits)
      const exit = round(px0 * (1 + move * side), digits)
      const notional = 1500 + rand() * 6500
      const qty = round(notional / entry, entry > 1000 ? 3 : entry > 10 ? 1 : 0) || 1
      const taker = 0.0005
      const parts = rand() < 0.35 ? 2 : 1
      for (let k = 0; k < parts; k++) {
        const q = parts === 1 ? qty : k === 0 ? round(qty * 0.5, 6) : round(qty - round(qty * 0.5, 6), 6)
        const px = k === 0 ? entry : round(entry * (1 - 0.0015 * side), digits)
        fills.push({ id: String(++n), t: Math.round(start + k * hold * 0.2), sym, side, px, qty: q, fee: px * q * taker })
      }
      const closeParts = rand() < 0.3 ? 2 : 1
      for (let k = 0; k < closeParts; k++) {
        const q = closeParts === 1 ? qty : k === 0 ? round(qty * 0.5, 6) : round(qty - round(qty * 0.5, 6), 6)
        const px = closeParts === 2 && k === 0 ? round((entry + exit) / 2, digits) : exit
        const maker = win && rand() < 0.6
        fills.push({
          id: String(++n),
          t: Math.round(start + hold * (closeParts === 2 && k === 0 ? 0.6 : 1)),
          sym,
          side: -side as 1 | -1,
          px,
          qty: q,
          fee: px * q * (maker ? 0.0002 : taker),
          maker,
        })
      }
      // позиция пережила расчёт фандинга (каждые 8 часов)
      for (let ft = Math.ceil(start / (8 * HOUR)) * 8 * HOUR; ft < start + hold; ft += 8 * HOUR)
        funding.push({ id: `f${++n}`, t: ft, sym, amt: -entry * qty * 0.0001 * side })
    }
  }
  // одна позиция открыта прямо сейчас: на одном счёте лонг, на другом шорт
  const [sym, base, digits] = symbols[acct === 'demo-bybit' ? 2 : 1]
  const side: 1 | -1 = acct === 'demo-bybit' ? -1 : 1
  const entry = round(base * 1.01, digits)
  const qty = acct === 'demo-bybit' ? 18 : 1.2
  fills.push({ id: String(++n), t: now - 3 * HOUR, sym, side, px: entry, qty, fee: entry * qty * 0.0005 })
  const mark = round(entry * (1 + 0.006 * side), digits)
  const upnl = (mark - entry) * qty * side
  const wallet = acct === 'demo-bybit' ? 4200 : 12_500
  return {
    fills,
    funding,
    snapshot: { at: now, wallet, upnl, equity: wallet + upnl, positions: [{ sym, side, qty, entry, mark, upnl, leverage: 10 }] },
  }
}
