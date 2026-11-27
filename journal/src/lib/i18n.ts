import { reactive, watch } from 'vue'
import EN from '../i18n/en'

/**
 * Язык интерфейса журнала и моста — тот же подход, что в tvx: ключ перевода — русская строка,
 * английские переводы — в journal/src/i18n/en.ts. Выбор языка общий с tvx (ключ tvx:lang),
 * когда журнал открыт с того же адреса.
 */
export type Lang = 'ru' | 'en'

const KEY = 'tvx:lang'

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === 'ru' || saved === 'en') return saved
  } catch {
    /* хранилище недоступно */
  }
  const langs = typeof navigator !== 'undefined' ? navigator.languages ?? [navigator.language] : []
  for (const l of langs) {
    const code = l.toLowerCase().slice(0, 2)
    if (['ru', 'uk', 'be', 'kk', 'uz', 'ky', 'tg', 'hy', 'az'].includes(code)) return 'ru'
    if (code) return 'en'
  }
  return 'en'
}

export const i18n = reactive({ lang: initialLang() })

if (typeof window !== 'undefined') {
  const apply = (lang: Lang) => {
    try {
      localStorage.setItem(KEY, lang)
    } catch {
      /* без сохранения */
    }
    document.documentElement.lang = lang
  }
  apply(i18n.lang)
  watch(() => i18n.lang, apply)
}

export { EN }

const fill = (s: string, vars?: Record<string, string | number>) =>
  vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s

export function t(ru: string, vars?: Record<string, string | number>): string {
  return fill(i18n.lang === 'ru' ? ru : (EN[ru] ?? ru), vars)
}

/** Число со словом: plural(3, ['сделка', 'сделки', 'сделок'], ['trade', 'trades']) */
export function plural(n: number, ru: [string, string, string], en: [string, string]): string {
  if (i18n.lang === 'en') return `${n} ${n === 1 ? en[0] : en[1]}`
  const a = Math.abs(n) % 100
  const b = a % 10
  const form = a > 10 && a < 20 ? ru[2] : b === 1 ? ru[0] : b >= 2 && b <= 4 ? ru[1] : ru[2]
  return `${n} ${form}`
}

export const locale = () => (i18n.lang === 'en' ? 'en-US' : 'ru-RU')
