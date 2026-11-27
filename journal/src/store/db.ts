import type { Fill, Funding } from '../core/types'

/**
 * Локальная база журнала (IndexedDB). Исполнения и фандинг лежат отдельными записями — история
 * только дополняется; всё остальное (сделки, пометки, состояние счетов) — значениями по ключу.
 * База недоступна (приватный режим, запрет) — журнал работает в памяти до закрытия вкладки.
 */
const DB = 'tvx-journal'
type RowStore = 'fills' | 'funding'

let dbp: Promise<IDBDatabase | null> | null = null

function open(): Promise<IDBDatabase | null> {
  return (dbp ??= new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, 1)
      req.onupgradeneeded = () => {
        const db = req.result
        for (const name of ['fills', 'funding'] as const) db.createObjectStore(name, { keyPath: ['a', 'id'] }).createIndex('a', 'a')
        db.createObjectStore('kv')
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
      req.onblocked = () => resolve(null)
    } catch {
      resolve(null)
    }
  }))
}

function run<T>(stores: string[], mode: IDBTransactionMode, body: (t: IDBTransaction) => IDBRequest<T> | void): Promise<T | undefined> {
  return open().then(
    (db) =>
      new Promise<T | undefined>((resolve) => {
        if (!db) return resolve(undefined)
        try {
          const t = db.transaction(stores, mode)
          const req = body(t)
          t.oncomplete = () => resolve(req ? req.result : undefined)
          t.onerror = t.onabort = () => resolve(undefined)
        } catch {
          resolve(undefined)
        }
      }),
  )
}

/** Добавляет записи счёта; уже известные (по идентификатору биржи) перезаписываются теми же данными */
export function putRows(store: RowStore, acct: string, rows: (Fill | Funding)[]): Promise<unknown> {
  if (!rows.length) return Promise.resolve()
  return run([store], 'readwrite', (t) => {
    const s = t.objectStore(store)
    for (const r of rows) s.put({ ...r, a: acct })
  })
}

export async function getRows<T extends Fill | Funding>(store: RowStore, acct: string): Promise<T[]> {
  const rows = await run<(T & { a?: string })[]>([store], 'readonly', (t) => t.objectStore(store).index('a').getAll(acct))
  return (rows ?? []).map(({ a: _a, ...rest }) => rest as unknown as T)
}

/** Удаляет исполнения и фандинг счёта */
export function clearRows(acct: string): Promise<unknown> {
  return run(['fills', 'funding'], 'readwrite', (t) => {
    for (const name of ['fills', 'funding'] as const) {
      const req = t.objectStore(name).index('a').openKeyCursor(acct)
      req.onsuccess = () => {
        const c = req.result
        if (!c) return
        t.objectStore(name).delete(c.primaryKey)
        c.continue()
      }
    }
  })
}

export const kvGet = <T>(key: string): Promise<T | undefined> => run<T>(['kv'], 'readonly', (t) => t.objectStore('kv').get(key))
export const kvSet = (key: string, value: unknown) => run(['kv'], 'readwrite', (t) => t.objectStore('kv').put(value, key))
export const kvDel = (key: string) => run(['kv'], 'readwrite', (t) => t.objectStore('kv').delete(key))
export const kvKeys = async (): Promise<string[]> => ((await run<IDBValidKey[]>(['kv'], 'readonly', (t) => t.objectStore('kv').getAllKeys())) ?? []).map(String)
