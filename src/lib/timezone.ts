/**
 * Часовой пояс графиков — как в TradingView: «местное» (как на устройстве), UTC или город.
 * Пояс влияет только на подписи времени внутридневных графиков; дневные и старше свечи
 * подписаны датами биржи (UTC).
 */

import { t } from './i18n'

export interface TimeZoneOption {
  id: string
  /** название города; у местного и UTC — своё */
  name: string
}

export const LOCAL_TZ = 'local'

export const TIMEZONES: TimeZoneOption[] = [
  { id: LOCAL_TZ, name: 'Как на устройстве' },
  { id: 'UTC', name: 'UTC' },
  { id: 'Pacific/Honolulu', name: 'Гонолулу' },
  { id: 'America/Anchorage', name: 'Анкоридж' },
  { id: 'America/Los_Angeles', name: 'Лос-Анджелес' },
  { id: 'America/Denver', name: 'Денвер' },
  { id: 'America/Chicago', name: 'Чикаго' },
  { id: 'America/New_York', name: 'Нью-Йорк' },
  { id: 'America/Sao_Paulo', name: 'Сан-Паулу' },
  { id: 'Europe/London', name: 'Лондон' },
  { id: 'Europe/Berlin', name: 'Берлин' },
  { id: 'Europe/Warsaw', name: 'Варшава' },
  { id: 'Europe/Kyiv', name: 'Киев' },
  { id: 'Europe/Riga', name: 'Рига' },
  { id: 'Europe/Istanbul', name: 'Стамбул' },
  { id: 'Europe/Minsk', name: 'Минск' },
  { id: 'Europe/Moscow', name: 'Москва' },
  { id: 'Asia/Tbilisi', name: 'Тбилиси' },
  { id: 'Asia/Dubai', name: 'Дубай' },
  { id: 'Asia/Tashkent', name: 'Ташкент' },
  { id: 'Asia/Yekaterinburg', name: 'Екатеринбург' },
  { id: 'Asia/Almaty', name: 'Алматы' },
  { id: 'Asia/Kolkata', name: 'Калькутта' },
  { id: 'Asia/Novosibirsk', name: 'Новосибирск' },
  { id: 'Asia/Bangkok', name: 'Бангкок' },
  { id: 'Asia/Singapore', name: 'Сингапур' },
  { id: 'Asia/Hong_Kong', name: 'Гонконг' },
  { id: 'Asia/Shanghai', name: 'Шанхай' },
  { id: 'Asia/Tokyo', name: 'Токио' },
  { id: 'Asia/Vladivostok', name: 'Владивосток' },
  { id: 'Australia/Sydney', name: 'Сидней' },
  { id: 'Pacific/Auckland', name: 'Окленд' },
]

const formatters = new Map<string, Intl.DateTimeFormat>()

/** Пояс понятен браузеру */
export function isTimeZone(id: unknown): id is string {
  if (id === LOCAL_TZ || id === 'UTC') return true
  if (typeof id !== 'string' || !id) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: id })
    return true
  } catch {
    return false
  }
}

/** Сдвиг пояса от UTC в секундах на момент atMs (с учётом летнего времени на этот момент) */
export function tzOffsetSec(id: string, atMs = Date.now()): number {
  if (id === LOCAL_TZ) return -new Date(atMs).getTimezoneOffset() * 60
  if (id === 'UTC') return 0
  let f = formatters.get(id)
  if (!f) {
    try {
      f = new Intl.DateTimeFormat('en-US', {
        timeZone: id,
        hourCycle: 'h23',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
      })
    } catch {
      return -new Date(atMs).getTimezoneOffset() * 60
    }
    formatters.set(id, f)
  }
  const p: Record<string, number> = {}
  for (const part of f.formatToParts(new Date(atMs))) if (part.type !== 'literal') p[part.type] = +part.value
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return Math.round((asUtc - Math.floor(atMs / 1000) * 1000) / 60_000) * 60
}

/** «UTC+3», «UTC−3:30», «UTC» */
export function fmtOffset(sec: number): string {
  if (!sec) return 'UTC'
  const a = Math.abs(sec)
  const h = Math.floor(a / 3600)
  const m = Math.round((a % 3600) / 60)
  return `UTC${sec > 0 ? '+' : '−'}${h}${m ? ':' + String(m).padStart(2, '0') : ''}`
}

/** Подпись пояса в меню: «(UTC+3) Москва»; у местного — «Как на устройстве (UTC+3)» */
export function tzMenuLabel(o: TimeZoneOption): string {
  if (o.id === 'UTC') return 'UTC'
  if (o.id === LOCAL_TZ) return `${t(o.name)} (${fmtOffset(tzOffsetSec(o.id))})`
  return `(${fmtOffset(tzOffsetSec(o.id))}) ${t(o.name)}`
}
