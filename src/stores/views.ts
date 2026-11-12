import { load, save } from '../lib/storage'

/**
 * Вид графика, который пользователь настроил руками: масштаб, место прокрутки и вертикальный
 * диапазон. Хранится по инструменту и интервалу — при возврате к монете график встаёт как был.
 */
export interface ChartView {
  /** ширина свечи, px */
  spacing: number
  /** true — график следил за текущей ценой; тогда важен только отступ справа */
  realtime: boolean
  /** отступ справа в свечах (для realtime) */
  offset: number
  /** момент в центре экрана, сек UTC (если график был отмотан в прошлое) */
  center: number
  /** вертикальный диапазон, если автомасштаб был выключен */
  price: { from: number; to: number } | null
  at: number
}

const LIMIT = 400
const views: Record<string, ChartView> = load('views', {})
let timer = 0

function persist() {
  if (timer) return
  timer = window.setTimeout(() => {
    timer = 0
    // храним только самые свежие записи, чтобы хранилище не росло бесконечно
    const keys = Object.keys(views)
    if (keys.length > LIMIT) {
      keys.sort((a, b) => views[a].at - views[b].at)
      for (const k of keys.slice(0, keys.length - LIMIT)) delete views[k]
    }
    save('views', views)
  }, 800)
}

export const viewKey = (symbolKey: string, tf: string) => `${symbolKey}|${tf}`
export const getView = (key: string): ChartView | undefined => views[key]

export function setView(key: string, view: ChartView) {
  views[key] = view
  persist()
}

export function clearView(key: string) {
  if (!(key in views)) return
  delete views[key]
  persist()
}
