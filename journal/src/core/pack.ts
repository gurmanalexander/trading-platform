import type { Account, Snapshot, Trade } from './types'

/**
 * Документы синхронизации в том виде, в каком они публикуются на ретрансляторах.
 * Их собирают и журнал, и расширение-мост (фоновая выгрузка) — поэтому упаковка общая и
 * детерминированная: одно и то же содержимое на обоих даёт один и тот же документ.
 */
export const WEEK = 7 * 86_400_000
export const weekOf = (ms: number) => Math.floor(ms / WEEK)

/** Порядок сделок счёта: по времени открытия, затем по идентификатору */
export const sortTrades = (list: Trade[]): Trade[] => list.slice().sort((a, b) => a.open - b.open || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

const r = (v: number) => +v.toPrecision(10)

/** Сделка в виде короткого массива: в документе их сотни */
export function packTrade(t: Trade): unknown[] {
  const tail = t.id.slice(t.acct.length + 1 + t.sym.length + 3) // после «счёт:инструмент:L:»
  return [tail, t.sym, t.side, t.open, t.close, r(t.entry), r(t.exit), r(t.qty), r(t.vol), r(t.gross), r(t.fee), r(t.funding), t.fills, t.partial ? 1 : 0]
}

export function unpackTrade(acct: string, a: unknown): Trade | null {
  if (!Array.isArray(a) || a.length < 13) return null
  const [tail, sym, side, open, close, entry, exit, qty, vol, gross, fee, funding, fills, partial] = a
  if (typeof tail !== 'string' || typeof sym !== 'string' || !/^[A-Z0-9_-]{2,40}$/.test(sym) || (side !== 1 && side !== -1)) return null
  const nums = [open, close, entry, exit, qty, vol, gross, fee, funding, fills]
  if (!nums.every((v) => typeof v === 'number' && isFinite(v))) return null
  const t: Trade = { id: `${acct}:${sym}:${side > 0 ? 'L' : 'S'}:${tail}`, acct, sym, side, open, close, entry, exit, qty, vol, gross, fee, funding, fills }
  if (partial) t.partial = true
  return t
}

/** Документ счёта: только то, что можно показывать другим устройствам. Ключей в нём нет */
export const accountDoc = (a: Account) => ({ id: a.id, exchange: a.exchange, label: a.label, hint: a.hint, addedAt: a.addedAt })

/** Сделки счёта, разложенные по недельным документам: «t:счёт:неделя» → упакованные сделки */
export function weekDocs(acct: string, trades: Trade[]): Map<string, unknown[][]> {
  const out = new Map<string, unknown[][]>()
  for (const t of sortTrades(trades)) {
    const id = `t:${acct}:${weekOf(t.open)}`
    let list = out.get(id)
    if (!list) out.set(id, (list = []))
    list.push(packTrade(t))
  }
  return out
}

/** Всё, что публикуется о счёте: сам счёт, его состояние и сделки по неделям */
export function accountDocs(a: Account, trades: Trade[], snapshot?: Snapshot): Map<string, unknown> {
  const out = new Map<string, unknown>([[`a:${a.id}`, accountDoc(a)]])
  if (snapshot) out.set(`s:${a.id}`, snapshot)
  for (const [id, list] of weekDocs(a.id, trades)) out.set(id, list)
  return out
}
