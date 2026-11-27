import type { BridgeErrorCode } from '../../../journal/src/core/protocol'

/** Ошибка моста с кодом, по которому сайт подбирает понятное объяснение */
export class BridgeError extends Error {
  constructor(
    public code: BridgeErrorCode,
    message?: string,
  ) {
    super(message ?? code)
  }
}

/** Всё, что нужно клиенту биржи: открытая часть ключа и функция подписи. Секрета здесь нет */
export interface Ctx {
  apiKey: string
  /** HMAC-SHA256 строки, в нижнем регистре в hex */
  sign(text: string): Promise<string>
  fetch: typeof fetch
  now(): number
  sleep(ms: number): Promise<void>
}

const TIMEOUT_MS = 15_000

/** GET с ограничением по времени. Сетевые сбои и таймаут — ошибка 'network' */
export async function httpGet(ctx: Ctx, url: string, headers: Record<string, string>): Promise<Response> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS)
  try {
    return await ctx.fetch(url, { method: 'GET', headers, signal: ctl.signal, credentials: 'omit', cache: 'no-store' })
  } catch {
    throw new BridgeError('network')
  } finally {
    clearTimeout(timer)
  }
}

export async function readJson(res: Response): Promise<any> {
  try {
    return await res.json()
  } catch {
    return null
  }
}

/** Строка запроса: значения undefined пропускаются, порядок — как в объекте */
export function query(params: Record<string, string | number | undefined>): string {
  return Object.entries(params)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join('&')
}

export const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v !== '' ? Number(v) : NaN
  return isFinite(n) ? n : 0
}

const HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'))
export const toHex = (bytes: Uint8Array) => {
  let s = ''
  for (const b of bytes) s += HEX[b]
  return s
}

/** Ключ подписи из секрета. Не извлекаемый: подписывать им можно, прочитать секрет обратно — нет */
export function importSecret(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
}

export const signerOf = (key: CryptoKey) => async (text: string) =>
  toHex(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text))))

export const WEEK = 7 * 86_400_000
