import { describe, expect, it, vi } from 'vitest'

// хранилища обращаются к окну браузера при загрузке модуля
vi.stubGlobal('window', {
  innerWidth: 1280,
  innerHeight: 800,
  addEventListener: () => {},
  matchMedia: () => ({ matches: true, addEventListener: () => {} }),
  setTimeout,
  setInterval,
})
vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {} })

const { screen } = await import('../src/stores/screener')
const { withUsdVolume } = await import('../src/exchanges')
const { sanitizeLayout, makeLayout, layoutCount } = await import('../src/stores/app')
type Settings = import('../src/stores/screener').ScreenerSettings

const row = (symbol: string, last: number, changePct: number, quoteVolume: number) => ({
  exchange: 'binance' as const,
  market: 'futures' as const,
  symbol,
  last,
  changePct,
  quoteVolume,
})
const base: Settings = { exchange: 'binance', market: 'futures', minVolume: 30, minChange: 0, quote: 'USDT', sort: 'volume', dir: 'desc' }

describe('отбор', () => {
  const list = withUsdVolume([row('BTCUSDT', 70000, -1, 9e9), row('ETHUSDT', 2000, 2.5, 4e9), row('DOGEUSDT', 0.1, -6, 5e7), row('TINYUSDT', 1, 12, 2e7), row('BTCUSDC', 70000, -1, 8e8)])

  it('по умолчанию: объём от 30 млн, только USDT, по убыванию объёма', () => {
    expect(screen(list, base).map((r) => r.symbol)).toEqual(['BTCUSDT', 'ETHUSDT', 'DOGEUSDT'])
  })

  it('порог объёма и валюта котировки настраиваются', () => {
    expect(screen(list, { ...base, minVolume: 0, quote: 'all' })).toHaveLength(5)
    expect(screen(list, { ...base, minVolume: 1000 }).map((r) => r.symbol)).toEqual(['BTCUSDT', 'ETHUSDT'])
  })

  it('фильтр по изменению берёт модуль', () => {
    expect(screen(list, { ...base, minChange: 2 }).map((r) => r.symbol)).toEqual(['ETHUSDT', 'DOGEUSDT'])
  })

  it('сортировки', () => {
    expect(screen(list, { ...base, sort: 'change', dir: 'desc' }).map((r) => r.symbol)).toEqual(['ETHUSDT', 'BTCUSDT', 'DOGEUSDT'])
    expect(screen(list, { ...base, sort: 'price', dir: 'asc' }).map((r) => r.symbol)).toEqual(['DOGEUSDT', 'ETHUSDT', 'BTCUSDT'])
    expect(screen(list, { ...base, sort: 'symbol', dir: 'asc' }).map((r) => r.symbol)).toEqual(['BTCUSDT', 'DOGEUSDT', 'ETHUSDT'])
  })
})

describe('оборот в долларах', () => {
  it('пары к стейблкоинам — как есть, остальные — через курс валюты котировки', () => {
    const list = withUsdVolume([row('BTCUSDT', 70000, 0, 1e9), row('ETHBTC', 0.03, 0, 100), row('USDTTRY', 40, 0, 4e8), row('XTRY', 5, 0, 4e6), row('ODDPAIRXYZ', 1, 0, 5e6)])
    const usd = Object.fromEntries(list.map((r) => [r.symbol, r.usdVolume]))
    expect(usd.BTCUSDT).toBe(1e9)
    expect(usd.ETHBTC).toBe(100 * 70000)
    expect(usd.XTRY).toBe(4e6 / 40)
    // валюта котировки неизвестна — оборот не оцениваем
    expect(usd.ODDPAIRXYZ).toBe(0)
  })
})

