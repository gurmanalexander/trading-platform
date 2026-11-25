import type { Drawing, DrawingType, VisChoice, Visibility } from '../stores/drawings'
import { TIMEFRAMES } from './timeframes'

// Видимость рисунков по интервалам — отдельно от хранилища, чтобы проверять без браузера

/** Позиции по умолчанию видны только на внутридневных интервалах: на дневке они сливаются в точку */
export const defaultVisibility = (type: DrawingType): Visibility => (type === 'long' || type === 'short' ? 'intraday' : 'all')

export function visibleOn(d: Drawing, tfSec: number): boolean {
  if (d.tfs?.length) return d.tfs.includes(tfSec)
  const vis = d.vis ?? defaultVisibility(d.type)
  return vis === 'all' || (vis === 'intraday' ? tfSec < 86400 : tfSec >= 86400)
}

/** Какой вариант видимости выбран у рисунка */
export const visChoice = (d: Drawing): VisChoice => (d.tfs?.length ? 'tf' : (d.vis ?? defaultVisibility(d.type)))

/** Все интервалы приложения — длины свечей, сек, по возрастанию */
export const ALL_TFS = TIMEFRAMES.map((f) => f.sec)

/** На каких интервалах приложения виден рисунок */
export const visibleTfs = (d: Drawing): number[] => ALL_TFS.filter((sec) => visibleOn(d, sec))

/**
 * Записывает набор интервалов в рисунок самым коротким способом: все, внутри дня и от дня — группой vis
 * (а если она совпадает с обычной для инструмента — ничем), остальное — списком tfs.
 */
export function setVisibleTfs(d: Drawing, set: number[]) {
  const want = ALL_TFS.filter((sec) => set.includes(sec))
  const same = (group: number[]) => group.length === want.length && group.every((sec, i) => sec === want[i])
  const group: Visibility | null = same(ALL_TFS)
    ? 'all'
    : same(ALL_TFS.filter((sec) => sec < 86400))
      ? 'intraday'
      : same(ALL_TFS.filter((sec) => sec >= 86400))
        ? 'daily'
        : null
  delete d.tfs
  delete d.vis
  if (!group) d.tfs = want
  else if (group !== defaultVisibility(d.type)) d.vis = group
}
