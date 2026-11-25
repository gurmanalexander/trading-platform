import type { Drawing, DrawingType, VisChoice, Visibility } from '../stores/drawings'

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
