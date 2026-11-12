import { reactive, ref } from 'vue'
import { load, persist } from '../lib/storage'

export type DrawingType = 'trend' | 'ray' | 'hline' | 'hray' | 'vline' | 'cross' | 'rect' | 'fib' | 'long' | 'short' | 'measure'
export type Dash = 'solid' | 'dashed' | 'dotted'

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

/** Скопированный рисунок (Ctrl+C / Ctrl+V) */
export const clipboard: { item: Drawing | null } = { item: null }
