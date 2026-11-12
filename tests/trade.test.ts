import { describe, expect, it } from 'vitest'
import { atrBounds, atrSpent, dailyAtr, dailyRisk, fiveMinRisk, spentTone, wilderAtr } from '../src/lib/atr'
import { formatSignal, parseSignal } from '../src/lib/signal'
import { barStart, evaluatePosition, fmtR, latestPosition, setPositionPrices } from '../src/chart/position'
import type { Drawing } from '../src/stores/drawings'

describe('ATR по формулам индикатора Trader Assistant', () => {
  it('дневной ATR — среднее диапазонов пяти предыдущих дневных свечей', () => {
    expect(dailyAtr([10, 12, 8, 11, 9])).toBe(10)
    expect(dailyAtr([100, 10, 12, 8, 11, 9])).toBe(10) // более старые свечи не участвуют
    // фильтра аномальных свечей в формуле индикатора нет: большая свеча входит в среднее
    expect(dailyAtr([10, 12, 8, 50, 20])).toBe(20)
    expect(dailyAtr([10, 14])).toBe(12)
    expect(dailyAtr([])).toBe(0)
  })

  it('стоп — 10% ATR, тейк — 4 стопа, люфт — 10% стопа', () => {
    const r = dailyRisk(2000)
    expect(r.stop).toBe(200)
    expect(r.take).toBe(800)
    expect(r.slip).toBe(20)
  })

  it('стоп по пятиминуткам — два ATR(30)', () => {
    // у ровных свечей без разрывов истинный диапазон равен high − low
    const bars = Array.from({ length: 60 }, () => ({ high: 105, low: 100, close: 102 }))
    expect(wilderAtr(bars)).toBeCloseTo(5)
    const r = fiveMinRisk(5)
    expect(r.stop).toBe(10)
    expect(r.take).toBe(40)
    expect(r.slip).toBe(1)
  })

  it('истинный диапазон учитывает разрыв от прошлого закрытия', () => {
    expect(wilderAtr([{ high: 10, low: 9, close: 9 }, { high: 15, low: 14, close: 15 }], 2)).toBe((1 + 6) / 2)
  })

  it('исчерпание ATR: от открытия дня и по размаху', () => {
    const day = { open: 100, high: 108, low: 98 }
    const s = atrSpent(20, day, 104)
    expect(s.fromOpen).toBe(20)
    expect(s.traveled).toBe(50)
    expect(spentTone(s.fromOpen)).toBe('up') // меньше 30% — запас хода
    expect(spentTone(75)).toBe('down') // больше 70% — ход на исходе
    expect(spentTone(50)).toBe('')
    // цена вышла за записанный максимум дня — размах считается по ней
    expect(atrSpent(20, day, 110).traveled).toBe(60)
  })

  it('границы дня по ATR', () => {
    expect(atrBounds(20, { open: 100, high: 108, low: 98 }, 104)).toEqual({ maxFromOpen: 120, minFromOpen: 80, maxFromLow: 118, minFromHigh: 88 })
  })
})

describe('текст сделки', () => {
  it('разбирает сигнал из примера', () => {
    expect(parseSignal('ARBUSDT SHORT\nТВХ: 0.14991\nSL: 0.15165\nTP: 0.1379\nR: 6.90')).toEqual({
      symbol: 'ARBUSDT',
      side: 'short',
      entry: 0.14991,
      stop: 0.15165,
      target: 0.1379,
    })
  })

  it('лишние строки до и после не мешают', () => {
    const s = parseSignal('Сигнал от 12.11, риск 1%\n\n#BTC/USDT лонг\nвход - 73500,5\nстоп 73100\nтейк: 75100\nR: 4\nне забыть про новости в 15:30')
    expect(s).toEqual({ symbol: 'BTCUSDT', side: 'long', entry: 73500.5, stop: 73100, target: 75100 })
  })

  it('направление выводится из цен, если не указано', () => {
    expect(parseSignal('ТВХ 100 SL 110 TP 70')?.side).toBe('short')
    expect(parseSignal('entry: 100\nstop loss: 95')?.side).toBe('long')
  })

  it('«ТВХ», набранное латиницей, тоже понимается', () => {
    expect(parseSignal('TBX: 5\nSL: 4')?.entry).toBe(5)
  })

  it('обычный текст сделкой не считается', () => {
    expect(parseSignal('просто заметка про BTCUSDT')).toBeNull()
    expect(parseSignal('TP: 5')).toBeNull()
    expect(parseSignal('')).toBeNull()
  })

  it('копирование и вставка взаимно обратны', () => {
    const text = formatSignal('ARBUSDT', 'short', 0.14991, 0.15165, 0.1379, 5)
    expect(text).toBe('ARBUSDT SHORT\nТВХ: 0.14991\nSL: 0.15165\nTP: 0.1379\nR: 6.90')
    expect(parseSignal(text)).toMatchObject({ symbol: 'ARBUSDT', side: 'short', entry: 0.14991, stop: 0.15165, target: 0.1379 })
  })
})

