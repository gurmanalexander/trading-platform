import { computed, reactive, shallowReactive, watch } from 'vue'
import { load, save } from '../../../src/lib/storage'
import { BridgeFailure, hello, onBridgeReady, pull, snapshot } from '../bridge/client'
import { DEMO_ACCOUNTS, demoData, isDemo } from '../core/demo'
import { buildTrades } from '../core/positions'
import type { BridgeErrorCode, PullCursor } from '../core/protocol'
import type { Account, Fill, Funding, Note, Snapshot, Trade } from '../core/types'
import { clearRows, getRows, kvDel, kvGet, kvSet, putRows } from './db'

/**
 * Состояние журнала: счета, сделки, пометки, ход загрузки.
 *
 * Сделки счёта берутся из двух источников. На устройстве с мостом — собираются из исполнений,
 * загруженных с биржи. На остальных (телефон) — приходят готовыми через синхронизацию.
 * Оба пути кладут результат в одно место, интерфейсу разница не видна.
 */
export interface AccountView extends Account {
  /** ключ этого счёта есть в мосте на этом устройстве — историю можно догружать отсюда */
  local?: boolean
  expiresAt?: number
  demo?: boolean
}

export interface Job {
  busy: boolean
  progress: number
  error?: BridgeErrorCode
  message?: string
}

export type Period = 'today' | '7d' | '30d' | '90d' | 'ytd' | 'all'

export const state = reactive({
  ready: false,
  bridge: 'checking' as 'checking' | 'absent' | 'ready' | 'reload',
  bridgeVersion: '',
  accounts: [] as AccountView[],
  /** счета, удалённые пользователем: их данные из синхронизации больше не принимаются */
  removed: [] as string[],
  jobs: {} as Record<string, Job>,
  /** когда счёт последний раз успешно обновлялся с биржи */
  pulled: {} as Record<string, number>,
  /** растёт при каждом изменении данных, которые синхронизируются между устройствами */
  rev: 0,
})

export const trades = shallowReactive<Record<string, Trade[]>>({})
export const snapshots = shallowReactive<Record<string, Snapshot>>({})
/** пометки к сделкам; o — время открытия сделки (по нему пометки раскладываются при синхронизации) */
export const notes = reactive<Record<string, Note & { o: number }>>({})

export const prefs = reactive({
  period: '30d' as Period,
  /** пусто — все счета */
  accounts: [] as string[],
  /** на сколько дней назад грузить историю при первом подключении счёта */
  depthDays: 180,
  demo: false,
  ...load<object>('j:prefs', {}),
})
watch(prefs, () => save('j:prefs', prefs), { deep: true })

/** Смещение часового пояса устройства от UTC, минуты */
export const tzMin = -new Date().getTimezoneOffset()

const WEEK = 7 * 86_400_000
export const weekOf = (ms: number) => Math.floor(ms / WEEK)
/** Пометки делятся на документы по кварталам открытия сделки */
export const quarterOf = (ms: number) => Math.floor(ms / (91 * 86_400_000))

// ---------- загрузка сохранённого ----------

const persistAccounts = () => {
  kvSet('accounts', JSON.parse(JSON.stringify(state.accounts.filter((a) => !a.demo))))
  kvSet('removed', [...state.removed])
  kvSet('pulled', { ...state.pulled })
}
const persistNotes = () => kvSet('notes', JSON.parse(JSON.stringify(notes)))

export async function init() {
  const [accounts, removed, pulled, savedNotes] = await Promise.all([
    kvGet<AccountView[]>('accounts'),
    kvGet<string[]>('removed'),
    kvGet<Record<string, number>>('pulled'),
    kvGet<typeof notes>('notes'),
  ])
  state.accounts = (accounts ?? []).map((a) => ({ ...a, local: false }))
  state.removed = removed ?? []
  state.pulled = pulled ?? {}
  Object.assign(notes, savedNotes ?? {})
  await Promise.all(
    state.accounts.map(async (a) => {
      trades[a.id] = (await kvGet<Trade[]>('trades:' + a.id)) ?? []
      const snap = await kvGet<Snapshot>('snap:' + a.id)
      if (snap) snapshots[a.id] = snap
    }),
  )
  if (prefs.demo) loadDemo()
  state.ready = true
  onBridgeReady(() => {
    if (state.bridge !== 'ready') detectBridge()
  })
  // поиск моста занимает до пары секунд — журнал уже показывает сохранённое, не дожидаясь его
  void detectBridge()
}

