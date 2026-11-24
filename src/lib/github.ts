import { reactive } from 'vue'
import { load, save } from './storage'

/** Репозиторий проекта: ссылка «GitHub» в приложении и число звёзд рядом с ней */
export const REPO = 'gurmanalexander/trading-platform'
export const REPO_URL = `https://github.com/${REPO}`

/** Звёзды берём из открытого API GitHub не чаще раза в 6 часов: у него лимит 60 запросов в час */
const TTL_MS = 6 * 3_600_000

interface Cached {
  n: number
  at: number
}

export const github = reactive<{ stars: number | null }>({ stars: load<Cached | null>('ghStars', null)?.n ?? null })

let started = false
export async function loadStars(): Promise<void> {
  if (started) return
  started = true
  const cached = load<Cached | null>('ghStars', null)
  if (cached && Date.now() - cached.at < TTL_MS) return
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}`, { headers: { Accept: 'application/vnd.github+json' } })
    if (!res.ok) return
    const n = (await res.json()).stargazers_count
    if (typeof n !== 'number') return
    github.stars = n
    save('ghStars', { n, at: Date.now() })
  } catch {
    /* без числа звёзд кнопка всё равно работает */
  }
}

/** 1234 → «1.2k» */
export function fmtStars(n: number): string {
  return n >= 1000 ? (n / 1000).toFixed(n >= 10_000 ? 0 : 1).replace(/\.0$/, '') + 'k' : String(n)
}
