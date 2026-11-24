import { activePane, theme, toast } from '../stores/app'
import { chartColors } from './theme'
import { allCharts } from './registry'
import { downloadCanvas, snapshotName } from './controller'
import { t } from '../lib/i18n'

/**
 * Снимок всех окон раскладки одной картинкой: графики стоят так же, как на экране.
 * Скрытые окна (например, при развёрнутом одном) в снимок не попадают.
 */
export function composeAll(): HTMLCanvasElement | null {
  const grid = document.querySelector<HTMLElement>('main.grid')
  const charts = allCharts().filter((c) => c.element.offsetParent !== null && c.element.clientWidth > 0)
  if (!grid || !charts.length) return null
  const box = grid.getBoundingClientRect()
  const k = window.devicePixelRatio || 1
  const out = document.createElement('canvas')
  out.width = Math.round(box.width * k)
  out.height = Math.round(box.height * k)
  const ctx = out.getContext('2d')
  if (!ctx) return null
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
  return out
}

/** Сохраняет снимок всех окон в PNG */
export function snapshotAll(): boolean {
  const out = composeAll()
  if (!out) return false
  downloadCanvas(out, snapshotName(activePane.value.symbol))
  return true
}

/**
 * Кладёт картинку в буфер обмена. Картинка передаётся обещанием, а не готовым файлом:
 * Safari разрешает запись в буфер только синхронно в обработчике нажатия.
 */
export async function copyCanvas(canvas: HTMLCanvasElement | null): Promise<boolean> {
  if (!canvas) return false
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
    toast(t('Браузер не умеет копировать картинки в буфер — сохраните снимок файлом'), 'error')
    return false
  }
  const blob = new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('empty')))))
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
    toast(t('Снимок скопирован в буфер обмена'))
    return true
  } catch {
    toast(t('Не удалось скопировать картинку в буфер обмена'), 'error')
    return false
  }
}

/** Снимок всех окон — в буфер обмена */
export function copyAll(): Promise<boolean> {
  return copyCanvas(composeAll())
}
