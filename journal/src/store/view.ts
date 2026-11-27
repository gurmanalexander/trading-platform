import { computed, reactive } from 'vue'
import { formatSetup } from '../../../src/lib/setup'
import { t } from '../lib/i18n'
import { applyFilter, byDay, dayIndex, dayStart, equityCurve, summarize, type Filter } from '../core/stats'
import type { Trade } from '../core/types'
import { prefs, state, tagsOf, trades, tzMin, type Period } from './journal'

/** Что сейчас на экране: раздел, отбор сделок, открытая сделка */
export type Tab = 'overview' | 'trades' | 'calendar' | 'accounts'

export const ui = reactive({
  tab: 'overview' as Tab,
  /** дополнительный отбор в списке сделок */
  sym: '',
  side: 0 as 0 | 1 | -1,
  tag: '',
  /** один день (номер дня в поясе устройства), выбранный в календаре; null — весь период */
  day: null as number | null,
  /** идентификатор сделки, открытой в боковой панели */
  open: '',
  syncOpen: false,
  syncCode: '',
  /** «сейчас» для границ периода; обновляется при возврате на вкладку */
  now: Date.now(),
})

export const PERIODS: { id: Period; label: () => string }[] = [
  { id: 'today', label: () => t('Сегодня') },
  { id: '7d', label: () => t('7 дней') },
  { id: '30d', label: () => t('30 дней') },
  { id: '90d', label: () => t('90 дней') },
  { id: 'ytd', label: () => t('Год') },
  { id: 'all', label: () => t('Всё время') },
]

/** Начало периода, мс; undefined — без ограничения. Дни — календарные, в поясе устройства */
export function periodStart(p: Period, now: number): number | undefined {
  const today = dayIndex(now, tzMin)
  if (p === 'today') return dayStart(today, tzMin)
  if (p === '7d') return dayStart(today - 6, tzMin)
  if (p === '30d') return dayStart(today - 29, tzMin)
  if (p === '90d') return dayStart(today - 89, tzMin)
  if (p === 'ytd') return new Date(new Date(now).getFullYear(), 0, 1).getTime()
  return undefined
}

/** Счета, которые показываются: выбранные в отборе или все */
export const shownAccounts = computed(() => {
  const picked = prefs.accounts.filter((id) => state.accounts.some((a) => a.id === id))
  return picked.length ? picked : state.accounts.map((a) => a.id)
})

/** Все сделки показываемых счетов */
export const allTrades = computed<Trade[]>(() => shownAccounts.value.flatMap((id) => trades[id] ?? []))

/** Отбор, общий для всех разделов: счета и период */
export const baseFilter = computed<Filter>(() => ({ from: periodStart(prefs.period, ui.now) }))

/** Сделки периода — по ним считается обзор и календарь */
export const periodTrades = computed(() => applyFilter(allTrades.value, baseFilter.value))

export const summary = computed(() => summarize(periodTrades.value))
export const curve = computed(() => equityCurve(periodTrades.value))
export const days = computed(() => byDay(periodTrades.value, tzMin))

/** Сделки для списка: период плюс отбор по монете, стороне, метке и дню */
export const listTrades = computed(() => {
  const f: Filter = { ...baseFilter.value }
  if (ui.sym) f.sym = ui.sym
  if (ui.side) f.side = ui.side
  if (ui.tag) f.tag = ui.tag
  if (ui.day != null) {
    f.from = dayStart(ui.day, tzMin)
    f.to = dayStart(ui.day + 1, tzMin) - 1
  }
  return applyFilter(allTrades.value, f, tagsOf)
})

export const hasListFilter = computed(() => !!(ui.sym || ui.side || ui.tag || ui.day != null))
export function clearListFilter() {
  ui.sym = ''
  ui.side = 0
  ui.tag = ''
  ui.day = null
}

export const accountOf = (id: string) => state.accounts.find((a) => a.id === id)

/** Ссылка, открывающая сделку на графике tvx: монета, биржа, сторона и день входа */
export function tvxLink(t: Trade): string {
  const d = new Date(t.open)
  const setup = formatSetup({
    date: { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() },
    exchange: accountOf(t.acct)?.exchange,
    market: 'futures',
    symbol: t.sym,
    side: t.side > 0 ? 'long' : 'short',
  })
  return new URL('../', new URL('./', location.href)).href + '?q=' + encodeURIComponent(setup)
}

/** Адрес самого tvx — журнал лежит в его подпапке */
export const tvxHome = () => new URL('../', new URL('./', location.href)).href
