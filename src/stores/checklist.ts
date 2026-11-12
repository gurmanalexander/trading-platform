import { reactive } from 'vue'
import { load, persist } from '../lib/storage'

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

/** Точки входа: пробойные и от ложного пробоя / отбоя */
const ENTRY_POINTS = [
  'ТВХ - первичный пробой',
  'ТВХ - пробой после поджатия',
  'ТВХ - ретест уровня после пробоя',
  'ТВХ - ложный пробой одним баром',
  'ТВХ - ложный пробой двумя барами',
  'ТВХ - сложный ложный пробой',
  'ТВХ - отбой от уровня',
]

export function defaultBlocks(): CheckBlock[] {
  return [
    { id: 'style', question: 'Стиль торговли', answers: ['Пробой', 'Отбой/ЛП'], type: 'radio', singleLine: true },
    {
      id: 'levels',
      question: 'Уровни',
      answers: ['Экстремум', 'Излом', 'Лоу предыдущего дня', 'Хай предыдущего дня', 'Локальный', 'Лимитный', 'Исторический', 'Зеркальный'],
      type: 'checkbox',
      singleLine: true,
    },
    {
      id: 'breakout',
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
      type: 'checkbox',
      singleLine: false,
      dependsOn: { block: 'style', answer: 'Пробой' },
    },
    {
      id: 'bounce',
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
      type: 'checkbox',
      singleLine: false,
      dependsOn: { block: 'style', answer: 'Отбой/ЛП' },
    },
    { id: 'entry', question: 'ТВХ', answers: ENTRY_POINTS.slice(), type: 'checkbox', singleLine: false },
    { id: 'order', question: 'Ордер', answers: ['3к1', '5к1'], type: 'checkbox', singleLine: true },
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
  if (entry && entry.answers.length === 1 && entry.answers[0] === ENTRY_POINTS[0]) {
    entry.answers = ENTRY_POINTS.slice()
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
  checklist.blocks.push({ id: uid(), question: 'Новый блок', answers: [], type: 'checkbox', singleLine: true })
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