// ---------- мост ----------

export async function detectBridge(): Promise<void> {
  try {
    const h = await hello()
    state.bridge = 'ready'
    state.bridgeVersion = h.version
    const ids = new Set(h.accounts.map((a) => a.id))
    for (const b of h.accounts) {
      // счёт, удалённый раньше, а потом снова добавленный в мост, возвращается
      state.removed = state.removed.filter((id) => id !== b.id)
      const have = state.accounts.find((a) => a.id === b.id)
      if (have) Object.assign(have, b, { local: true })
      else {
        state.accounts.push({ ...b, local: true })
        trades[b.id] ??= []
      }
    }
    for (const a of state.accounts) if (a.local && !ids.has(a.id)) a.local = false
    persistAccounts()
    state.rev++
    refresh()
  } catch (e) {
    state.bridge = e instanceof BridgeFailure && e.code === 'reload' ? 'reload' : 'absent'
    for (const a of state.accounts) a.local = false
  }
}

/** Догружает историю счетов, ключи которых есть в мосте на этом устройстве */
export async function refresh(only?: string): Promise<void> {
  if (state.bridge !== 'ready') return
  await Promise.all(state.accounts.filter((a) => a.local && (!only || a.id === only)).map((a) => pullAccount(a.id)))
}

/** После первой загрузки берём с запасом назад: биржа могла дописать исполнения задним числом */
const OVERLAP = 30 * 60_000

async function pullAccount(id: string): Promise<void> {
  if (state.jobs[id]?.busy) return
  const job: Job = (state.jobs[id] = { busy: true, progress: 0 })
  const started = Date.now()
  try {
    const since = state.pulled[id] ? state.pulled[id] - OVERLAP : started - prefs.depthDays * 86_400_000
    let cursor: PullCursor | null = null
    do {
      const chunk = await pull(id, since, cursor)
      await Promise.all([putRows('fills', id, chunk.fills), putRows('funding', id, chunk.funding)])
      state.jobs[id].progress = chunk.progress
      cursor = chunk.next
    } while (cursor)
    await rebuild(id)
    state.pulled[id] = started
    try {
      snapshots[id] = await snapshot(id)
      kvSet('snap:' + id, snapshots[id])
    } catch {
      /* состояние счёта не критично: сделки уже загружены */
    }
    persistAccounts()
    state.rev++
    state.jobs[id] = { busy: false, progress: 1 }
  } catch (e) {
    const code = e instanceof BridgeFailure ? e.code : 'exchange'
    state.jobs[id] = { busy: false, progress: job.progress, error: code, message: e instanceof Error ? e.message : String(e) }
    if (code === 'absent' || code === 'reload') state.bridge = code
  }
}

/** Пересобирает сделки счёта из всех его исполнений */
async function rebuild(id: string) {
  const [fills, funding] = await Promise.all([getRows<Fill>('fills', id), getRows<Funding>('funding', id)])
  const built = buildTrades(id, fills, funding)
  // Сделки старше загруженных исполнений могли прийти с другого устройства, где история глубже, — их сохраняем
  const earliest = fills.reduce((m, f) => Math.min(m, f.t), Infinity)
  const older = (trades[id] ?? []).filter((t) => t.open < earliest)
  const dup = (t: Trade) => t.partial && older.some((o) => o.sym === t.sym && o.side === t.side && Math.abs(o.close - t.close) < 1000)
  setTrades(id, [...older, ...built.filter((t) => !dup(t))])
}

function setTrades(id: string, list: Trade[]) {
  trades[id] = list.slice().sort((a, b) => a.open - b.open || (a.id < b.id ? -1 : 1))
  if (!isDemo(id)) kvSet('trades:' + id, trades[id])
}

/** Удаляет счёт из журнала вместе с его сделками. Ключ в мосте остаётся — его удаляют в расширении */
export async function removeAccount(id: string) {
  state.accounts = state.accounts.filter((a) => a.id !== id)
  if (!isDemo(id)) {
    if (!state.removed.includes(id)) state.removed.push(id)
    await Promise.all([clearRows(id), kvDel('trades:' + id), kvDel('snap:' + id)])
  }
  delete trades[id]
  delete snapshots[id]
  delete state.pulled[id]
  delete state.jobs[id]
  prefs.accounts = prefs.accounts.filter((x) => x !== id)
  persistAccounts()
  state.rev++
}

