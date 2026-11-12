import { schnorr } from '@noble/curves/secp256k1.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js'

/**
 * Транспорт синхронизации — публичные ретрансляторы протокола Nostr: они хранят последнее
 * сообщение каждого «документа» и сразу рассылают новые подписчикам. Своего сервера не нужно.
 *
 * Из кода синхронизации выводятся два ключа: подписи (по нему ретранслятор отличает наши сообщения)
 * и шифрования. Содержимое шифруется на устройстве (AES-GCM), ретранслятор видит только шифртекст.
 */
export interface NostrEvent {
  id: string
  pubkey: string
  created_at: number
  kind: number
  tags: string[][]
  content: string
  sig: string
}

/** NIP-78: данные приложения; заменяемое событие — ретранслятор хранит только последнее на каждый тег d */
export const APP_KIND = 30078

export interface SyncKeys {
  sk: Uint8Array
  /** открытый ключ, hex — «адрес» наших сообщений на ретрансляторе */
  pk: string
  aes: CryptoKey
}

const b64u = (bytes: Uint8Array) => {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const unb64u = (s: string) => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/** Новый код синхронизации: 32 случайных байта */
export function newSyncCode(): string {
  return b64u(crypto.getRandomValues(new Uint8Array(32)))
}

/** Код допустим, если это 32 байта в base64url */
export function validSyncCode(code: string): boolean {
  try {
    return /^[A-Za-z0-9_-]{43}$/.test(code) && unb64u(code).length === 32
  } catch {
    return false
  }
}

export async function deriveKeys(code: string): Promise<SyncKeys> {
  const sk = sha256(utf8ToBytes('tvx-sync-sign:' + code))
  const raw = sha256(utf8ToBytes('tvx-sync-enc:' + code))
  const aes = await crypto.subtle.importKey('raw', raw as BufferSource, 'AES-GCM', false, ['encrypt', 'decrypt'])
  return { sk, pk: bytesToHex(schnorr.getPublicKey(sk)), aes }
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const writer = stream.writable.getWriter()
  writer.write(bytes as BufferSource)
  writer.close()
  return new Uint8Array(await new Response(stream.readable).arrayBuffer())
}

/** Шифрует текст: [флаг сжатия][gzip или как есть] → AES-GCM; результат — base64url(iv + шифртекст) */
export async function seal(aes: CryptoKey, text: string): Promise<string> {
  const raw = utf8ToBytes(text)
  const gzip = typeof CompressionStream !== 'undefined' && raw.length > 200
  const body = gzip ? await pipe(raw, new CompressionStream('gzip')) : raw
  const flag = gzip ? 1 : 0
  const plain = new Uint8Array(body.length + 1)
  plain[0] = flag
  plain.set(body, 1)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aes, plain as BufferSource))
  const out = new Uint8Array(12 + ct.length)
  out.set(iv)
  out.set(ct, 12)
  return b64u(out)
}

/** Обратное seal. Бросает исключение, если ключ не тот или данные повреждены */
export async function unseal(aes: CryptoKey, data: string): Promise<string> {
  const raw = unb64u(data)
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: raw.slice(0, 12) }, aes, raw.slice(12)))
  const body = plain[0] === 1 ? await pipe(plain.slice(1), new DecompressionStream('gzip')) : plain.slice(1)
  return new TextDecoder().decode(body)
}

/** Подписанное событие с документом doc (тег d) */
export function signEvent(keys: SyncKeys, doc: string, content: string, createdAt: number): NostrEvent {
  const tags = [['d', doc]]
  const id = sha256(utf8ToBytes(JSON.stringify([0, keys.pk, createdAt, APP_KIND, tags, content])))
  return { id: bytesToHex(id), pubkey: keys.pk, created_at: createdAt, kind: APP_KIND, tags, content, sig: bytesToHex(schnorr.sign(id, keys.sk)) }
}

export const docOf = (ev: NostrEvent): string | undefined => ev.tags.find((t) => t[0] === 'd')?.[1]

/** Что лежит внутри зашифрованного сообщения: время изменения на устройстве и само значение */
export interface Envelope {
  ts: number
  v: unknown
}

/**
 * Какая версия документа новее. Побеждает более позднее изменение; при равном времени —
 * та, чьё содержимое «больше» как строка: так оба устройства выберут одно и то же.
 */
export function newer(a: { ts: number; json: string }, b: { ts: number; json: string }): boolean {
  return a.ts !== b.ts ? a.ts > b.ts : a.json > b.json
}
