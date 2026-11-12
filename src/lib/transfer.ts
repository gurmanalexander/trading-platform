import { freezeStorage } from './storage'

/**
 * Перенос данных между устройствами без сервера. Всё, что приложение хранит в браузере
 * (списки, отметки, рисунки и уровни, оповещения, шаблоны, чеклист, настройки), упаковывается
 * в текстовый код: его можно передать ссылкой, QR-кодом или файлом и принять на другом устройстве.
 */
const PREFIX = 'tvx:'
/** Запомненные виды графиков завязаны на размер экрана — на другом устройстве они только мешают */
const LOCAL_ONLY = new Set(['views', 'cloud', 'cloudMeta'])

export type Snapshot = Record<string, unknown>

/** Все данные приложения из хранилища браузера */
export function collect(): Snapshot {
  const out: Snapshot = {}
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (!k || !k.startsWith(PREFIX)) continue
    const name = k.slice(PREFIX.length)
    if (LOCAL_ONLY.has(name)) continue
    try {
      out[name] = JSON.parse(localStorage.getItem(k) ?? 'null')
    } catch {
      /* битая запись — пропускаем */
    }
  }
  return out
}

const toBase64Url = (bytes: Uint8Array) => {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const fromBase64Url = (s: string) => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function pipe(bytes: Uint8Array, stream: TransformStream<Uint8Array, Uint8Array>): Promise<Uint8Array> {
  const res = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream))
  return new Uint8Array(await res.arrayBuffer())
}

/** Код для передачи: «z» + сжатые данные, а где сжатие недоступно — «j» + данные как есть */
export async function encode(data: Snapshot): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(data))
  if (typeof CompressionStream !== 'undefined') {
    try {
      return 'z' + toBase64Url(await pipe(bytes, new CompressionStream('gzip') as TransformStream<Uint8Array, Uint8Array>))
    } catch {
      /* без сжатия */
    }
  }
  return 'j' + toBase64Url(bytes)
}

export async function decode(code: string): Promise<Snapshot> {
  code = code.trim()
  // код могли вставить вместе со ссылкой
  const at = code.indexOf('#import=')
  if (at >= 0) code = code.slice(at + 8)
  if (code.startsWith('{')) return validate(JSON.parse(code)) // содержимое файла
  const kind = code[0]
  let bytes: Uint8Array = fromBase64Url(code.slice(1))
  if (kind === 'z') bytes = await pipe(bytes, new DecompressionStream('gzip') as TransformStream<Uint8Array, Uint8Array>)
  else if (kind !== 'j') throw new Error('Это не код переноса')
  return validate(JSON.parse(new TextDecoder().decode(bytes)))
}

function validate(data: unknown): Snapshot {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Это не данные tvx')
  return data as Snapshot
}

interface WithId {
  id: string
}
const byId = <T extends WithId>(local: T[], incoming: T[]): T[] => {
  const seen = new Set(incoming.map((x) => x.id))
  return incoming.concat(local.filter((x) => !seen.has(x.id)))
}
const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : [])
const obj = (v: unknown): Record<string, any> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, any>) : {})

/**
 * Объединение: пришедшее добавляется к тому, что уже есть на устройстве. Совпадающие по id
 * списки, рисунки, оповещения и шаблоны берутся из пришедших; то, чего в пришедших нет, остаётся.
 */
export function merge(local: Snapshot, incoming: Snapshot): Snapshot {
  const out: Snapshot = { ...local, ...incoming }

  const lDraw = obj(local.drawings)
  const iDraw = obj(incoming.drawings)
  const drawings: Record<string, unknown[]> = {}
  for (const key of new Set([...Object.keys(lDraw), ...Object.keys(iDraw)])) drawings[key] = byId(arr<WithId>(lDraw[key]), arr<WithId>(iDraw[key]))
  out.drawings = drawings

  const lLists = obj(local.lists)
  const iLists = obj(incoming.lists)
  if (Array.isArray(iLists.all) || Array.isArray(lLists.all)) {
    const lAll = arr<WithId & { items: { exchange: string; market: string; symbol: string }[] }>(lLists.all)
    const all = arr<WithId & { items: { exchange: string; market: string; symbol: string }[] }>(iLists.all).map((list) => {
      const mine = lAll.find((l) => l.id === list.id)
      if (!mine) return list
      // монеты из одноимённого списка этого устройства, которых нет в пришедшем, дописываются в конец
      const key = (r: { exchange: string; market: string; symbol: string }) => `${r.exchange}:${r.market}:${r.symbol}`
      const have = new Set(list.items.map(key))
      return { ...list, items: list.items.concat(mine.items.filter((r) => !have.has(key(r)))) }
    })
    const ids = new Set(all.map((l) => l.id))
    out.lists = { ...lLists, ...iLists, all: all.concat(lAll.filter((l) => !ids.has(l.id))), marks: { ...obj(lLists.marks), ...obj(iLists.marks) } }
  }

  out.alerts = byId(arr<WithId>(local.alerts), arr<WithId>(incoming.alerts))
  out.checklistSel = { ...obj(local.checklistSel), ...obj(incoming.checklistSel) }
  out.drawDefaults = { ...obj(local.drawDefaults), ...obj(incoming.drawDefaults) }

  const lApp = obj(local.app)
  const iApp = obj(incoming.app)
  if (local.app || incoming.app) out.app = { ...lApp, ...iApp, templates: byId(arr<WithId>(lApp.templates), arr<WithId>(iApp.templates)) }
  return out
}

/** Записывает данные в хранилище браузера и запрещает дальнейшую запись — дальше нужна перезагрузка страницы */
export function writeAll(data: Snapshot, replace: boolean) {
  if (replace) {
    const drop: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith(PREFIX) && !LOCAL_ONLY.has(k.slice(PREFIX.length))) drop.push(k)
    }
    drop.forEach((k) => localStorage.removeItem(k))
  }
  for (const [name, value] of Object.entries(data)) {
    if (!LOCAL_ONLY.has(name)) localStorage.setItem(PREFIX + name, JSON.stringify(value))
  }
  freezeStorage()
}

/** Коротко о том, что лежит в данных, — показать перед тем как принять */
export function describe(data: Snapshot): string {
  const lists = arr<{ items: unknown[] }>(obj(data.lists).all)
  const coins = lists.reduce((n, l) => n + arr(l.items).length, 0)
  const drawings = Object.values(obj(data.drawings)).reduce((n: number, v) => n + arr(v).length, 0)
  const parts = [`списков: ${lists.length}`, `монет в них: ${coins}`, `рисунков и уровней: ${drawings}`, `оповещений: ${arr(data.alerts).length}`, `шаблонов: ${arr(obj(data.app).templates).length}`]
  return parts.join(', ')
}
