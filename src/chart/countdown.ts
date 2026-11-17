import type { ISeriesPrimitive, ISeriesPrimitiveAxisView, Time } from 'lightweight-charts'
import { fmtDuration } from '../lib/format'

export interface CountdownHost {
  /** последняя свеча: время начала (сек), цена закрытия и направление */
  last(): { time: number; close: number; up: boolean } | null
  tfSec(): number
  /** y последней цены на шкале; null — цена вне экрана */
  yOf(price: number): number | null
  fontSize(): number
  enabled(): boolean
  colors(): { up: string; down: string }
}

/**
 * Время до закрытия свечи — плашкой сразу под меткой последней цены на шкале, как в TradingView.
 * Обновляется раз в секунду.
 */
export function countdownPrimitive(host: CountdownHost): ISeriesPrimitive<Time> {
  let timer = 0
  let views: ISeriesPrimitiveAxisView[] = []
  const build = () => {
    views = []
    const b = host.last()
    const sec = host.tfSec()
    // у месячных свечей длина плавает — таймер не показываем
    if (!host.enabled() || !b || sec <= 0 || sec > 7 * 86400) return
    const left = b.time + sec - Math.floor(Date.now() / 1000)
    const y = host.yOf(b.close)
    if (left <= 0 || y == null) return
    // высота метки цены у библиотеки — шрифт плюс отступы по 3/12 шрифта сверху и снизу
    const fs = host.fontSize()
    const bg = b.up ? host.colors().up : host.colors().down
    const text = fmtDuration(left)
    views = [{ coordinate: () => y + fs * 1.5 + 1, text: () => text, textColor: () => '#fff', backColor: () => bg }]
  }
  return {
    attached: ({ requestUpdate }) => {
      timer = window.setInterval(() => {
        if (host.enabled() && document.visibilityState === 'visible') requestUpdate()
      }, 1000)
    },
    detached: () => clearInterval(timer),
    updateAllViews: build,
    priceAxisViews: () => views,
  }
}