describe('ход сделки', () => {
  const pos = (type: 'long' | 'short', entry: number, target: number, stop: number, t = 100): Drawing => ({
    id: type + t,
    type,
    color: '#000',
    pts: [
      { t, p: entry },
      { t: t + 1000, p: target },
      { t, p: stop },
    ],
  })
  const bar = (time: number, high: number, low: number, close: number) => ({ time, open: close, high, low, close, volume: 1 })

  it('открытая сделка: результат в рисках от входа', () => {
    const st = evaluatePosition(pos('long', 100, 120, 95), [bar(100, 101, 99, 100), bar(160, 108, 100, 107.5)])
    expect(st.status).toBe('open')
    expect(st.r).toBe(1.5)
    expect(evaluatePosition(pos('short', 100, 80, 105), [bar(100, 101, 99, 100), bar(160, 103, 100, 102.5)]).r).toBe(-0.5)
  })

  it('тейк и стоп фиксируют результат, дальнейшее движение не учитывается', () => {
    const bars = [bar(100, 101, 99, 100), bar(160, 121, 100, 119), bar(220, 119, 60, 61)]
    expect(evaluatePosition(pos('long', 100, 120, 95), bars)).toMatchObject({ status: 'tp', r: 4, exitTime: 160, exitPrice: 120 })
    expect(evaluatePosition(pos('short', 100, 80, 105), bars)).toMatchObject({ status: 'sl', r: -1, exitTime: 160, exitPrice: 105 })
  })

  it('свеча задела и стоп, и цель — считаем стоп', () => {
    expect(evaluatePosition(pos('long', 100, 120, 95), [bar(100, 125, 90, 110)]).status).toBe('sl')
  })

  it('свечи до входа не учитываются; вход в будущем — сделка ждёт', () => {
    const before = [bar(40, 200, 10, 100)]
    expect(evaluatePosition(pos('long', 100, 120, 95), before).status).toBe('pending')
    expect(evaluatePosition(pos('long', 100, 120, 95), [...before, bar(100, 101, 99, 100)]).status).toBe('open')
  })

  it('текущая цена из тикера уточняет результат открытой сделки', () => {
    expect(evaluatePosition(pos('long', 100, 120, 95), [bar(100, 101, 99, 100)], 110).r).toBe(2)
  })

  it('последняя позиция — с самым поздним входом', () => {
    const list = [pos('long', 1, 2, 0.5, 100), pos('short', 1, 0.5, 2, 300), { id: 'x', type: 'hline', color: '#000', pts: [{ t: 999, p: 1 }] } as Drawing]
    expect(latestPosition(list)?.id).toBe('short300')
    expect(latestPosition([])).toBeNull()
  })

  it('цены числами: направление следует за расположением стопа и цели', () => {
    const d = pos('long', 100, 120, 95)
    expect(setPositionPrices(d, 0.14991, 0.15165, 0.1379)).toBe(true)
    expect(d.type).toBe('short')
    expect(d.pts.map((p) => p.p)).toEqual([0.14991, 0.1379, 0.15165])
    // цель и стоп по одну сторону от входа — отказ, позиция не тронута
    expect(setPositionPrices(d, 100, 110, 120)).toBe(false)
    expect(d.pts[0].p).toBe(0.14991)
  })

  it('формат результата', () => {
    expect(fmtR(1.23)).toBe('+1.2R')
    expect(fmtR(-0.5)).toBe('-0.5R')
    expect(fmtR(0.01)).toBe('0R')
    expect(fmtR(12.4)).toBe('+12R')
  })
})

describe('время позиции привязано к свече', () => {
  it('момент внутри свечи округляется вниз до её начала', () => {
    const t = Date.UTC(2026, 10, 12, 17, 12, 40) / 1000
    expect(new Date(barStart(t, 300) * 1000).toISOString()).toBe('2026-11-12T17:10:00.000Z')
    expect(new Date(barStart(t, 3600) * 1000).toISOString()).toBe('2026-11-12T17:00:00.000Z')
    expect(barStart(Date.UTC(2026, 10, 12, 17, 10) / 1000, 300)).toBe(Date.UTC(2026, 10, 12, 17, 10) / 1000)
  })
})
