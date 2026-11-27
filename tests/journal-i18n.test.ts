import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { EN, i18n, t } from '../journal/src/lib/i18n'

/** Исходники журнала и расширения-моста, кроме самих словарей */
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? (name === 'i18n' ? [] : files(p)) : /\.(ts|vue)$/.test(name) ? [p] : []
  })
}

function keys(): Map<string, string> {
  const out = new Map<string, string>()
  const re = /\bt\(\s*(?:'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)")/g
  const all = [...files(join(__dirname, '../journal/src')), ...files(join(__dirname, '../extension/src'))].filter((f) => !f.endsWith('lib/i18n.ts'))
  for (const f of all) {
    for (const m of readFileSync(f, 'utf8').matchAll(re)) {
      const key = (m[1] ?? m[2]).replace(/\\(.)/g, '$1')
      if (/[А-Яа-яЁё]/.test(key)) out.set(key, f)
    }
  }
  return out
}

describe('переводы журнала и моста', () => {
  it('у каждой строки t("…") есть английский перевод', () => {
    const lost = [...keys()].filter(([k]) => !(k in EN)).map(([k, f]) => `${f.split('/trading-platform/')[1] ?? f}: ${k}`)
    expect(lost).toEqual([])
  })

  it('в словаре нет лишних строк, кириллицы в переводах и расхождений в подстановках', () => {
    const used = keys()
    expect(Object.keys(EN).filter((k) => !used.has(k))).toEqual([])
    const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join()
    expect(Object.entries(EN).filter(([ru, en]) => /[А-Яа-яЁё]/.test(en) || vars(ru) !== vars(en))).toEqual([])
  })

  it('t переключает язык и подставляет значения', () => {
    i18n.lang = 'en'
    expect(t('Сделки')).toBe('Trades')
    expect(t('Показать ещё {n}', { n: 5 })).toBe('Show 5 more')
    i18n.lang = 'ru'
    expect(t('Показать ещё {n}', { n: 5 })).toBe('Показать ещё 5')
  })
})
