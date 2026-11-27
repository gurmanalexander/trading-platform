import { locale, t } from './i18n'

/** Сумма в долларах со знаком: «+1 234,50», «−87,10». Знак — всегда, цвет его только дублирует */
export function fmtMoney(v: number, opts: { sign?: boolean; digits?: number } = {}): string {
  if (!isFinite(v)) return '∞'
  const digits = opts.digits ?? (Math.abs(v) >= 10_000 ? 0 : 2)
  const s = Math.abs(v).toLocaleString(locale(), { minimumFractionDigits: digits, maximumFractionDigits: digits })
  const zero = Math.abs(v) < 0.5 * 10 ** -digits
  return (zero ? '' : v < 0 ? '−' : opts.sign === false ? '' : '+') + s
}

/** Коротко для осей и тесных мест: «+1,2K», «−340» */
export function fmtShort(v: number, sign = true): string {
  const a = Math.abs(v)
  const trim = (x: number, d: number) => x.toFixed(d).replace(/\.0+$/, '')
  const s = a >= 1e6 ? trim(a / 1e6, a >= 1e7 ? 0 : 1) + 'M' : a >= 1e3 ? trim(a / 1e3, a >= 1e4 ? 0 : 1) + 'K' : a >= 10 ? a.toFixed(0) : trim(a, 1)
  return (a === 0 ? '' : v < 0 ? '−' : sign ? '+' : '') + s
}

export const fmtPct = (v: number, digits = 1) => (isFinite(v) ? (v * 100).toFixed(digits) + '%' : '—')

export function fmtRatio(v: number): string {
  return v === Infinity ? '∞' : isFinite(v) ? v.toFixed(2) : '—'
}

/** Цена: значащие цифры по порядку величины, без хвостовых нулей */
export function fmtPrice(v: number): string {
  if (!isFinite(v) || v === 0) return '—'
  const a = Math.abs(v)
  const d = a >= 1000 ? 2 : a >= 1 ? 4 : Math.min(10, 4 - Math.floor(Math.log10(a)))
  return v.toLocaleString(locale(), { minimumFractionDigits: Math.min(2, d), maximumFractionDigits: d })
}

export function fmtQty(v: number): string {
  return v.toLocaleString(locale(), { maximumFractionDigits: v >= 1000 ? 0 : v >= 1 ? 3 : 6 })
}

/** Длительность словами: «3д 4ч», «2ч 15м», «45м», «30с» */
export function fmtSpan(sec: number): string {
  sec = Math.abs(Math.round(sec))
  const d = Math.floor(sec / 86400)
  const h = Math.floor((sec % 86400) / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (d > 0) return h ? t('{d}д {h}ч', { d, h }) : t('{d}д', { d })
  if (h > 0) return m ? t('{h}ч {m}м', { h, m }) : t('{h}ч', { h })
  if (m > 0) return t('{m}м', { m })
  return t('{s}с', { s: sec })
}

export const fmtDate = (ms: number, withYear = false) =>
  new Date(ms).toLocaleDateString(locale(), { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}) })

export const fmtTime = (ms: number) => new Date(ms).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })

export const fmtDateTime = (ms: number) => `${fmtDate(ms)}, ${fmtTime(ms)}`

/** «только что», «5 мин назад», «3 ч назад», иначе дата */
export function fmtAgo(ms: number, now = Date.now()): string {
  const s = Math.max(0, (now - ms) / 1000)
  if (s < 60) return t('только что')
  if (s < 3600) return t('{n} мин назад', { n: Math.floor(s / 60) })
  if (s < 86400) return t('{n} ч назад', { n: Math.floor(s / 3600) })
  return fmtDate(ms)
}
