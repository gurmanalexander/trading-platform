import { BINANCE_HOSTS, type BinanceHosts } from './exchanges/binance'
import { BYBIT_HOSTS } from './exchanges/bybit'

/**
 * Значения, которые подставляет сборка (scripts/build-extension.mjs):
 * __SITES__ — адреса сайта журнала, которым мост отвечает;
 * __MOCK__ — адрес учебной «биржи» для проверки без настоящих ключей (в обычной сборке пусто);
 * __VERSION__ — версия из манифеста;
 * __TICK_MIN__ — раз во сколько минут мост сам догружает историю.
 */
declare const __SITES__: string[]
declare const __MOCK__: string
declare const __VERSION__: string
declare const __TICK_MIN__: number

export const SITES: string[] = typeof __SITES__ !== 'undefined' ? __SITES__ : []
export const VERSION: string = typeof __VERSION__ !== 'undefined' ? __VERSION__ : 'dev'
export const TICK_MIN: number = typeof __TICK_MIN__ !== 'undefined' ? __TICK_MIN__ : 5
const mock = typeof __MOCK__ !== 'undefined' ? __MOCK__ : ''

export const HOSTS: { binance: BinanceHosts; bybit: string[] } = mock
  ? { binance: { futures: mock + '/binance-f', spot: mock + '/binance-s' }, bybit: [mock + '/bybit'] }
  : { binance: BINANCE_HOSTS, bybit: BYBIT_HOSTS }

/** Страница журнала, с которой пришёл запрос, — из разрешённых? Адреса в SITES — начала допустимых адресов */
export function allowedSite(url: string | undefined): boolean {
  return !!url && SITES.some((site) => url.startsWith(site))
}
