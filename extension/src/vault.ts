import type { BridgeAccount } from '../../journal/src/core/protocol'
import type { ExchangeId } from '../../journal/src/core/types'
import { importSecret, signerOf, type Ctx } from './exchanges/http'

/**
 * Хранилище ключей — база IndexedDB самого расширения. Сайты и другие расширения к ней доступа
 * не имеют.
 *
 * Секрет ключа в исходном виде не хранится вовсе: при добавлении он превращается в не извлекаемый
 * ключ подписи (CryptoKey), и в базу кладётся только он. Таким ключом можно подписать запрос,
 * но прочитать секрет обратно нельзя — даже коду самого расширения.
 */
interface Stored extends BridgeAccount {
  /** открытая часть ключа — идёт в заголовок запроса */
  apiKey: string
  key: CryptoKey
}

const DB = 'tvx-bridge'
const STORE = 'accounts'

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' })
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open()
  try {
    return await new Promise<T>((resolve, reject) => {
      const t = db.transaction(STORE, mode)
      const req = run(t.objectStore(STORE))
      t.oncomplete = () => resolve(req.result)
      t.onerror = t.onabort = () => reject(t.error ?? req.error)
    })
  } finally {
    db.close()
  }
}

const publicView = ({ id, exchange, label, hint, addedAt, expiresAt }: Stored): BridgeAccount => {
  const a: BridgeAccount = { id, exchange, label, hint, addedAt }
  if (expiresAt) a.expiresAt = expiresAt
  return a
}

/** Счета без ключей — то, что можно показать сайту */
export async function listAccounts(): Promise<BridgeAccount[]> {
  const all = await tx<Stored[]>('readonly', (s) => s.getAll())
  return all.sort((a, b) => a.addedAt - b.addedAt).map(publicView)
}

/** Всё для запросов от имени счёта; null — такого счёта нет */
export async function contextOf(id: string): Promise<{ exchange: ExchangeId; ctx: Ctx } | null> {
  const a = await tx<Stored | undefined>('readonly', (s) => s.get(id))
  return a ? { exchange: a.exchange, ctx: makeCtx(a.apiKey, a.key) } : null
}

export function makeCtx(apiKey: string, key: CryptoKey): Ctx {
  return {
    apiKey,
    sign: signerOf(key),
    fetch: (input, init) => fetch(input, init),
    now: () => Date.now(),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  }
}

/** Такой ключ уже добавлен? */
export async function hasKey(exchange: ExchangeId, apiKey: string): Promise<boolean> {
  const all = await tx<Stored[]>('readonly', (s) => s.getAll())
  return all.some((a) => a.exchange === exchange && a.apiKey === apiKey)
}

export async function addAccount(exchange: ExchangeId, label: string, apiKey: string, key: CryptoKey, expiresAt?: number): Promise<BridgeAccount> {
  const id = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('')
  const rec: Stored = { id, exchange, label, hint: apiKey.slice(-4), addedAt: Date.now(), apiKey, key }
  if (expiresAt) rec.expiresAt = expiresAt
  await tx('readwrite', (s) => s.put(rec))
  return publicView(rec)
}

export async function renameAccount(id: string, label: string) {
  const a = await tx<Stored | undefined>('readonly', (s) => s.get(id))
  if (a) await tx('readwrite', (s) => s.put({ ...a, label }))
}

export const removeAccount = (id: string) => tx('readwrite', (s) => s.delete(id))

export { importSecret }
