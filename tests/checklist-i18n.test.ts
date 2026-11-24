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
// первый запуск на английском: чеклист по умолчанию создаётся сразу на английском
i18n.lang = 'en'
const { checklist, defaultBlocks, localizeDefaultChecklist, buildText, blockVisible, addBlock, removeBlock } = await import('../src/stores/checklist')

const questions = () => checklist.blocks.map((b) => b.question)
const CYR = /[А-Яа-яЁё]/

describe('чеклист по умолчанию на двух языках', () => {
  it('при первом запуске — на языке интерфейса', () => {
    expect(questions()).toEqual(['Trading style', 'Levels', 'Breakout signals', 'False breakout/Bounce signals', 'Entry', 'R/R'])
    expect(JSON.stringify(checklist.blocks)).not.toMatch(CYR)
    // зависимые блоки ссылаются на английские варианты
    expect(checklist.blocks[2].dependsOn).toEqual({ block: 'style', answer: 'Breakout' })
  })

  it('у языков одинаковое устройство блоков: id, типы, число вариантов, без повторов', () => {
    const ru = defaultBlocks('ru')
    const en = defaultBlocks('en')
    expect(en.map((b) => [b.id, b.type, b.singleLine, b.answers.length, b.dependsOn?.block])).toEqual(
      ru.map((b) => [b.id, b.type, b.singleLine, b.answers.length, b.dependsOn?.block]),
    )
    for (const b of [...ru, ...en]) expect(new Set(b.answers).size).toBe(b.answers.length)
    for (const b of en) if (b.dependsOn) expect(en.find((x) => x.id === b.dependsOn!.block)!.answers).toContain(b.dependsOn.answer)
  })

  it('стандартные блоки переводятся в обе стороны вместе с отметками', () => {
    const sel = (checklist.selections['binance:futures:BTCUSDT'] = {
      style: ['Breakout'],
      levels: ['Extreme', 'Previous day high'],
      breakout: ['Near retest', 'W-pattern'],
      order: ['3:1'],
      custom: ['что-то своё'],
    })
    const enText = buildText(checklist.blocks, sel)
    expect(enText).toContain('Trading style: Breakout')

    i18n.lang = 'ru'
    localizeDefaultChecklist()
    expect(checklist.blocks).toEqual(defaultBlocks('ru'))
    const s = checklist.selections['binance:futures:BTCUSDT']
    expect(s).toEqual({
      style: ['Пробой'],
      levels: ['Экстремум', 'Хай предыдущего дня'],
      breakout: ['Ближний ретест', 'W-формация'],
      order: ['3к1'],
      custom: ['что-то своё'],
    })
    // зависимый блок по-прежнему виден, текст собирается целиком
    expect(blockVisible(checklist.blocks[2], s)).toBe(true)
    expect(buildText(checklist.blocks, s).split('\n').length).toBe(enText.split('\n').length)

    // повторный вызов на том же языке ничего не меняет
    localizeDefaultChecklist()
    expect(checklist.blocks).toEqual(defaultBlocks('ru'))

    i18n.lang = 'en'
    localizeDefaultChecklist()
    expect(checklist.blocks).toEqual(defaultBlocks('en'))
    expect(checklist.selections['binance:futures:BTCUSDT'].levels).toEqual(['Extreme', 'Previous day high'])
  })

  it('изменённые пользователем блоки не трогаются', () => {
    i18n.lang = 'en'
    checklist.blocks.splice(0, checklist.blocks.length, ...defaultBlocks('en'))
    checklist.blocks[0].question = 'My style'
    i18n.lang = 'ru'
    localizeDefaultChecklist()
    expect(checklist.blocks[0].question).toBe('My style')
    expect(checklist.blocks[1].question).toBe('Levels')

    // добавленный блок — тоже правка
    checklist.blocks.splice(0, checklist.blocks.length, ...defaultBlocks('ru'))
    addBlock()
    i18n.lang = 'en'
    localizeDefaultChecklist()
    expect(checklist.blocks[0].question).toBe('Стиль торговли')
    removeBlock(checklist.blocks[checklist.blocks.length - 1].id)
    localizeDefaultChecklist()
    expect(checklist.blocks).toEqual(defaultBlocks('en'))
  })
})