describe('раскладка', () => {
  it('считает окна', () => {
    expect(layoutCount({ dir: 'rows', groups: [1, 2] })).toBe(3)
    expect(makeLayout({ dir: 'cols', groups: [2, 1] }).cellSizes).toEqual([[1, 1], [1]])
  })

  it('битые сохранённые данные заменяются раскладкой по умолчанию', () => {
    const def = { dir: 'rows', groups: [1, 2] }
    expect(sanitizeLayout(undefined)).toMatchObject(def)
    expect(sanitizeLayout({ dir: 'rows', groups: [9] })).toMatchObject(def)
    expect(sanitizeLayout({ dir: 'rows', groups: [4, 4, 4] })).toMatchObject(def)
  })

  it('сохранённые доли восстанавливаются, неподходящие — сбрасываются', () => {
    const ok = sanitizeLayout({ dir: 'rows', groups: [1, 2], groupSizes: [2, 1], cellSizes: [[1], [3, 1]] })
    expect(ok.groupSizes).toEqual([2, 1])
    expect(ok.cellSizes).toEqual([[1], [3, 1]])
    const bad = sanitizeLayout({ dir: 'rows', groups: [1, 2], groupSizes: [0, 1], cellSizes: [[1], [1]] })
    expect(bad.groupSizes).toEqual([1, 1])
    expect(bad.cellSizes).toEqual([[1], [1, 1]])
  })
})

describe('списки наблюдения', () => {
  it('списки по умолчанию; новые инструменты идут в «Наблюдаю»', async () => {
    const w = await import('../src/stores/watchlist')
    expect(w.lists.all.map((l) => l.name)).toEqual(['Поводыри', 'Сделки', 'Ордера', 'Не взяли', 'Закрытые', 'Наблюдаю', 'Остальные'])
    expect(w.lists.all[0].items.map((i) => i.symbol)).toEqual(['BTCUSDT', 'ETHUSDT'])
    expect(w.activeList.value.name).toBe('Наблюдаю')
  })

  it('инструмент переносится внутри списка и между списками', async () => {
    const w = await import('../src/stores/watchlist')
    const [lead, deals] = w.lists.all
    const names = (l: { items: { symbol: string }[] }) => l.items.map((i) => i.symbol)
    lead.items.splice(0, lead.items.length, row('A', 1, 0, 0), row('B', 1, 0, 0), row('C', 1, 0, 0))
    deals.items.splice(0, deals.items.length, row('X', 1, 0, 0))

    w.moveItem(lead.id, 0, lead.id, 3) // A в конец
    expect(names(lead)).toEqual(['B', 'C', 'A'])
    w.moveItem(lead.id, 2, lead.id, 0) // A в начало
    expect(names(lead)).toEqual(['A', 'B', 'C'])
    w.moveItem(lead.id, 1, lead.id, 2) // «перед следующим» — то же место, ничего не меняется
    expect(names(lead)).toEqual(['A', 'B', 'C'])

    w.moveItem(lead.id, 1, deals.id, 0) // B в начало другого списка
    expect(names(lead)).toEqual(['A', 'C'])
    expect(names(deals)).toEqual(['B', 'X'])
  })

  it('при переносе в список, где инструмент уже есть, дубль не появляется', async () => {
    const w = await import('../src/stores/watchlist')
    const [lead, deals] = w.lists.all
    lead.items.splice(0, lead.items.length, row('A', 1, 0, 0))
    deals.items.splice(0, deals.items.length, row('X', 1, 0, 0), row('A', 1, 0, 0))
    w.moveItem(lead.id, 0, deals.id, 0)
    expect(deals.items.map((i) => i.symbol)).toEqual(['A', 'X'])
    expect(lead.items).toHaveLength(0)
  })

  it('список переставляется целиком вместе с инструментами', async () => {
    const w = await import('../src/stores/watchlist')
    const before = w.lists.all.map((l) => l.name)
    w.moveList(5, 0)
    expect(w.lists.all.map((l) => l.name)).toEqual([before[5], ...before.slice(0, 5), before[6]])
    w.moveList(0, 6)
    expect(w.lists.all.map((l) => l.name)).toEqual(before)
  })

  it('отметка направления — общая для монеты, переключается по кругу и участвует в фильтре', async () => {
    const w = await import('../src/stores/watchlist')
    const item = row('MARKUSDT', 1, 0, 0)
    w.setMark(item, null)
    w.cycleSide(item)
    expect(w.markOf(item)).toBe('long')
    // та же монета в другом месте (отбор, другой список) показывает ту же отметку
    expect(w.sideOf(row('MARKUSDT', 5, 0, 0))).toBe('long')
    w.lists.filter = 'short'
    expect(w.matchesFilter(item)).toBe(false)
    w.cycleSide(item)
    expect(w.matchesFilter(item)).toBe(true)
    w.cycleSide(item)
    expect(w.markOf(item)).toBeNull()
    // неотмеченный инструмент проходит и фильтр шортов, и фильтр лонгов
    expect(w.matchesFilter(item)).toBe(true)
    w.lists.filter = 'long'
    expect(w.matchesFilter(item)).toBe(true)
    w.lists.filter = 'all'
  })

  it('монета добавляется в выбранный список и убирается из него', async () => {
    const w = await import('../src/stores/watchlist')
    const item = row('PICKUSDT', 1, 0, 0)
    const [a, b] = w.lists.all
    w.toggleInList(a, item)
    w.toggleInList(b, item)
    expect(w.listsOf(item).map((l) => l.id)).toEqual([a.id, b.id])
    w.toggleInList(a, item)
    expect(w.listsOf(item).map((l) => l.id)).toEqual([b.id])
    w.toggleInList(b, item)
    expect(w.listsOf(item)).toHaveLength(0)
  })
})

