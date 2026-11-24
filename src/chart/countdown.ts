import type { ISeriesPrimitive, ISeriesPrimitiveAxisView, Time } from 'lightweight-charts'
import { fmtDuration } from '../lib/format'
import { textOn } from '../lib/color'

export interface CountdownHost {
  /** последняя свеча: время начала (сек), цена закрытия и направление */
  last(): { time: number; close: number; up: boolean } | null
  tfSec(): number
  /** y последней цены на шкале; null — цена вне экрана */
  yOf(price: number): number | null
  fontSize(): number
  enabled(): boolean
  colors(): { up: string; down: string }
  /**
   * Подпись последней цены; null — подписывает сама библиотека. Своя метка нужна потому, что
   * библиотека подписывает последнюю ВИДИМУЮ свечу: стоит последней уйти за край, метка показывает
   * чужую цену. В TradingView метка — всегда текущая цена, цветом последнего бара.
   */
  priceText(price: number): string | null
}

/**
 * Метка последней цены и время до закрытия свечи — плашкой сразу под ней, как в TradingView.
 * Таймер обновляется раз в секунду.
 */
export function countdownPrimitive(host: CountdownHost): ISeriesPrimitive<Time> {
  let timer = 0
  let views: ISeriesPrimitiveAxisView[] = []
  const build = () => {
    views = []
    const b = host.last()
    if (!b) return
    const y = host.yOf(b.close)
    if (y == null) return
    const bg = b.up ? host.colors().up : host.colors().down
    const fg = textOn(bg)
    const price = host.priceText(b.close)
    if (price !== null) views.push({ coordinate: () => y, text: () => price, textColor: () => fg, backColor: () => bg })
    const sec = host.tfSec()
    // у месячных свечей длина плавает — таймер не показываем
    if (!host.enabled() || sec <= 0 || sec > 7 * 86400) return
    const left = b.time + sec - Math.floor(Date.now() / 1000)
    if (left <= 0) return
    // высота метки цены у библиотеки — шрифт плюс отступы по 3/12 шрифта сверху и снизу
    const fs = host.fontSize()
    const text = fmtDuration(left)
    views.push({ coordinate: () => y + fs * 1.5 + 1, text: () => text, textColor: () => fg, backColor: () => bg })
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
