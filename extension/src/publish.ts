import { deriveKeys, seal, signEvent, validSyncCode, type Envelope } from '../../src/lib/nostr'
import type { HistoryStore } from './history'

/**
 * Фоновая выгрузка для других устройств: мост сам публикует счета, их состояние и сделки на
 * ретрансляторах синхронизации — даже когда вкладка журнала закрыта. Так телефон видит свежие
 * сделки, пока на компьютере просто открыт браузер.
 *
 * Публикуется ровно то же и в том же виде, что публикует журнал (journal/src/store/sync.ts):
 * документы шифруются на устройстве ключом из кода синхронизации. Ключей бирж среди них нет.
 * Отправляются только изменившиеся документы; отправленным документ считается, когда его
 * принял хотя бы один ретранслятор, — иначе он уйдёт при следующей попытке.
 */
export interface SyncTarget {
  code: string
  relays: string[]
}

const TAG = 'tvxj:'
/** Ретрансляторы не принимают слишком большие сообщения */
const MAX_CONTENT = 60_000
const CONNECT_MS = 7000
const ACK_MS = 4000
const GAP_MS = 70

/** Короткий отпечаток строки — чтобы помнить, что уже отправлено, не храня само содержимое */
export function fingerprint(text: string): string {
  let h1 = 0xdeadbeef ^ text.length
  let h2 = 0x41c6ce57 ^ text.length
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (h2 >>> 0).toString(36) + (h1 >>> 0).toString(36)
}

/** отпечаток содержимого и время события, с которым документ был принят ретранслятором */
type Sent = Record<string, [string, number]>

/** Какие документы изменились с прошлой успешной отправки */
export function changedDocs(docs: Map<string, unknown>, sent: Sent): { id: string; json: string; mark: string }[] {
  const out: { id: string; json: string; mark: string }[] = []
  for (const [id, v] of docs) {
    const json = JSON.stringify(v)
    const mark = fingerprint(json)
    if (sent[id]?.[0] !== mark) out.push({ id, json, mark })
  }
  return out
}

export interface PublishDeps {
  store: HistoryStore
  now(): number
  sleep(ms: number): Promise<void>
  socket(url: string): WebSocket
}

/** Публикует изменившиеся документы. Возвращает, сколько из них принято ретрансляторами */
export async function publishChanged(target: SyncTarget, docs: Map<string, unknown>, { store, now, sleep, socket }: PublishDeps): Promise<number> {
  if (!validSyncCode(target.code) || !target.relays.length) return 0
  // у каждого кода синхронизации свой учёт отправленного: сменили код — отправится всё заново
  const sentKey = 'pub:' + fingerprint(target.code)
  const sent = (await store.get<Sent>(sentKey)) ?? {}
  const changed = changedDocs(docs, sent)
  if (!changed.length) return 0

  // «/journal» в основе ключей — как в журнале: у него свой адрес на ретрансляторах, отдельный от tvx
  const keys = await deriveKeys(target.code + '/journal')
  const open: WebSocket[] = []
  const all: WebSocket[] = []
  /** идентификатор события → документ */
  const pending = new Map<string, { id: string; mark: string; created: number }>()
  let accepted = 0

  await new Promise<void>((resolve) => {
    let left = target.relays.length
    const done = () => --left <= 0 && resolve()
    const timer = setTimeout(resolve, CONNECT_MS)
    for (const url of target.relays) {
      let ws: WebSocket
      try {
        ws = socket(url)
      } catch {
        done()
        continue
      }
      all.push(ws)
      ws.onopen = () => {
        open.push(ws)
        done()
      }
      ws.onerror = ws.onclose = () => done()
      ws.onmessage = (m) => {
        let msg: unknown
        try {
          msg = JSON.parse(String(m.data))
        } catch {
          return
        }
        // ["OK", идентификатор события, принято ли, пояснение]
        if (!Array.isArray(msg) || msg[0] !== 'OK' || msg[2] !== true) return
        const doc = pending.get(String(msg[1]))
        if (!doc) return
        pending.delete(String(msg[1]))
        sent[doc.id] = [doc.mark, doc.created]
        accepted++
      }
    }
    if (!target.relays.length) {
      clearTimeout(timer)
      resolve()
    }
  })

  try {
    if (!open.length) return 0
    for (const doc of changed) {
      const ts = now()
      const content = await seal(keys.aes, JSON.stringify({ ts, v: JSON.parse(doc.json) } satisfies Envelope))
      if (content.length > MAX_CONTENT) continue
      // у заменяемых событий побеждает большее время создания, поэтому оно обязано расти
      const created = Math.max(Math.floor(ts / 1000), (sent[doc.id]?.[1] ?? 0) + 1)
      const ev = signEvent(keys, TAG + doc.id, content, created)
      pending.set(ev.id, { id: doc.id, mark: doc.mark, created })
      const text = JSON.stringify(['EVENT', ev])
      for (const ws of open) {
        try {
          ws.send(text)
        } catch {
          /* соединение закрылось — документ уйдёт через остальные или в следующий раз */
        }
      }
      // ретрансляторы ограничивают частоту сообщений
      await sleep(GAP_MS)
    }
    // ждём подтверждений; всё подтверждено — выходим раньше
    for (let waited = 0; pending.size && waited < ACK_MS; waited += 100) await sleep(100)
    return accepted
  } finally {
    for (const ws of all) {
      ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null
      try {
        ws.close()
      } catch {
        /* уже закрыт */
      }
    }
    if (accepted) await store.set(sentKey, sent)
  }
}
