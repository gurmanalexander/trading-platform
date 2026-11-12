import { describe, expect, it } from 'vitest'
import { decodeShare, encodeShare, nearestLevels, shareQuery, shareText, type SharePack } from '../src/lib/share'
import { parseKeys } from '../src/lib/hotkeys'
import { parseLines, parseSetup } from '../src/lib/setup'
import { parseSignal } from '../src/lib/signal'

describe('«Поделиться»', () => {
  it('три ближайших к цене уровня, от ближнего к дальнему', () => {
    expect(nearestLevels([90, 70, 83.5, 100, 81, 83.5], 82)).toEqual([81, 83.5, 90])
    expect(nearestLevels([], 82)).toEqual([])
  })

  const pack: SharePack = {
    symbol: 'SOLUSDT',
    side: 'long',
    date: { y: 2026, m: 11, d: 10 },
    levels: [83.5, 81],
    positions: [{ side: 'short', entry: 84, stop: 85, target: 80, t: 1_794_000_000, t2: 1_794_003_600 }],
  }

  it('посылка переживает упаковку в ссылку и обратно', () => {
    expect(decodeShare(encodeShare(pack))).toEqual(pack)
    expect(decodeShare(encodeShare({ symbol: 'BTCUSDT', exchange: 'bybit', market: 'spot', levels: [], positions: [] }))).toEqual({
      symbol: 'BTCUSDT',
      exchange: 'bybit',
      market: 'spot',
      levels: [],
      positions: [],
    })
  })

  it('мусор вместо посылки не принимается', () => {
    expect(decodeShare('не-код')).toBeNull()
    expect(decodeShare(btoa(JSON.stringify({ s: 'bad ticker!' })))).toBeNull()
  })

  it('один уровень без позиций — короткая читаемая ссылка, иначе — упакованные данные', () => {
    const simple = shareQuery({ symbol: 'SOLUSDT', side: 'long', levels: [83.5], positions: [] })
    expect(simple.startsWith('?q=')).toBe(true)
    expect(parseSetup(decodeURIComponent(simple.slice(3)))).toEqual({ symbol: 'SOLUSDT', side: 'long', level: 83.5 })
    expect(shareQuery(pack).startsWith('#share=')).toBe(true)
  })

  it('текст для мессенджера вставляется обратно: строки сетапов и сделка', () => {
    const text = shareText(pack, 2)
    const [setups, trade] = text.split('\n\n')
    expect(parseLines(setups)!.list).toEqual([
      { symbol: 'SOLUSDT', side: 'long', level: 83.5, date: { y: 2026, m: 11, d: 10 } },
      { symbol: 'SOLUSDT', side: 'long', level: 81 },
    ])
    expect(parseSignal(trade)).toEqual({ symbol: 'SOLUSDT', side: 'short', entry: 84, stop: 85, target: 80 })
  })
})

describe('справка по клавишам', () => {
  it('сочетание разбирается на клавиши, действия и варианты', () => {
    expect(parseKeys('Alt+Shift+S')).toEqual([[{ text: 'Alt', key: true }, { text: 'Shift', key: true }, { text: 'S', key: true }]])
    expect(parseKeys('Пробел / Shift+Пробел')).toHaveLength(2)
    expect(parseKeys('Ctrl+{щелчок}')).toEqual([[{ text: 'Ctrl', key: true }, { text: 'щелчок', key: false }]])
    expect(parseKeys('{Колесо} {над шкалой цены}')).toEqual([[{ text: 'Колесо', key: false }, { text: 'над шкалой цены', key: false }]])
  })
})
