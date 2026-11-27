import { computed, reactive, shallowReactive, watch } from 'vue'
import { load, save } from '../../../src/lib/storage'
import { BridgeFailure, bridgeRefresh, bridgeStatus, bridgeTrades, hello, onBridgeReady } from '../bridge/client'
import { DEMO_ACCOUNTS, demoData, isDemo } from '../core/demo'
import { sortTrades, weekOf } from '../core/pack'
import { buildTrades } from '../core/positions'
import type { AccountData, AccountStatus, BridgeErrorCode } from '../core/protocol'
import type { Account, Note, Snapshot, Trade } from '../core/types'
import { kvDel, kvGet, kvSet } from './db'

/**
 * Состояние журнала: счета, сделки, пометки, ход загрузки.
 *
 * Сделки счёта берутся из двух источников. На устройстве с мостом их отдаёт мост: он сам, в фоне,
 * загружает историю с биржи и собирает из неё сделки. На остальных (телефон) сделки приходят
 * через синхронизацию. Оба пути кладут результат в одно место, интерфейсу разница не видна.
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

export { weekOf }
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

/** какую версию данных каждого счёта журнал уже забрал у моста */
const taken: Record<string, number> = {}
let pollTimer = 0

export async function detectBridge(): Promise<void> {
  try {
    const h = await hello()
    state.bridge = 'ready'
    state.bridgeVersion = h.version
    const ids = new Set(h.accounts.map((a) => a.id))
    for (const b of h.accounts) {
      // счёт, удалённый из журнала, сам не возвращается, пока его ключ лежит в мосте
      if (state.removed.includes(b.id)) continue
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
    await applyStatus(h.status)
    schedulePoll()
  } catch (e) {
    state.bridge = e instanceof BridgeFailure && e.code === 'reload' ? 'reload' : 'absent'
    for (const a of state.accounts) a.local = false
  }
}

/** Просит мост догрузить историю сейчас, не дожидаясь его расписания */
export async function refresh(only?: string): Promise<void> {
  if (state.bridge !== 'ready') return
  try {
    await bridgeRefresh(only)
    for (const a of state.accounts) if (a.local && (!only || a.id === only)) state.jobs[a.id] = { ...(state.jobs[a.id] ?? { progress: 0 }), busy: true, error: undefined, message: undefined }
    schedulePoll(400)
  } catch (e) {
    lost(e)
  }
}

function lost(e: unknown) {
  const code = e instanceof BridgeFailure ? e.code : 'absent'
  if (code === 'absent' || code === 'reload') {
    state.bridge = code
    for (const a of state.accounts) a.local = false
  }
}

/**
 * Пока журнал открыт, он спрашивает у моста, как идёт загрузка: часто — пока что-то грузится,
 * изредка — в остальное время (мост догружает историю сам, по своему расписанию).
 */
function schedulePoll(delay?: number) {
  clearTimeout(pollTimer)
  const busy = Object.values(state.jobs).some((j) => j.busy)
  pollTimer = window.setTimeout(poll, delay ?? (busy ? 1200 : 20_000))
}

async function poll() {
  if (state.bridge !== 'ready') return
  if (document.visibilityState === 'visible') {
    try {
      await applyStatus(await bridgeStatus())
    } catch (e) {
      lost(e)
    }
  }
  if (state.bridge === 'ready') schedulePoll()
}

/** Возвращает опрос моста сразу — например, когда вкладку снова открыли */
export function pollNow() {
  if (state.bridge === 'ready') schedulePoll(0)
}

async function applyStatus(status: Record<string, AccountStatus>) {
  for (const a of state.accounts) {
    if (!a.local) continue
    const st = status[a.id]
    if (!st) continue
    const job: Job = { busy: st.busy, progress: st.progress }
    if (st.error) {
      job.error = st.error
      if (st.message) job.message = st.message
    }
    state.jobs[a.id] = job
    if (st.pulledAt) state.pulled[a.id] = st.pulledAt
    if (st.rev && taken[a.id] !== st.rev) {
      const data = await bridgeTrades(a.id)
      takeBridgeData(a.id, data)
      taken[a.id] = data.rev
    }
  }
}

/** Принимает сделки и состояние счёта от моста */
function takeBridgeData(id: string, data: AccountData) {
  // Сделки старше истории, которую знает мост, могли прийти с другого устройства, где она глубже, — их сохраняем
  const older = data.earliest > 0 ? (trades[id] ?? []).filter((t) => t.open < data.earliest) : []
  const dup = (t: Trade) => t.partial && older.some((o) => o.sym === t.sym && o.side === t.side && Math.abs(o.close - t.close) < 1000)
  setTrades(id, [...older, ...data.trades.filter((t) => !dup(t))])
  if (data.snapshot) {
    snapshots[id] = data.snapshot
    kvSet('snap:' + id, data.snapshot)
  }
  persistAccounts()
  state.rev++
}

function setTrades(id: string, list: Trade[]) {
  trades[id] = sortTrades(list)
  if (!isDemo(id)) kvSet('trades:' + id, trades[id])
}

/**
 * Удаляет счёт из журнала вместе с его сделками. Ключ в мосте остаётся — его удаляют в расширении;
 * до тех пор мост этот счёт не грузит и не публикует (список удалённых уходит ему в настройках).
 */
export async function removeAccount(id: string) {
  state.accounts = state.accounts.filter((a) => a.id !== id)
  if (!isDemo(id)) {
    if (!state.removed.includes(id)) state.removed.push(id)
    await Promise.all([kvDel('trades:' + id), kvDel('snap:' + id)])
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
