import { watch, type WatchSource } from 'vue'

const PREFIX = 'tvx:'

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    return raw == null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}

export function save(key: string, value: unknown) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    /* хранилище недоступно или переполнено — работаем без сохранения */
  }
}

/** Сохраняет реактивное состояние в localStorage с задержкой, чтобы не писать на каждое изменение */
export function persist(key: string, source: WatchSource | object, pick: () => unknown, delay = 400) {
  let timer = 0
  const flush = () => {
    timer = 0
    save(key, pick())
  }
  watch(
    source,
    () => {
      if (!timer) timer = window.setTimeout(flush, delay)
    },
    { deep: true },
  )
  window.addEventListener('pagehide', () => {
    if (timer) {
      clearTimeout(timer)
      flush()
    }
  })
}
