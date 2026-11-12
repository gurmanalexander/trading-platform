import type { Bar } from '../types'

// ---------- математика ----------
// Все функции возвращают массив той же длины, что и вход; «нет значения» — NaN.

type Arr = ArrayLike<number>

const blank = (n: number) => new Float64Array(n).fill(NaN)

function firstFinite(src: Arr): number {
  for (let i = 0; i < src.length; i++) if (isFinite(src[i])) return i
  return src.length
}

export function sma(src: Arr, len: number): Float64Array {
  const n = src.length
  const out = blank(n)
  const start = firstFinite(src)
  let sum = 0
  for (let i = start; i < n; i++) {
    sum += src[i]
    if (i - start >= len) sum -= src[i - len]
    if (i - start >= len - 1) out[i] = sum / len
  }
  return out
}

/** Экспоненциальное сглаживание с коэффициентом alpha; первое значение — SMA */
function smooth(src: Arr, len: number, alpha: number): Float64Array {
  const n = src.length
  const out = blank(n)
  const start = firstFinite(src)
  if (n - start < len) return out
  let sum = 0
  for (let i = start; i < start + len; i++) sum += src[i]
  let prev = sum / len
  out[start + len - 1] = prev
  for (let i = start + len; i < n; i++) {
    prev = prev + alpha * (src[i] - prev)
    out[i] = prev
  }
  return out
}

export const ema = (src: Arr, len: number) => smooth(src, len, 2 / (len + 1))
/** Сглаживание Уайлдера (RMA) — основа RSI и ATR */
export const rma = (src: Arr, len: number) => smooth(src, len, 1 / len)

export function wma(src: Arr, len: number): Float64Array {
  const n = src.length
  const out = blank(n)
  const start = firstFinite(src)
  const denom = (len * (len + 1)) / 2
  for (let i = start + len - 1; i < n; i++) {
    let s = 0
    for (let k = 0; k < len; k++) s += src[i - k] * (len - k)
    out[i] = s / denom
  }
  return out
}

export function bollinger(src: Arr, len: number, mult: number) {
  const n = src.length
  const mid = sma(src, len)
  const upper = blank(n)
  const lower = blank(n)
  for (let i = len - 1; i < n; i++) {
    const m = mid[i]
    if (!isFinite(m)) continue
    let v = 0
    for (let k = 0; k < len; k++) {
      const d = src[i - k] - m
      v += d * d
    }
    const sd = Math.sqrt(v / len)
    upper[i] = m + mult * sd
    lower[i] = m - mult * sd
  }
  return { mid, upper, lower }
}

export function rsi(src: Arr, len: number): Float64Array {
  const n = src.length
  const up = blank(n)
  const down = blank(n)
  for (let i = 1; i < n; i++) {
    const d = src[i] - src[i - 1]
    up[i] = d > 0 ? d : 0
    down[i] = d < 0 ? -d : 0
  }
  const au = rma(up, len)
  const ad = rma(down, len)
  const out = blank(n)
  for (let i = 0; i < n; i++) {
    if (!isFinite(au[i])) continue
    out[i] = ad[i] === 0 ? 100 : 100 - 100 / (1 + au[i] / ad[i])
  }
  return out
}

export function macd(src: Arr, fast: number, slow: number, signalLen: number) {
  const n = src.length
  const f = ema(src, fast)
  const s = ema(src, slow)
  const line = blank(n)
  for (let i = 0; i < n; i++) line[i] = f[i] - s[i]
  const signal = ema(line, signalLen)
  const hist = blank(n)
  for (let i = 0; i < n; i++) hist[i] = line[i] - signal[i]
  return { line, signal, hist }
}

export function stochastic(high: Arr, low: Arr, close: Arr, kLen: number, kSmooth: number, dLen: number) {
  const n = close.length
  const raw = blank(n)
  for (let i = kLen - 1; i < n; i++) {
    let hh = -Infinity
    let ll = Infinity
    for (let k = 0; k < kLen; k++) {
      if (high[i - k] > hh) hh = high[i - k]
      if (low[i - k] < ll) ll = low[i - k]
    }
    raw[i] = hh === ll ? 50 : ((close[i] - ll) / (hh - ll)) * 100
  }
  const k = kSmooth > 1 ? sma(raw, kSmooth) : raw
  const d = sma(k, dLen)
  return { k, d }
}

