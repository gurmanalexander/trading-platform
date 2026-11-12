import { describe, expect, it } from 'vitest'
import { decode, describe as summary, encode, merge } from '../src/lib/transfer'

const sample = {
  app: { themePref: 'dark', templates: [{ id: 't1', name: 'Три ТФ' }] },
  lists: {
    all: [
      { id: 'a', name: 'Сделки', items: [{ exchange: 'binance', market: 'futures', symbol: 'ARBUSDT' }] },
      { id: 'b', name: 'Наблюдаю', items: [] },
    ],
    marks: { 'binance:futures:ARBUSDT': 'short' },
  },
  drawings: { 'binance:futures:ARBUSDT': [{ id: 'd1', type: 'hline', pts: [{ t: 1, p: 0.14991 }] }] },
  alerts: [{ id: 'al1', price: 1 }],
}

describe('перенос данных', () => {
  it('код разворачивается в те же данные (кириллица и вложенность сохраняются)', async () => {
    const code = await encode(sample)
    expect(code[0]).toBe('z')
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/) // годится для ссылки без экранирования
    expect(await decode(code)).toEqual(sample)
  })

  it('принимает код вместе со ссылкой и содержимое файла', async () => {
    const code = await encode(sample)
    expect(await decode('https://example.com/app/#import=' + code)).toEqual(sample)
    expect(await decode(JSON.stringify(sample))).toEqual(sample)
  })

  it('мусор отклоняется', async () => {
    await expect(decode('привет')).rejects.toThrow()
    await expect(decode('[1,2]')).rejects.toThrow()
  })

  it('сжатие заметно уменьшает объём', async () => {
    const big = { drawings: Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`binance:futures:COIN${i}USDT`, [{ id: 'x' + i, type: 'hline', pts: [{ t: 1794400000 + i, p: i * 1.5 }], color: '#4c8dff', width: 1, dash: 'solid' }]])) }
    const code = await encode(big)
    expect(code.length).toBeLessThan(JSON.stringify(big).length / 2)
  })

  it('объединение: пришедшее добавляется, своё не теряется', () => {
    const local = {
      app: { themePref: 'light', templates: [{ id: 't0', name: 'Мой' }] },
      lists: {
        all: [
          { id: 'a', name: 'Сделки (старое имя)', items: [{ exchange: 'binance', market: 'futures', symbol: 'TAOUSDT' }] },
          { id: 'c', name: 'Только здесь', items: [] },
        ],
        marks: { 'binance:futures:TAOUSDT': 'long' },
      },
      drawings: {
        'binance:futures:ARBUSDT': [{ id: 'd0', type: 'hline', pts: [{ t: 1, p: 0.2 }] }],
        'binance:futures:TAOUSDT': [{ id: 'd9', type: 'hline', pts: [{ t: 1, p: 211.89 }] }],
      },
      alerts: [{ id: 'al0', price: 5 }],
    }
    const m = merge(local, sample) as any
    // список с тем же id берётся из пришедших, но монета, которая была только здесь, остаётся
    expect(m.lists.all.map((l: any) => l.name)).toEqual(['Сделки', 'Наблюдаю', 'Только здесь'])
    expect(m.lists.all[0].items.map((i: any) => i.symbol)).toEqual(['ARBUSDT', 'TAOUSDT'])
    expect(m.lists.marks).toEqual({ 'binance:futures:TAOUSDT': 'long', 'binance:futures:ARBUSDT': 'short' })
    expect(m.drawings['binance:futures:ARBUSDT'].map((d: any) => d.id)).toEqual(['d1', 'd0'])
    expect(m.drawings['binance:futures:TAOUSDT']).toHaveLength(1)
    expect(m.alerts.map((a: any) => a.id)).toEqual(['al1', 'al0'])
    expect(m.app.templates.map((t: any) => t.id)).toEqual(['t1', 't0'])
    // настройки — пришедшие
    expect(m.app.themePref).toBe('dark')
  })

  it('сводка перед приёмом', () => {
    expect(summary(sample)).toBe('списков: 2, монет в них: 1, рисунков и уровней: 1, оповещений: 1, шаблонов: 1')
  })
})
