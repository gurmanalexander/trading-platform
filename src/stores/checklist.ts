import { reactive } from 'vue'
import { load, persist } from '../lib/storage'
import { i18n, t, type Lang } from '../lib/i18n'

/**
 * Чеклист сделки: блоки вопросов с вариантами. Отмеченное запоминается по монетам и собирается
 * в текст — его можно скопировать или держать заметкой на графике. Набор блоков каждый настраивает под себя.
 */
export interface CheckBlock {
  id: string
  question: string
  answers: string[]
  /** radio — один вариант, checkbox — несколько */
  type: 'radio' | 'checkbox'
  /** true — ответы в одну строку через запятую, false — списком */
  singleLine: boolean
  /** блок показывается, только если в другом блоке выбран этот ответ */
  dependsOn?: { block: string; answer: string }
}

export type Selection = Record<string, string[]>

const uid = () => Math.random().toString(36).slice(2, 9)
const LANGS: Lang[] = ['ru', 'en']

/** Точки входа: пробойные и от ложного пробоя / отбоя */
const ENTRY_POINTS: Record<Lang, string[]> = {
  ru: [
    'ТВХ - первичный пробой',
    'ТВХ - пробой после поджатия',
    'ТВХ - ретест уровня после пробоя',
    'ТВХ - ложный пробой одним баром',
    'ТВХ - ложный пробой двумя барами',
    'ТВХ - сложный ложный пробой',
    'ТВХ - отбой от уровня',
  ],
  en: [
    'Entry - initial breakout',
    'Entry - breakout after a squeeze',
    'Entry - level retest after a breakout',
    'Entry - one-bar false breakout',
    'Entry - two-bar false breakout',
    'Entry - complex false breakout',
    'Entry - bounce off the level',
  ],
}

/**
 * Тексты блоков по умолчанию на каждом языке. Блоки — данные пользователя (он их правит), поэтому
 * переводятся не «на лету», а один раз: при создании и в localizeDefaultChecklist, пока их не меняли.
 * Порядок вариантов в обоих языках одинаковый — по нему переводятся сохранённые отметки.
 */
const DEFAULT_TEXT: Record<Lang, Record<string, { question: string; answers: string[] }>> = {
  ru: {
    style: { question: 'Стиль торговли', answers: ['Пробой', 'Отбой/ЛП'] },
    levels: {
      question: 'Уровни',
      answers: ['Экстремум', 'Излом', 'Лоу предыдущего дня', 'Хай предыдущего дня', 'Локальный', 'Лимитный', 'Исторический', 'Зеркальный'],
    },
    breakout: {
      question: 'Предпосылки к пробою',
      answers: [
        'Ближний ретест',
        'Подход к уровню маленькими барами',
        'Закрытие вблизи уровня',
        'Закрытие под хай/лоу на уровне или сразу после уровня',
        'Инструмент очень долго копил',
        'Нет реакции на ЛП',
        'Консолидация возле уровня с затуханием волатильности',
        'После подхода паранормального бара к уровню нет отката, консолидация',
        'Хай/лоу внутри дня не обновлялись',
        'Пустота, отсутствие ближайших уровней',
        'ГТ и ЛТ совпадают',
        'Хороший запас хода',
        'Внешний фон в сторону пробоя (сильнее или слабее рынка)',
        'U-формация',
        'W-формация',
        'Выкупной бар',
        'Продажный бар',
      ],
    },
    bounce: {
      question: 'Предпосылки к ЛП/Отбою',
      answers: [
        'Дальний ретест',
        'Длинное безоткатное движение',
        'Подход на больших барах',
        'День открывается далеко от уровня более 50% ATR',
        'Дистрибьюционная модель на дальнем таймфрейме',
        'Зона зараженности',
        'Экстремум',
        'Закрытие далеко от уровня',
        'Задерг против тренда',
        'Внешний фон в противоположную сторону',
        'Быстрый подход к уровню на локальном ТФ',
        'Хай/лоу внутри дня обновлялись',
        'V-формация',
      ],
    },
    entry: { question: 'ТВХ', answers: ENTRY_POINTS.ru },
    order: { question: 'Ордер', answers: ['3к1', '5к1'] },
  },
  en: {
    style: { question: 'Trading style', answers: ['Breakout', 'Bounce/False breakout'] },
    levels: {
      question: 'Levels',
      answers: ['Extreme', 'Trend break', 'Previous day low', 'Previous day high', 'Local', 'Limit order', 'Historical', 'Mirror'],
    },
    breakout: {
      question: 'Breakout signals',
      answers: [
        'Near retest',
        'Approach to the level with small bars',
        'Close near the level',
        'Close at the high/low at the level or just past it',
        'Long accumulation',
        'No reaction to false breakouts',
        'Consolidation near the level with fading volatility',
        'Abnormal bar reached the level with no pullback, consolidation',
        'Intraday high/low not broken',
        'Empty space, no nearby levels',
        'Higher and local trends align',
        'Plenty of room to the next level',
        'Market backdrop supports the breakout (stronger or weaker than the market)',
        'U-pattern',
        'W-pattern',
        'Buying bar',
        'Selling bar',
      ],
    },
    bounce: {
      question: 'False breakout/Bounce signals',
      answers: [
        'Distant retest',
        'Long move without pullbacks',
        'Approach with large bars',
        'Day opens more than 50% ATR away from the level',
        'Distribution pattern on the higher timeframe',
        'Choppy zone',
        'Extreme',
        'Close far from the level',
        'Spike against the trend',
        'Market backdrop against the move',
        'Fast approach to the level on the lower timeframe',
        'Intraday high/low already broken',
        'V-pattern',
      ],
    },
    entry: { question: 'Entry', answers: ENTRY_POINTS.en },
    order: { question: 'R/R', answers: ['3:1', '5:1'] },
  },
}

