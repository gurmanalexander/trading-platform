import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { EN, detectLang, i18n, plural, t } from '../src/lib/i18n'

/** Все файлы исходников */
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? (name === 'i18n' ? [] : files(p)) : /\.(ts|vue)$/.test(name) ? [p] : []
  })
}

/** Строки из вызовов t('…') и t("…") — ключи перевода */
function keys(): Map<string, string> {
  const out = new Map<string, string>()
  const re = /\bt\(\s*(?:'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)")/g
  for (const f of files(join(__dirname, '../src')).filter((f) => !f.endsWith('lib/i18n.ts'))) {
    const src = readFileSync(f, 'utf8')
    for (const m of src.matchAll(re)) {
      const raw = m[1] ?? m[2]
      const key = raw.replace(/\\(.)/g, '$1')
      if (/[А-Яа-яЁё]/.test(key)) out.set(key, f)
    }
  }
  return out
}

describe('переводы', () => {
  it('у каждой строки t("…") с русским текстом есть английский перевод', () => {
    const lost = [...keys()].filter(([k]) => !(k in EN)).map(([k, f]) => `${f.split('/src/')[1]}: ${k}`)
    expect(lost).toEqual([])
  })

  it('в английских переводах нет кириллицы, подстановки совпадают', () => {
    const bad = Object.entries(EN).filter(([ru, en]) => {
      const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join()
      return /[А-Яа-яЁё]/.test(en) || vars(ru) !== vars(en)
    })
    expect(bad).toEqual([])
  })

  it('t подставляет значения и переключает язык', () => {
    i18n.lang = 'ru'
    expect(t('Закрыть')).toBe('Закрыть')
    i18n.lang = 'en'
    expect(t('Закрыть')).toBe('Close')
    expect(t('Нет такой строки {n}', { n: 2 })).toBe('Нет такой строки 2')
    expect(plural(1, ['монета', 'монеты', 'монет'], ['coin', 'coins'])).toBe('1 coin')
    i18n.lang = 'ru'
    expect(plural(3, ['монета', 'монеты', 'монет'], ['coin', 'coins'])).toBe('3 монеты')
    expect(plural(11, ['монета', 'монеты', 'монет'], ['coin', 'coins'])).toBe('11 монет')
    expect(plural(21, ['монета', 'монеты', 'монет'], ['coin', 'coins'])).toBe('21 монета')
  })

  it('язык по умолчанию — по языку системы', () => {
    expect(detectLang(['ru-RU'])).toBe('ru')
    expect(detectLang(['uk'])).toBe('ru')
    expect(detectLang(['en-US', 'ru'])).toBe('en')
    expect(detectLang(['de-DE'])).toBe('en')
    expect(detectLang([])).toBe('en')
  })
})
