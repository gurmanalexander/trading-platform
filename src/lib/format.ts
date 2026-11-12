/** Кол-во значимых знаков после запятой в строке цены ("73701.51000000" -> 2) */
export function decimalsOf(s: string): number {
  const dot = s.indexOf('.')
  if (dot < 0) return 0
  let end = s.length
  while (end > dot + 1 && s.charCodeAt(end - 1) === 48) end--
  return s.charCodeAt(end - 1) === 46 ? 0 : end - dot - 1
}

/** Точность по порядку цены — когда шаг цены ещё неизвестен */
export function autoPrecision(price: number): number {
  const p = Math.abs(price)
  if (!p || !isFinite(p)) return 2
  if (p >= 1000) return 2
  if (p >= 10) return 3
  if (p >= 1) return 4
  return Math.min(10, 4 - Math.floor(Math.log10(p)))
}

// Точность по инструментам: растёт по мере наблюдения реальных цен и никогда не уменьшается,
// поэтому число знаков в списках не «прыгает».
const precisions = new Map<string, number>()

export function observePrecision(key: string, values: (string | undefined)[]): number {
  let p = precisions.get(key) ?? 0
  for (const v of values) {
    if (!v) continue
    const d = decimalsOf(v)
    if (d > p) p = d
  }
  precisions.set(key, p)
  return p
}

export function setPrecision(key: string, p: number) {
  if (p > (precisions.get(key) ?? -1)) precisions.set(key, p)
}

export function precisionOf(key: string, price: number): number {
  return precisions.get(key) ?? autoPrecision(price)
}

export function fmtPrice(v: number | null | undefined, precision: number): string {
  if (v == null || !isFinite(v)) return '—'
  return v.toFixed(precision)
}

export function fmtCompact(v: number | null | undefined): string {
  if (v == null || !isFinite(v)) return '—'
  const a = Math.abs(v)
  if (a >= 1e9) return (v / 1e9).toFixed(2) + 'B'
  if (a >= 1e6) return (v / 1e6).toFixed(2) + 'M'
  if (a >= 1e3) return (v / 1e3).toFixed(2) + 'K'
  if (a >= 1) return v.toFixed(2)
  return v.toPrecision(3)
}

export function fmtPct(v: number | null | undefined): string {
  if (v == null || !isFinite(v)) return '—'
  return (v > 0 ? '+' : '') + v.toFixed(2) + '%'
}

export function fmtDuration(sec: number): string {
  sec = Math.max(0, Math.floor(sec))
  const d = Math.floor(sec / 86400)
  const h = Math.floor((sec % 86400) / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  const pad = (n: number) => (n < 10 ? '0' + n : '' + n)
  if (d > 0) return `${d}д ${h}ч`
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`
  return `${pad(m)}:${pad(s)}`
}

/** Длительность словами: "3д 4ч", "2ч 15м", "45м" */
export function fmtSpan(sec: number): string {
  sec = Math.abs(Math.round(sec))
  const d = Math.floor(sec / 86400)
  const h = Math.floor((sec % 86400) / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (d > 0) return h ? `${d}д ${h}ч` : `${d}д`
  if (h > 0) return m ? `${h}ч ${m}м` : `${h}ч`
  return `${m}м`
}
