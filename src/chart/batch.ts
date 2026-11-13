import { symbolKey, type SymbolRef } from '../types'
import { app, paneCount, theme, type PaneState } from '../stores/app'
import { alerts } from '../stores/alerts'
import { drawings } from '../stores/drawings'
import { chartColors } from './theme'
import { ChartController, snapshotName } from './controller'

/** Снимок монеты: все окна текущей раскладки одной картинкой */
export interface CoinShot {
  ref: SymbolRef
  /** null — свечи загрузить не удалось */
  blob: Blob | null
  name: string
  /** последняя цена по загруженным свечам */
  last?: number
}

// Размер картинки в точках экрана: как широкий монитор, одинаково с телефона и с компьютера
const WIDTH = 1280
const HEIGHT = 720
/** картинка не шире этого, даже на экране с высокой плотностью точек */
const MAX_PIXELS = 2560
const GAP = 2

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
/** Ждёт отрисовки; в фоновой вкладке кадров нет — тогда не дольше ms */
const frames = (ms: number) =>
  Promise.race([new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))).then(() => sleep(ms / 2)), sleep(ms * 2)])

/**
 * Рисует монеты по очереди на графиках вне экрана: раскладка, интервалы, вид графиков и индикаторы —
 * как сейчас в окнах, рисунки и запомненный вид — как у каждой монеты. То, что на экране, не трогается.
 * step вызывается перед каждой монетой; вернул false — остановиться.
 */
export async function renderCoins(refs: SymbolRef[], step: (index: number, ref: SymbolRef) => boolean): Promise<CoinShot[]> {
  const layout = app.layout
  const root = document.createElement('div')
  const colors = chartColors(theme.value)
  root.style.cssText = `position:fixed;left:-20000px;top:0;width:${WIDTH}px;height:${HEIGHT}px;display:flex;gap:${GAP}px;pointer-events:none;contain:strict;flex-direction:${layout.dir === 'rows' ? 'column' : 'row'}`
  const cells: HTMLElement[] = []
  layout.groups.forEach((n, gi) => {
    const group = document.createElement('div')
    group.style.cssText = `display:flex;gap:${GAP}px;min-width:0;min-height:0;flex:${layout.groupSizes[gi]} 1 0;flex-direction:${layout.dir === 'rows' ? 'row' : 'column'}`
    for (let ci = 0; ci < n; ci++) {
      const cell = document.createElement('div')
      cell.style.cssText = `position:relative;min-width:0;min-height:0;flex:${layout.cellSizes[gi][ci]} 1 0`
      group.appendChild(cell)
      cells.push(cell)
    }
    root.appendChild(group)
  })
  document.body.appendChild(root)

  // свои копии настроек окон: инструмент меняется здесь, а не в окнах на экране
  const panes: PaneState[] = app.panes.slice(0, paneCount.value).map((p) => JSON.parse(JSON.stringify(p)))
  const charts = cells.map((cell, i) => new ChartController(cell, panes[i], 1000 + i, { live: false }))
  const out: CoinShot[] = []
  try {
    await frames(60)
    for (let i = 0; i < refs.length; i++) {
      const ref = refs[i]
      if (!step(i, ref)) break
      const key = symbolKey(ref)
      const prices = alerts.filter((a) => a.active && symbolKey(a.ref) === key).map((a) => a.price)
      await Promise.all(
        charts.map((c, k) => {
          panes[k].symbol = { exchange: ref.exchange, market: ref.market, symbol: ref.symbol }
          c.draw.setList(drawings[key] ?? [])
          c.setAlertLines(prices)
          // масштаб прошлой монеты не переносится: у этой либо свой запомненный вид, либо обычный
          c.chart.timeScale().applyOptions({ barSpacing: 8 })
          return c.load()
        }),
      )
      const ok = charts.some((c) => c.bars.length > 0 && !c.ui.error)
      // запомненный вид (прокрутка, диапазон цен) применяется уже после загрузки
      await frames(300)
      const first = charts.find((c) => c.bars.length)
      out.push({ ref, blob: ok ? await compose(root, charts, colors.border) : null, name: snapshotName(ref), last: first?.bars[first.bars.length - 1].close })
    }
  } finally {
    charts.forEach((c) => c.destroy())
    root.remove()
  }
  return out
}

function compose(root: HTMLElement, charts: ChartController[], border: string): Promise<Blob | null> {
  const box = root.getBoundingClientRect()
  const k = Math.min(window.devicePixelRatio || 1, MAX_PIXELS / WIDTH)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(box.width * k)
  canvas.height = Math.round(box.height * k)
  const ctx = canvas.getContext('2d')
  if (!ctx) return Promise.resolve(null)
  // фон — цвет границ: зазоры между окнами станут разделительными линиями
  ctx.fillStyle = border
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  for (const chart of charts) {
    const shot = chart.capture()
    if (!shot) continue
    const r = chart.element.getBoundingClientRect()
    ctx.drawImage(shot, Math.round((r.left - box.left) * k), Math.round((r.top - box.top) * k), Math.round(r.width * k), Math.round(r.height * k))
  }
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
}
