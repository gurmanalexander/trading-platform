import { reactive, ref } from 'vue'
import { load, persist } from '../lib/storage'

export type DrawingType = 'trend' | 'ray' | 'hline' | 'hray' | 'vline' | 'cross' | 'rect' | 'fib' | 'long' | 'short' | 'text' | 'measure'
export type Dash = 'solid' | 'dashed' | 'dotted'
/** На каких интервалах рисунок виден: на всех, только внутри дня (< 1Д) или только от дня и старше */
export type Visibility = 'all' | 'intraday' | 'daily'

/** Точка привязки: время (сек UTC) и цена — рисунок не зависит от масштаба и таймфрейма */
export interface Pt {
  t: number
  p: number
}

/**
 * Рисунок. Точки по типам: линии и фигуры — 1 или 2 точки;
 * позиция (long/short) — [вход, {правый край, цель}, {время входа, стоп}].
 */
export interface Drawing {
  id: string
  type: DrawingType
  pts: Pt[]
  color: string
  width?: number
  dash?: Dash
  text?: string
  vis?: Visibility
  /** размер шрифта текста, px */
  size?: number
  /** текст на подложке */
  bg?: boolean
  /** заметка, собранная из чеклиста: одна на инструмент, обновляется на месте */
  note?: boolean
  /**
   * Текст закреплён на экране: доли ширины и высоты окна вместо времени и цены.
   * Такой текст не уезжает при прокрутке и стоит в одном углу на любом интервале.
   */
  pin?: { x: number; y: number }
}

/** Позиции по умолчанию видны только на внутридневных интервалах: на дневке они сливаются в точку */
export const defaultVisibility = (type: DrawingType): Visibility => (type === 'long' || type === 'short' ? 'intraday' : 'all')

export function visibleOn(d: Drawing, tfSec: number): boolean {
  const vis = d.vis ?? defaultVisibility(d.type)
  return vis === 'all' || (vis === 'intraday' ? tfSec < 86400 : tfSec >= 86400)
}

export interface DrawStyle {
  color: string
  width: number
  dash: Dash
}

export const DRAW_COLORS = ['#4c8dff', '#1fb28a', '#f0566b', '#e8a838', '#a78bfa', '#d6dbe4']
const BASE_STYLE: DrawStyle = { color: '#4c8dff', width: 1, dash: 'solid' }

/** Стиль по умолчанию для каждого инструмента (задаётся кнопкой «по умолчанию» на панели рисунка) */
export const drawDefaults = reactive<Record<string, DrawStyle>>(load('drawDefaults', {}))
persist('drawDefaults', drawDefaults, () => drawDefaults)

export const styleFor = (type: DrawingType): DrawStyle => ({ ...BASE_STYLE, ...drawDefaults[type] })
export function setDefaultStyle(type: DrawingType, style: DrawStyle) {
  drawDefaults[type] = { color: style.color, width: style.width, dash: style.dash }
}

/** Рисунки по ключу инструмента */
export const drawings = reactive<Record<string, Drawing[]>>(load('drawings', {}))
persist('drawings', drawings, () => drawings, 600)

/** Выбранный рисунок — один на всё приложение */
export const selection = ref<{ pane: number; id: string } | null>(null)

export function drawingsOf(key: string): Drawing[] {
  return (drawings[key] ??= [])
}

export function clearDrawings(key: string) {
  if (!drawings[key]?.length) return
  checkpoint()
  delete drawings[key]
}

// ---------- отмена и повтор ----------

const HISTORY_LIMIT = 60
const undoStack: string[] = []
const redoStack: string[] = []

/** Запоминает состояние рисунков перед изменением */
export function checkpoint() {
  undoStack.push(JSON.stringify(drawings))
  if (undoStack.length > HISTORY_LIMIT) undoStack.shift()
  redoStack.length = 0
}

function restore(json: string) {
  const next = JSON.parse(json) as Record<string, Drawing[]>
  for (const k of Object.keys(drawings)) delete drawings[k]
  Object.assign(drawings, next)
  selection.value = null
}

export function undo(): boolean {
  const prev = undoStack.pop()
  if (prev === undefined) return false
  redoStack.push(JSON.stringify(drawings))
  restore(prev)
  return true
}

export function redo(): boolean {
  const next = redoStack.pop()
  if (next === undefined) return false
  undoStack.push(JSON.stringify(drawings))
  restore(next)
  return true
}

/**
 * Скопированный рисунок (Ctrl+C / Ctrl+V). text — то, что при копировании ушло в системный
 * буфер: по нему при вставке отличаем «свой» рисунок от текста сделки, пришедшего извне.
 */
export const clipboard: { item: Drawing | null; text: string } = { item: null, text: '' }

/** Добавляет рисунок инструменту напрямую, минуя график (вставка сделки текстом) */
export function addDrawing(key: string, d: Drawing) {
  checkpoint()
  drawingsOf(key).push(d)
}

// ---------- синхронизация между устройствами ----------

/** Принимает рисунки инструмента с другого устройства: массив заменяется на месте, графики перерисуются сами */
export function importDrawings(key: string, raw: unknown) {
  if (!Array.isArray(raw)) return
  const clean = raw.filter((d) => d && typeof d.id === 'string' && typeof d.type === 'string' && Array.isArray(d.pts) && d.pts.every((p: Pt) => p && isFinite(p.t) && isFinite(p.p)))
  if (!clean.length && !drawings[key]) return
  const cur = drawingsOf(key)
  cur.splice(0, cur.length, ...(clean as Drawing[]))
}

export function importDrawDefaults(raw: unknown) {
  if (!raw || typeof raw !== 'object') return
  for (const k of Object.keys(drawDefaults)) delete drawDefaults[k]
  Object.assign(drawDefaults, raw)
}
