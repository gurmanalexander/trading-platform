import type { Fill, Funding } from '../../journal/src/core/types'
import type { HistoryStore } from './history'

/**
 * База расширения (IndexedDB). Сайты и другие расширения к ней доступа не имеют.
 * accounts — ключи (см. vault.ts); fills и funding — загруженная с биржи история, по записи
 * на исполнение; kv — всё остальное: собранные сделки, ход загрузки, настройки.
 */
const DB = 'tvx-bridge'

export function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 2)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('accounts')) db.createObjectStore('accounts', { keyPath: 'id' })
      for (const name of ['fills', 'funding']) if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: ['a', 'id'] }).createIndex('a', 'a')
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv')
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/** Одна транзакция; body может вернуть запрос — его результат и будет ответом */
export async function tx<T>(stores: string[], mode: IDBTransactionMode, body: (t: IDBTransaction) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await openDb()
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const t = db.transaction(stores, mode)
      const req = body(t)
      t.oncomplete = () => resolve(req ? req.result : undefined)
      t.onerror = t.onabort = () => reject(t.error ?? req?.error)
    })
  } finally {
    db.close()
  }
}

/** Хранилище истории поверх IndexedDB */
export const idbStore: HistoryStore = {
  async putRows(kind, acct, rows) {
    if (!rows.length) return
    await tx([kind], 'readwrite', (t) => {
      const s = t.objectStore(kind)
      for (const r of rows) s.put({ ...r, a: acct })
    })
  },
  async getRows<T extends Fill | Funding>(kind: 'fills' | 'funding', acct: string) {
    const rows = await tx<(T & { a?: string })[]>([kind], 'readonly', (t) => t.objectStore(kind).index('a').getAll(acct))
    return (rows ?? []).map(({ a: _a, ...rest }) => rest as unknown as T)
  },
  async clearRows(acct) {
    await tx(['fills', 'funding'], 'readwrite', (t) => {
      for (const name of ['fills', 'funding']) {
        const req = t.objectStore(name).index('a').openKeyCursor(acct)
        req.onsuccess = () => {
          const c = req.result
          if (!c) return
          t.objectStore(name).delete(c.primaryKey)
          c.continue()
        }
      }
    })
  },
  get: <T>(key: string) => tx<T>(['kv'], 'readonly', (t) => t.objectStore('kv').get(key)),
  async set(key, value) {
    await tx(['kv'], 'readwrite', (t) => t.objectStore('kv').put(value, key))
  },
  async del(key) {
    await tx(['kv'], 'readwrite', (t) => t.objectStore('kv').delete(key))
  },
}