/** Блоки по умолчанию на языке интерфейса (или на указанном) */
export function defaultBlocks(lang: Lang = i18n.lang): CheckBlock[] {
  const tx = DEFAULT_TEXT[lang]
  const block = (id: string, type: CheckBlock['type'], singleLine: boolean, dependsOn?: CheckBlock['dependsOn']): CheckBlock => ({
    id,
    question: tx[id].question,
    answers: tx[id].answers.slice(),
    type,
    singleLine,
    ...(dependsOn ? { dependsOn } : {}),
  })
  const [breakout, bounce] = tx.style.answers
  return [
    block('style', 'radio', true),
    block('levels', 'checkbox', true),
    block('breakout', 'checkbox', false, { block: 'style', answer: breakout }),
    block('bounce', 'checkbox', false, { block: 'style', answer: bounce }),
    block('entry', 'checkbox', false),
    block('order', 'checkbox', true),
  ]
}

function sanitize(raw: unknown): CheckBlock[] {
  if (!Array.isArray(raw)) return defaultBlocks()
  const out: CheckBlock[] = []
  for (const b of raw) {
    if (!b || typeof b.question !== 'string' || !Array.isArray(b.answers)) continue
    out.push({
      id: typeof b.id === 'string' && b.id ? b.id : uid(),
      question: b.question,
      answers: b.answers.filter((a: unknown) => typeof a === 'string' && a),
      type: b.type === 'radio' ? 'radio' : 'checkbox',
      singleLine: b.singleLine === true,
      ...(b.dependsOn && typeof b.dependsOn.block === 'string' ? { dependsOn: { block: b.dependsOn.block, answer: String(b.dependsOn.answer ?? '') } } : {}),
    })
  }
  // раньше в блоке «ТВХ» был один вариант — дополняем его остальными точками входа
  const entry = out.find((b) => b.id === 'entry')
  const lang = entry && entry.answers.length === 1 ? LANGS.find((l) => entry.answers[0] === ENTRY_POINTS[l][0]) : undefined
  if (entry && lang) {
    entry.answers = ENTRY_POINTS[lang].slice()
    entry.singleLine = false
  }
  return out
}

export const checklist = reactive({
  blocks: sanitize(load<unknown>('checklist', null)),
  /** отмеченное по инструментам: ключ инструмента -> id блока -> ответы */
  selections: load<Record<string, Selection>>('checklistSel', {}),
  /** отмеченное сразу ставится заметкой на график и обновляется при каждом изменении */
  auto: load<boolean>('checklistAuto', true),
})
persist('checklistAuto', () => checklist.auto, () => checklist.auto)
persist('checklist', () => checklist.blocks, () => checklist.blocks)
persist('checklistSel', () => checklist.selections, () => checklist.selections)