export function atr(high: Arr, low: Arr, close: Arr, len: number): Float64Array {
  const n = close.length
  const tr = blank(n)
  for (let i = 0; i < n; i++) {
    const hl = high[i] - low[i]
    tr[i] = i === 0 ? hl : Math.max(hl, Math.abs(high[i] - close[i - 1]), Math.abs(low[i] - close[i - 1]))
  }
  return rma(tr, len)
}

/** VWAP с привязкой к началу суток (UTC) */
export function vwap(time: Arr, high: Arr, low: Arr, close: Arr, volume: Arr): Float64Array {
  const n = close.length
  const out = blank(n)
  let pv = 0
  let vol = 0
  let day = -1
  for (let i = 0; i < n; i++) {
    const d = Math.floor(time[i] / 86400)
    if (d !== day) {
      day = d
      pv = 0
      vol = 0
    }
    pv += ((high[i] + low[i] + close[i]) / 3) * volume[i]
    vol += volume[i]
    out[i] = vol > 0 ? pv / vol : NaN
  }
  return out
}

// ---------- исходные ряды ----------

export interface Source {
  time: Float64Array
  open: Float64Array
  high: Float64Array
  low: Float64Array
  close: Float64Array
  volume: Float64Array
}

export function toSource(bars: Bar[]): Source {
  const n = bars.length
  const s: Source = {
    time: new Float64Array(n),
    open: new Float64Array(n),
    high: new Float64Array(n),
    low: new Float64Array(n),
    close: new Float64Array(n),
    volume: new Float64Array(n),
  }
  for (let i = 0; i < n; i++) {
    const b = bars[i]
    s.time[i] = b.time
    s.open[i] = b.open
    s.high[i] = b.high
    s.low[i] = b.low
    s.close[i] = b.close
    s.volume[i] = b.volume
  }
  return s
}

// ---------- реестр индикаторов ----------

export interface ParamDef {
  key: string
  label: string
  def: number
  min: number
  max: number
  step?: number
}

export interface PlotDef {
  label: string
  kind: 'line' | 'hist'
  color: string
}

export interface IndicatorDef {
  type: string
  name: string
  short: string
  /** true — поверх цены, false — в отдельной панели под графиком */
  overlay: boolean
  params: ParamDef[]
  plots: PlotDef[]
  /** горизонтальные уровни (например, 30/70 для RSI) */
  levels?: number[]
  /** знаков после запятой; не задано — как у цены инструмента */
  precision?: number
  calc(s: Source, p: Record<string, number>): Float64Array[]
}

export interface IndicatorInstance {
  id: string
  type: string
  params: Record<string, number>
  visible: boolean
  /** свои цвета линий вместо стандартных */
  colors?: string[]
}

const len = (def: number, label = 'Период'): ParamDef => ({ key: 'len', label, def, min: 1, max: 1000 })