// ---------- демо ----------

function loadDemo() {
  for (const a of DEMO_ACCOUNTS) {
    if (state.accounts.some((x) => x.id === a.id)) continue
    const d = demoData(a.id)
    state.accounts.push({ ...a, demo: true })
    trades[a.id] = buildTrades(a.id, d.fills, d.funding)
    snapshots[a.id] = d.snapshot
  }
}

export function setDemo(on: boolean) {
  prefs.demo = on
  if (on) loadDemo()
  else for (const a of DEMO_ACCOUNTS) removeAccount(a.id)
}

// ---------- пометки ----------

export function setNote(trade: Trade, patch: Partial<Note>) {
  const cur = notes[trade.id] ?? { tags: [], text: '', o: trade.open }
  const next = { ...cur, ...patch, o: trade.open }
  next.tags = [...new Set(next.tags.map((x) => x.trim()).filter(Boolean))].slice(0, 12)
  if (!next.tags.length && !next.text.trim()) delete notes[trade.id]
  else notes[trade.id] = next
  persistNotes()
  if (!isDemo(trade.acct)) state.rev++
}

export const tagsOf = (id: string) => notes[id]?.tags

/** Все метки, которые уже использовались, — по убыванию частоты */
export const allTags = computed(() => {
  const count = new Map<string, number>()
  for (const n of Object.values(notes)) for (const tag of n.tags) count.set(tag, (count.get(tag) ?? 0) + 1)
  return [...count].sort((a, b) => b[1] - a[1]).map(([tag]) => tag)
})

// ---------- приём из синхронизации ----------

export function importAccount(id: string, v: unknown) {
  if (isDemo(id)) return
  if (v == null) {
    // счёт удалили на другом устройстве
    if (state.accounts.some((a) => a.id === id) || trades[id]) removeAccount(id)
    else if (!state.removed.includes(id)) state.removed.push(id)
    return
  }
  const a = v as Account
  if (typeof a !== 'object' || (a.exchange !== 'binance' && a.exchange !== 'bybit') || state.removed.includes(id)) return
  const have = state.accounts.find((x) => x.id === id)
  const clean: Account = { id, exchange: a.exchange, label: String(a.label ?? '').slice(0, 40), hint: String(a.hint ?? '').slice(0, 8), addedAt: Number(a.addedAt) || 0 }
  // название счёта, чей ключ хранится здесь, задаётся в мосте — присланное его не меняет
  if (have) {
    if (!have.local) Object.assign(have, clean)
  } else state.accounts.push({ ...clean, local: false })
  trades[id] ??= []
  persistAccounts()
}

/** Заменяет сделки счёта за одну неделю присланными */
export function importWeek(acct: string, week: number, list: Trade[]) {
  if (isDemo(acct) || state.removed.includes(acct)) return
  const rest = (trades[acct] ?? []).filter((t) => weekOf(t.open) !== week)
  setTrades(acct, [...rest, ...list.filter((t) => weekOf(t.open) === week)])
}

export function importSnapshot(acct: string, v: unknown) {
  const s = v as Snapshot
  if (isDemo(acct) || state.removed.includes(acct) || !s || typeof s.at !== 'number' || !Array.isArray(s.positions)) return
  if ((snapshots[acct]?.at ?? 0) >= s.at) return
  snapshots[acct] = s
  kvSet('snap:' + acct, s)
}

export function importNotes(acct: string, quarter: number, map: Record<string, Note>) {
  const prefix = acct + ':'
  for (const id of Object.keys(notes)) if (id.startsWith(prefix) && quarterOf(notes[id].o) === quarter && !(id in map)) delete notes[id]
  for (const [id, n] of Object.entries(map)) {
    if (!id.startsWith(prefix) || !n || !Array.isArray(n.tags)) continue
    const o = Number((n as Note & { o?: number }).o) || 0
    notes[id] = { tags: n.tags.filter((x) => typeof x === 'string').slice(0, 12), text: String(n.text ?? '').slice(0, 4000), o }
  }
  persistNotes()
}
