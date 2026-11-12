import { activePane, theme } from '../stores/app'
import { chartColors } from './theme'
import { allCharts } from './registry'
import { downloadCanvas, snapshotName } from './controller'

/**
 * Снимок всех окон раскладки одной картинкой: графики стоят так же, как на экране.
 * Скрытые окна (например, при развёрнутом одном) в снимок не попадают.
 */
export function snapshotAll(): boolean {
  const grid = document.querySelector<HTMLElement>('main.grid')
  const charts = allCharts().filter((c) => c.element.offsetParent !== null && c.element.clientWidth > 0)
  if (!grid || !charts.length) return false
  const box = grid.getBoundingClientRect()
  const k = window.devicePixelRatio || 1
  const out = document.createElement('canvas')
  out.width = Math.round(box.width * k)
  out.height = Math.round(box.height * k)
  const ctx = out.getContext('2d')
  if (!ctx) return false
  const c = chartColors(theme.value)
  // фон — цвет границ: зазоры между окнами станут разделительными линиями
  ctx.fillStyle = c.border
  ctx.fillRect(0, 0, out.width, out.height)
  for (const chart of charts) {
    const shot = chart.capture()
    if (!shot) continue
    const r = chart.element.getBoundingClientRect()
    ctx.drawImage(shot, Math.round((r.left - box.left) * k), Math.round((r.top - box.top) * k), Math.round(r.width * k), Math.round(r.height * k))
  }
  downloadCanvas(out, snapshotName(activePane.value.symbol))
  return true
}
