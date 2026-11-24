import { reactive, watch } from 'vue'

/**
 * Язык интерфейса: русский (основной) и английский.
 *
 * Ключ перевода — сама русская строка: t('Поддержать проект'). Английские переводы лежат
 * в словарях src/i18n/en/*.ts (каждый файл — объект «русская строка → английская»), все они
 * собираются здесь. Перевода нет — показывается русская строка, интерфейс не ломается;
 * тест tests/i18n.test.ts следит, чтобы у каждой строки в t('…') перевод был.
 *
 * Подстановки — в фигурных скобках: t('Удалить все рисунки ({n})?', { n: 3 }).
 * t() читает язык при каждом вызове, поэтому в шаблонах и computed текст меняется сразу
 * при смене языка. Подписи, заданные константами модуля, переводят в момент показа: t(item.label).
 */
export type Lang = 'ru' | 'en'
export const LANGS: { id: Lang; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'ru', label: 'Русский' },
]

const KEY = 'tvx:lang'

/** Язык при самом первом запуске: русский для русскоязычных систем, иначе английский */
export function detectLang(languages: readonly string[] = typeof navigator !== 'undefined' ? navigator.languages ?? [navigator.language] : []): Lang {
  for (const l of languages) {
    const code = l.toLowerCase().slice(0, 2)
    if (['ru', 'uk', 'be', 'kk', 'uz', 'ky', 'tg', 'hy', 'az'].includes(code)) return 'ru'
    if (code) return 'en'
  }
  return 'en'
}

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === 'ru' || saved === 'en') return saved
    // у тех, кто пользовался терминалом до появления английского, интерфейс остаётся русским
    if (localStorage.getItem('tvx:app')) return 'ru'
  } catch {
    /* хранилище недоступно */
  }
  return detectLang()
}

export const i18n = reactive({ lang: initialLang() })

if (typeof window !== 'undefined') {
  const apply = (lang: Lang) => {
    try {
      localStorage.setItem(KEY, lang)
    } catch {
      /* без сохранения */
    }
    if (typeof document !== 'undefined') {
      document.documentElement.lang = lang
      document.title = lang === 'en' ? 'tvx — trading terminal' : 'tvx — торговый терминал'
    }
  }
  apply(i18n.lang)
  watch(() => i18n.lang, apply)
}

const modules = import.meta.glob<{ default: Record<string, string> }>('../i18n/en/*.ts', { eager: true })
export const EN: Record<string, string> = Object.assign({}, ...Object.values(modules).map((m) => m.default))

const fill = (s: string, vars?: Record<string, string | number>) =>
  vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s

const missing = new Set<string>()

/** Перевод строки интерфейса на текущий язык */
export function t(ru: string, vars?: Record<string, string | number>): string {
  if (i18n.lang === 'ru') return fill(ru, vars)
  const en = EN[ru]
  if (en === undefined && import.meta.env?.DEV && !missing.has(ru)) {
    missing.add(ru)
    console.warn('[i18n] нет перевода:', ru)
  }
  return fill(en ?? ru, vars)
}

/**
 * Число со словом: plural(3, ['монета', 'монеты', 'монет'], ['coin', 'coins']) → «3 монеты» / «3 coins».
 * Слова передаются как есть, без t(): у русского три формы, у английского две.
 */
export function plural(n: number, ru: [string, string, string], en: [string, string]): string {
  if (i18n.lang === 'en') return `${n} ${n === 1 ? en[0] : en[1]}`
  const a = Math.abs(n) % 100
  const b = a % 10
  const form = a > 10 && a < 20 ? ru[2] : b === 1 ? ru[0] : b >= 2 && b <= 4 ? ru[1] : ru[2]
  return `${n} ${form}`
}

/** Локаль для чисел и дат (toLocaleString, Intl, графики) */
export const locale = () => (i18n.lang === 'en' ? 'en-US' : 'ru-RU')