/** Блок виден, если он ни от чего не зависит либо в «родительском» блоке выбран нужный ответ */
export function blockVisible(block: CheckBlock, sel: Selection): boolean {
  const dep = block.dependsOn
  return !dep || !dep.block || (sel[dep.block] ?? []).includes(dep.answer)
}

/** Текст заметки: по видимым блокам с отмеченными ответами, блоки разделены пустой строкой */
export function buildText(blocks: CheckBlock[], sel: Selection): string {
  const parts: string[] = []
  for (const b of blocks) {
    if (!blockVisible(b, sel)) continue
    // порядок ответов — как в блоке, а не как их отмечали
    const chosen = b.answers.filter((a) => (sel[b.id] ?? []).includes(a))
    if (!chosen.length) continue
    parts.push(b.singleLine ? `${b.question}: ${chosen.join(', ')}` : `${b.question}:\n` + chosen.map((a) => ` - ${a}`).join('\n'))
  }
  return parts.join('\n\n')
}

export function toggleAnswer(block: CheckBlock, sel: Selection, answer: string) {
  const cur = sel[block.id] ?? []
  if (block.type === 'radio') sel[block.id] = cur.includes(answer) ? [] : [answer]
  else sel[block.id] = cur.includes(answer) ? cur.filter((a) => a !== answer) : [...cur, answer]
}

export function addBlock() {
  checklist.blocks.push({ id: uid(), question: t('Новый блок'), answers: [], type: 'checkbox', singleLine: true })
}

export function removeBlock(id: string) {
  const i = checklist.blocks.findIndex((b) => b.id === id)
  if (i >= 0) checklist.blocks.splice(i, 1)
  for (const b of checklist.blocks) if (b.dependsOn?.block === id) delete b.dependsOn
}

export function moveBlock(index: number, step: number) {
  const to = index + step
  if (to < 0 || to >= checklist.blocks.length) return
  const [b] = checklist.blocks.splice(index, 1)
  checklist.blocks.splice(to, 0, b)
}

export function resetBlocks() {
  checklist.blocks.splice(0, checklist.blocks.length, ...defaultBlocks())
}

/** Блоки в виде, удобном для сравнения (без учёта порядка полей) */
const shape = (blocks: CheckBlock[]) =>
  JSON.stringify(blocks.map((b) => [b.id, b.question, b.answers, b.type, b.singleLine, b.dependsOn ? [b.dependsOn.block, b.dependsOn.answer] : null]))

/**
 * Если блоки чеклиста в точности стандартные (пользователь их не менял) — заменяет их стандартными
 * на языке интерфейса. Отметки хранятся текстом варианта, поэтому переводятся и они: по номеру
 * варианта в том же блоке. Вызывается при выборе языка; свои блоки и правки не трогает.
 */
export function localizeDefaultChecklist(): void {
  const to = i18n.lang
  const now = shape(checklist.blocks)
  const from = LANGS.find((l) => l !== to && shape(defaultBlocks(l)) === now)
  if (!from) return
  const src = defaultBlocks(from)
  const dst = defaultBlocks(to)
  for (const sel of Object.values(checklist.selections)) {
    if (!sel || typeof sel !== 'object') continue
    for (const b of src) {
      const chosen = sel[b.id]
      if (!Array.isArray(chosen)) continue
      const target = dst.find((x) => x.id === b.id)!
      sel[b.id] = chosen.map((a) => {
        const i = b.answers.indexOf(a)
        return i >= 0 ? target.answers[i] : a
      })
    }
  }
  checklist.blocks.splice(0, checklist.blocks.length, ...dst)
}

// ---------- синхронизация между устройствами ----------

export function exportChecklist() {
  return { blocks: checklist.blocks, selections: checklist.selections }
}

export function importChecklist(raw: unknown) {
  if (!raw || typeof raw !== 'object') return
  const v = raw as { blocks?: unknown; selections?: unknown }
  if (Array.isArray(v.blocks)) checklist.blocks.splice(0, checklist.blocks.length, ...sanitize(v.blocks))
  if (v.selections && typeof v.selections === 'object') {
    for (const k of Object.keys(checklist.selections)) delete checklist.selections[k]
    Object.assign(checklist.selections, v.selections)
  }
}