export const INDICATORS: IndicatorDef[] = [
  {
    type: 'vol',
    name: 'Объём',
    short: 'Объём',
    overlay: true,
    params: [],
    plots: [{ label: 'Объём', kind: 'hist', color: '#7d8799' }],
    calc: (s) => [s.volume],
  },
  {
    type: 'sma',
    name: 'Скользящая средняя (SMA)',
    short: 'SMA',
    overlay: true,
    params: [len(50)],
    plots: [{ label: 'SMA', kind: 'line', color: '#e8a838' }],
    calc: (s, p) => [sma(s.close, p.len)],
  },
  {
    type: 'ema',
    name: 'Экспоненциальная средняя (EMA)',
    short: 'EMA',
    overlay: true,
    params: [len(20)],
    plots: [{ label: 'EMA', kind: 'line', color: '#4c8dff' }],
    calc: (s, p) => [ema(s.close, p.len)],
  },
  {
    type: 'wma',
    name: 'Взвешенная средняя (WMA)',
    short: 'WMA',
    overlay: true,
    params: [len(20)],
    plots: [{ label: 'WMA', kind: 'line', color: '#c678dd' }],
    calc: (s, p) => [wma(s.close, p.len)],
  },
  {
    type: 'bb',
    name: 'Полосы Боллинджера',
    short: 'BB',
    overlay: true,
    params: [len(20), { key: 'mult', label: 'Отклонение', def: 2, min: 0.1, max: 10, step: 0.1 }],
    plots: [
      { label: 'Средняя', kind: 'line', color: '#e8a838' },
      { label: 'Верх', kind: 'line', color: '#3fa7a3' },
      { label: 'Низ', kind: 'line', color: '#3fa7a3' },
    ],
    calc: (s, p) => {
      const b = bollinger(s.close, p.len, p.mult)
      return [b.mid, b.upper, b.lower]
    },
  },
  {
    type: 'vwap',
    name: 'VWAP (дневной)',
    short: 'VWAP',
    overlay: true,
    params: [],
    plots: [{ label: 'VWAP', kind: 'line', color: '#d86bb0' }],
    calc: (s) => [vwap(s.time, s.high, s.low, s.close, s.volume)],
  },
  {
    type: 'rsi',
    name: 'Индекс относительной силы (RSI)',
    short: 'RSI',
    overlay: false,
    params: [len(14)],
    plots: [{ label: 'RSI', kind: 'line', color: '#a78bfa' }],
    levels: [70, 30],
    precision: 2,
    calc: (s, p) => [rsi(s.close, p.len)],
  },
  {
    type: 'macd',
    name: 'MACD',
    short: 'MACD',
    overlay: false,
    params: [
      { key: 'fast', label: 'Быстрая', def: 12, min: 1, max: 500 },
      { key: 'slow', label: 'Медленная', def: 26, min: 1, max: 500 },
      { key: 'signal', label: 'Сигнальная', def: 9, min: 1, max: 500 },
    ],
    plots: [
      { label: 'Гистограмма', kind: 'hist', color: '#7d8799' },
      { label: 'MACD', kind: 'line', color: '#4c8dff' },
      { label: 'Сигнал', kind: 'line', color: '#e8a838' },
    ],
    calc: (s, p) => {
      const m = macd(s.close, p.fast, p.slow, p.signal)
      return [m.hist, m.line, m.signal]
    },
  },
  {
    type: 'stoch',
    name: 'Стохастик',
    short: 'Stoch',
    overlay: false,
    params: [
      { key: 'k', label: 'Период %K', def: 14, min: 1, max: 500 },
      { key: 'smooth', label: 'Сглаживание %K', def: 1, min: 1, max: 100 },
      { key: 'd', label: 'Период %D', def: 3, min: 1, max: 100 },
    ],
    plots: [
      { label: '%K', kind: 'line', color: '#4c8dff' },
      { label: '%D', kind: 'line', color: '#e8a838' },
    ],
    levels: [80, 20],
    precision: 2,
    calc: (s, p) => {
      const r = stochastic(s.high, s.low, s.close, p.k, p.smooth, p.d)
      return [r.k, r.d]
    },
  },
  {
    type: 'atr',
    name: 'Средний истинный диапазон (ATR)',
    short: 'ATR',
    overlay: false,
    params: [len(14)],
    plots: [{ label: 'ATR', kind: 'line', color: '#e06c75' }],
    calc: (s, p) => [atr(s.high, s.low, s.close, p.len)],
  },
]

const defs = new Map(INDICATORS.map((d) => [d.type, d]))
export const indicatorDef = (type: string) => defs.get(type)

export function newIndicator(type: string): IndicatorInstance | null {
  const def = defs.get(type)
  if (!def) return null
  const params: Record<string, number> = {}
  for (const p of def.params) params[p.key] = p.def
  return { id: Math.random().toString(36).slice(2, 9), type, params, visible: true }
}

/** Подпись в легенде: "EMA 20", "MACD 12 26 9" */
export function indicatorTitle(inst: IndicatorInstance): string {
  const def = defs.get(inst.type)
  if (!def) return inst.type
  const args = def.params.map((p) => inst.params[p.key] ?? p.def).join(' ')
  return args ? `${def.short} ${args}` : def.short
}

/** Параметры экземпляра с подстановкой значений по умолчанию и защитой от мусора */
export function resolveParams(def: IndicatorDef, inst: IndicatorInstance): Record<string, number> {
  const out: Record<string, number> = {}
  for (const p of def.params) {
    const v = Number(inst.params[p.key])
    out[p.key] = isFinite(v) ? Math.min(p.max, Math.max(p.min, v)) : p.def
  }
  return out
}
