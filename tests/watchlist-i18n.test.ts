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

const { i18n } = await import('../src/lib/i18n')
// первый запуск на английском: списки по умолчанию создаются сразу с английскими названиями
i18n.lang = 'en'
const { lists, localizeDefaultLists, createList, deleteList } = await import('../src/stores/watchlist')

const RU = ['Поводыри', 'Сделки', 'Ордера', 'Не взяли', 'Закрытые', 'Наблюдаю', 'Остальные']
const EN = ['Leaders', 'Trades', 'Orders', 'Missed', 'Closed', 'Watching', 'Other']
const names = () => lists.all.map((l) => l.name)

describe('названия списков по умолчанию', () => {
  it('при первом запуске — на языке интерфейса', () => {
    expect(names()).toEqual(EN)
    expect(lists.all[0].items.map((r) => r.symbol)).toEqual(['BTCUSDT', 'ETHUSDT'])
  })

  it('стандартные списки переименовываются в обе стороны, остальное не меняется', () => {
    const ids = lists.all.map((l) => l.id)
    const active = lists.activeId
    i18n.lang = 'ru'
    localizeDefaultLists()
    expect(names()).toEqual(RU)
    i18n.lang = 'en'
    localizeDefaultLists()
    expect(names()).toEqual(EN)
    i18n.lang = 'ru'
    localizeDefaultLists()
    localizeDefaultLists()
    expect(names()).toEqual(RU)
    expect(lists.all.map((l) => l.id)).toEqual(ids)
    expect(lists.activeId).toBe(active)
    expect(lists.all[0].items).toHaveLength(2)
  })

  it('переименованные пользователем списки не трогает', () => {
    lists.all[1].name = 'Мои сделки'
    i18n.lang = 'en'
    localizeDefaultLists()
    expect(names()).toEqual(['Поводыри', 'Мои сделки', ...RU.slice(2)])
    lists.all[1].name = 'Сделки'
  })

  it('добавленный или удалённый список — тоже не трогает', () => {
    const active = lists.activeId
    createList('Новый')
    i18n.lang = 'en'
    localizeDefaultLists()
    expect(names()).toEqual([...RU, 'Новый'])
    deleteList(lists.all[lists.all.length - 1].id)
    lists.activeId = active

    const removed = lists.all.splice(6, 1)
    localizeDefaultLists()
    expect(names()).toEqual(RU.slice(0, 6))
    lists.all.push(...removed)
    localizeDefaultLists()
    expect(names()).toEqual(EN)
  })
})
