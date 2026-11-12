const TIMEOUT_MS = 12_000

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

// Какой из адресов биржи сработал в прошлый раз — с него и начинаем
const preferred = new Map<string, number>()

/** GET JSON с перебором зеркал: первый ответивший адрес запоминается */
export async function getJson(hosts: string[], path: string): Promise<any> {
  const key = hosts[0]
  const start = preferred.get(key) ?? 0
  let lastErr: unknown
  for (let i = 0; i < hosts.length; i++) {
    const idx = (start + i) % hosts.length
    const ctl = new AbortController()
    const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS)
    try {
      const res = await fetch(hosts[idx] + path, { signal: ctl.signal })
      if (!res.ok) throw new HttpError(res.status, describeStatus(res.status))
      const json = await res.json()
      preferred.set(key, idx)
      return json
    } catch (e) {
      lastErr = e
    } finally {
      clearTimeout(timer)
    }
  }
  if (lastErr instanceof HttpError) throw lastErr
  throw new Error('Нет связи с биржей')
}

function describeStatus(status: number): string {
  if (status === 451 || status === 403) return `Биржа недоступна из вашего региона (${status})`
  if (status === 429 || status === 418) return `Превышен лимит запросов (${status})`
  if (status === 400) return 'Инструмент или интервал не поддерживается (400)'
  return `Ошибка биржи (${status})`
}
