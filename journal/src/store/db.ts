/**
 * Локальная база журнала (IndexedDB): сделки, пометки, состояние счетов — значениями по ключу.
 * Исполнения биржи здесь не хранятся: их держит расширение-мост, журнал получает готовые сделки.
 * База недоступна (приватный режим, запрет) — журнал работает в памяти до закрытия вкладки.
 */
const DB = 'tvx-journal'

let dbp: Promise<IDBDatabase | null> | null = null

function open(): Promise<IDBDatabase | null> {
  return (dbp ??= new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, 1)
      req.onupgradeneeded = () => req.result.createObjectStore('kv')
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
      req.onblocked = () => resolve(null)
    } catch {
      resolve(null)
    }
  }))
}

function run<T>(mode: IDBTransactionMode, body: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  return open().then(
    (db) =>
      new Promise<T | undefined>((resolve) => {
        if (!db) return resolve(undefined)
        try {
          const t = db.transaction('kv', mode)
          const req = body(t.objectStore('kv'))
          t.oncomplete = () => resolve(req.result)
          t.onerror = t.onabort = () => resolve(undefined)
        } catch {
          resolve(undefined)
        }
      }),
  )
}

export const kvGet = <T>(key: string): Promise<T | undefined> => run<T>('readonly', (s) => s.get(key))
export const kvSet = (key: string, value: unknown) => run('readwrite', (s) => s.put(value, key))
export const kvDel = (key: string) => run('readwrite', (s) => s.delete(key))
