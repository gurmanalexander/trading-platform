import { reactive, ref } from 'vue'
import { load, persist } from '../lib/storage'

export type DrawingType = 'trend' | 'ray' | 'hline' | 'vline' | 'rect' | 'fib' | 'measure'

/** Точка привязки: время (сек UTC) и цена — рисунок не зависит от масштаба и таймфрейма */
export interface Pt {
  t: number
  p: number
}

export interface Drawing {
  id: string
  type: DrawingType
  pts: Pt[]
  color: string
}

export const DRAW_COLORS = ['#4c8dff', '#1fb28a', '#f0566b', '#e8a838', '#a78bfa', '#d6dbe4']

/** Рисунки по ключу инструмента */
export const drawings = reactive<Record<string, Drawing[]>>(load('drawings', {}))
persist('drawings', drawings, () => drawings, 600)

export function drawingsOf(key: string): Drawing[] {
  return (drawings[key] ??= [])
}

export function removeDrawing(key: string, id: string) {
  const list = drawings[key]
  if (!list) return
  const i = list.findIndex((d) => d.id === id)
  if (i >= 0) list.splice(i, 1)
  if (!list.length) delete drawings[key]
}

export function clearDrawings(key: string) {
  delete drawings[key]
}

/** Выбранный рисунок — один на всё приложение */
export const selection = ref<{ pane: number; id: string } | null>(null)
