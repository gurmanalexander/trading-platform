import { buildTrades } from '../../journal/src/core/positions'
import type { AccountData, AccountStatus, BridgeErrorCode, PullCursor } from '../../journal/src/core/protocol'
import type { ExchangeId, Fill, Funding, Snapshot, Trade } from '../../journal/src/core/types'
import { BridgeError, type Ctx } from './exchanges/http'
import type { ExchangeClient } from './exchanges/types'

/**
 * История счетов в расширении: фоновая загрузка с биржи, хранение исполнений и сборка сделок.
 *
 * Браузер может остановить фоновую часть расширения в любой момент, поэтому после каждой порции
 * запоминается место, на котором остановились: следующая попытка продолжает с него, а не начинает
 * заново. Загруженные исполнения не теряются — история только дополняется.
 */
export interface HistoryStore {
  putRows(kind: 'fills' | 'funding', acct: string, rows: (Fill | Funding)[]): Promise<void>
  getRows<T extends Fill | Funding>(kind: 'fills' | 'funding', acct: string): Promise<T[]>
  clearRows(acct: string): Promise<void>
  get<T>(key: string): Promise<T | undefined>
  set(key: string, value: unknown): Promise<void>
  del(key: string): Promise<void>
}

/** Что хранится о ходе загрузки счёта */
interface Saved {
  /** когда история последний раз была загружена до конца */
  pulledAt: number
  rev: number
  /** незаконченная загрузка: место остановки, её начало по часам и момент, с которого она грузит */
  cursor: PullCursor | null
  startedAt: number
  since: number
  progress: number
  error?: BridgeErrorCode
  message?: string
}

const fresh = (): Saved => ({ pulledAt: 0, rev: 0, cursor: null, startedAt: 0, since: 0, progress: 0 })

/** После первой загрузки берём с запасом назад: биржа может дописать исполнения задним числом */
const OVERLAP = 30 * 60_000
const DAY = 86_400_000

export interface HistoryDeps {
  store: HistoryStore
  client(exchange: ExchangeId): ExchangeClient
  /** всё для запросов от имени счёта; null — ключа больше нет */
  contextOf(id: string): Promise<{ exchange: ExchangeId; ctx: Ctx } | null>
  now(): number
}

export function createHistory({ store, client, contextOf, now }: HistoryDeps) {
  /** загрузки, идущие прямо сейчас; после остановки фоновой части список пуст — и это верно */
  const running = new Map<string, Promise<void>>()

  const load = async (id: string): Promise<Saved> => ({ ...fresh(), ...((await store.get<Saved>('st:' + id)) ?? {}) })
  const save = (id: string, st: Saved) => store.set('st:' + id, st)

  async function run(id: string, depthDays: number): Promise<void> {
    const st = await load(id)
    delete st.error
    delete st.message
    try {
      const acc = await contextOf(id)
      if (!acc) throw new BridgeError('no-account')
      const api = client(acc.exchange)
      if (!st.cursor) {
        st.startedAt = now()
        st.since = st.pulledAt ? st.pulledAt - OVERLAP : st.startedAt - depthDays * DAY
        st.progress = 0
      }
      await save(id, st)
      do {
        let chunk
        try {
          chunk = await api.pull(acc.ctx, st.since, st.cursor)
        } catch (e) {
          // сохранённое место остановки больше не годится (например, после обновления) — начнём заново
          if (e instanceof BridgeError && e.code === 'bad-request' && st.cursor) st.cursor = null
          throw e
        }
        await Promise.all([store.putRows('fills', id, chunk.fills), store.putRows('funding', id, chunk.funding)])
        st.cursor = chunk.next
        st.progress = chunk.progress
        await save(id, st)
      } while (st.cursor)

      const [fills, funding] = await Promise.all([store.getRows<Fill>('fills', id), store.getRows<Funding>('funding', id)])
      const trades = buildTrades(id, fills, funding)
      let snapshot = await store.get<Snapshot>('snap:' + id)
      try {
        const next = await api.snapshot(acc.ctx)
        // состояние считаем изменившимся по сути, а не по времени снимка
        if (!snapshot || !sameSnapshot(snapshot, next)) snapshot = next
      } catch {
        /* состояние счёта не критично: сделки уже загружены */
      }
      const text = JSON.stringify([trades, snapshot ?? null])
      if (text !== (await store.get<string>('sum:' + id))) {
        await Promise.all([
          store.set('trades:' + id, trades),
          // 0 — исполнений нет (бесконечность не пережила бы пересылку между частями расширения)
          store.set('earliest:' + id, fills.length ? fills.reduce((m, f) => Math.min(m, f.t), Infinity) : 0),
          snapshot ? store.set('snap:' + id, snapshot) : Promise.resolve(),
          store.set('sum:' + id, text),
        ])
        st.rev++
      }
      st.pulledAt = st.startedAt
      st.progress = 1
    } catch (e) {
      st.error = e instanceof BridgeError ? e.code : 'exchange'
      st.message = e instanceof Error ? e.message : String(e)
    }
    await save(id, st)
  }

  return {
    /** Догружает историю счёта. Повторный вызов во время загрузки ждёт ту же загрузку */
    pull(id: string, depthDays: number): Promise<void> {
      let job = running.get(id)
      if (!job) {
        job = run(id, depthDays).finally(() => running.delete(id))
        running.set(id, job)
      }
      return job
    },

    async status(ids: string[]): Promise<Record<string, AccountStatus>> {
      const out: Record<string, AccountStatus> = {}
      for (const id of ids) {
        const st = await load(id)
        const s: AccountStatus = { busy: running.has(id), progress: st.progress, pulledAt: st.pulledAt, rev: st.rev }
        if (st.error && !s.busy) {
          s.error = st.error
          if (st.message) s.message = st.message
        }
        out[id] = s
      }
      return out
    },

    async data(id: string): Promise<AccountData> {
      const [trades, snapshot, earliest, st] = await Promise.all([store.get<Trade[]>('trades:' + id), store.get<Snapshot>('snap:' + id), store.get<number>('earliest:' + id), load(id)])
      const out: AccountData = { trades: trades ?? [], earliest: earliest ?? 0, rev: st.rev }
      if (snapshot) out.snapshot = snapshot
      return out
    },

    /** Удаляет всё, что загружено по счёту (когда удалён его ключ) */
    async forget(id: string) {
      await running.get(id)?.catch(() => {})
      await Promise.all([store.clearRows(id), ...['st:', 'trades:', 'snap:', 'earliest:', 'sum:'].map((k) => store.del(k + id))])
    },
  }
}

export type History = ReturnType<typeof createHistory>

/** Одинаково ли состояние счёта, если не смотреть на время снимка */
function sameSnapshot(a: Snapshot, b: Snapshot): boolean {
  return JSON.stringify({ ...a, at: 0 }) === JSON.stringify({ ...b, at: 0 })
}
