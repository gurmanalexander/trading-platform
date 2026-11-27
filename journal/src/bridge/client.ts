import { BRIDGE, type AccountData, type AccountStatus, type BridgeConfig, type BridgeErrorCode, type BridgeRequest, type BridgeResponse, type Hello } from '../core/protocol'

/**
 * Сторона страницы в обмене с расширением-мостом. Запрос уходит через window.postMessage,
 * посредник расширения возвращает ответ с тем же номером. Расширения нет — ответа не будет:
 * запрос завершается ошибкой 'absent' по таймауту.
 */
export class BridgeFailure extends Error {
  constructor(
    public code: BridgeErrorCode,
    message?: string,
  ) {
    super(message ?? code)
  }
}

let seq = 0
const waiting = new Map<number, (res: BridgeResponse) => void>()
const readyHandlers = new Set<() => void>()

if (typeof window !== 'undefined') {
  window.addEventListener('message', (e) => {
    if (e.source !== window || e.origin !== location.origin) return
    const m = e.data
    if (!m || m.from !== BRIDGE) return
    if (m.ready) return readyHandlers.forEach((h) => h())
    const done = waiting.get(m.id)
    if (done) {
      waiting.delete(m.id)
      done(m.res)
    }
  })
}

/** Мост сообщил о себе (расширение только что установили или страница загрузилась раньше него) */
export function onBridgeReady(handler: () => void): () => void {
  readyHandlers.add(handler)
  return () => readyHandlers.delete(handler)
}

function call<T>(req: BridgeRequest, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = ++seq
    const timer = setTimeout(() => {
      waiting.delete(id)
      reject(new BridgeFailure('absent'))
    }, timeoutMs)
    waiting.set(id, (res) => {
      clearTimeout(timer)
      if (res?.ok) resolve(res.data as T)
      else reject(new BridgeFailure(res?.error ?? 'absent', res?.message))
    })
    window.postMessage({ to: BRIDGE, id, req }, location.origin)
  })
}

/** Есть ли мост и какие в нём счета. Несколько коротких попыток: посредник мог ещё не подключиться */
export async function hello(): Promise<Hello> {
  let last: unknown
  for (const wait of [300, 600, 1200]) {
    try {
      return await call<Hello>({ op: 'hello' }, wait)
    } catch (e) {
      last = e
      if (e instanceof BridgeFailure && e.code !== 'absent') break
    }
  }
  throw last
}

export const bridgeStatus = () => call<Record<string, AccountStatus>>({ op: 'status' }, 8000)
export const bridgeTrades = (account: string) => call<AccountData>({ op: 'trades', account }, 20_000)
export const bridgeRefresh = (account?: string) => call<boolean>(account ? { op: 'refresh', account } : { op: 'refresh' }, 8000)
export const bridgeConfig = (config: BridgeConfig) => call<boolean>({ op: 'config', config }, 8000)
export const openBridgeOptions = () => call<boolean>({ op: 'options' }, 3000)