describe('чеклист', () => {
  it('по умолчанию — шесть блоков; зависимые блоки скрыты, пока не выбран стиль', async () => {
    const c = await import('../src/stores/checklist')
    const blocks = c.defaultBlocks()
    expect(blocks.map((b) => b.question)).toEqual(['Стиль торговли', 'Уровни', 'Предпосылки к пробою', 'Предпосылки к ЛП/Отбою', 'ТВХ', 'Ордер'])
    const visible = (sel: Record<string, string[]>) => blocks.filter((b) => c.blockVisible(b, sel)).map((b) => b.id)
    expect(visible({})).toEqual(['style', 'levels', 'entry', 'order'])
    expect(visible({ style: ['Пробой'] })).toEqual(['style', 'levels', 'breakout', 'entry', 'order'])
    expect(visible({ style: ['Отбой/ЛП'] })).toEqual(['style', 'levels', 'bounce', 'entry', 'order'])
  })

  it('текст: однострочные блоки через запятую, остальные списком, порядок — как в блоке', async () => {
    const c = await import('../src/stores/checklist')
    const blocks = c.defaultBlocks()
    const sel = { style: ['Пробой'], levels: ['Зеркальный', 'Экстремум'], breakout: ['Хороший запас хода', 'Ближний ретест'], order: ['3к1'] }
    expect(c.buildText(blocks, sel)).toBe(
      'Стиль торговли: Пробой\n\nУровни: Экстремум, Зеркальный\n\nПредпосылки к пробою:\n - Ближний ретест\n - Хороший запас хода\n\nОрдер: 3к1',
    )
  })

  it('ответы скрытого блока в текст не попадают', async () => {
    const c = await import('../src/stores/checklist')
    const text = c.buildText(c.defaultBlocks(), { style: ['Отбой/ЛП'], breakout: ['Ближний ретест'], bounce: ['V-формация'] })
    expect(text).toBe('Стиль торговли: Отбой/ЛП\n\nПредпосылки к ЛП/Отбою:\n - V-формация')
  })

  it('один вариант заменяет прежний, несколько — накапливаются; повторный выбор снимает отметку', async () => {
    const c = await import('../src/stores/checklist')
    const [style, levels] = c.defaultBlocks()
    const sel: Record<string, string[]> = {}
    c.toggleAnswer(style, sel, 'Пробой')
    c.toggleAnswer(style, sel, 'Отбой/ЛП')
    expect(sel.style).toEqual(['Отбой/ЛП'])
    c.toggleAnswer(style, sel, 'Отбой/ЛП')
    expect(sel.style).toEqual([])
    c.toggleAnswer(levels, sel, 'Излом')
    c.toggleAnswer(levels, sel, 'Локальный')
    c.toggleAnswer(levels, sel, 'Излом')
    expect(sel.levels).toEqual(['Локальный'])
  })

  it('пустой выбор — пустой текст', async () => {
    const c = await import('../src/stores/checklist')
    expect(c.buildText(c.defaultBlocks(), {})).toBe('')
  })
})
