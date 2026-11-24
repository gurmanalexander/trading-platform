import { reactive } from 'vue'
import { load, save } from './storage'

/**
 * Способ доната. Адреса проверены владельцем. Сеть у адреса — главное: USDT, отправленный
 * не в той сети, теряется, поэтому каждая сеть — отдельный способ с крупной подписью.
 */
export interface DonateMethod {
  id: string
  /** крупно на плитке выбора */
  title: string
  /** мелко под названием */
  sub: string
  /** адрес кошелька; у Binance Pay — ссылка оплаты. Из него же рисуется QR-код */
  address: string
  /** сеть словами — для предупреждения «только в сети …» */
  network?: string
  pay?: boolean
  /** короткая пометка на плитке: «без комиссии», «комиссия выше» */
  tag?: string
}

const EVM = '0xdb91a73ce273e760cfed4b7ae39d73d7502419b6'

export const DONATE_METHODS: DonateMethod[] = [
  { id: 'pay', title: 'Binance Pay', sub: 'izi4ka', address: 'https://app.binance.com/uni-qr/LxreT8Gt', pay: true, tag: 'без комиссии' },
  { id: 'trc20', title: 'USDT TRC20', sub: 'сеть Tron', address: 'TDiQ3qYR3nKasjs7v2Yvf4F9gtKCaApWMb', network: 'TRC20 (Tron)' },
  { id: 'bep20', title: 'USDT BEP20', sub: 'BNB Smart Chain', address: EVM, network: 'BEP20 (BNB Smart Chain)' },
  { id: 'erc20', title: 'USDT ERC20', sub: 'Ethereum', address: EVM, network: 'ERC20 (Ethereum)', tag: 'комиссия выше' },
]

// ---------- анимация кнопки ----------
// Сердечко на кнопке доната время от времени «стучит»: два удара с заливкой и расходящееся кольцо.
// Первый раз — вскоре после запуска, потом раз в полторы минуты; когда окно доната уже открывали —
// реже, раз в 15 минут. Анимация идёт только на видимой вкладке.

/** через сколько после запуска первый «стук», мс */
const FIRST_MS = 20_000
/** пауза между «стуками», мс */
const EVERY_MS = 90_000
/** пауза, когда окно доната уже открывали, мс */
const EVERY_OPENED_MS = 15 * 60_000
/** сколько длится «стук», мс (как анимация в стилях: 2 удара по 1.3 с) */
const PULSE_MS = 2700

interface DonateMemo {
  /** когда терминал открыли впервые (с этой версии), мс */
  first: number
  /** когда кнопка анимировалась в последний раз, мс */
  pulsed: number
  /** окно доната открывали */
  opened: boolean
}

const memo: DonateMemo = { first: Date.now(), pulsed: 0, opened: false, ...load<Partial<DonateMemo>>('donate', {}) }
save('donate', memo)

export const donate = reactive({ pulse: false })

/** Пауза до следующего «стука» после прошлого */
export const pulseEvery = (m: Pick<DonateMemo, 'opened'>) => (m.opened ? EVERY_OPENED_MS : EVERY_MS)

/** Пора ли «стукнуть»: с прошлого раза прошла пауза */
export function shouldPulse(m: DonateMemo, now = Date.now()): boolean {
  return now - m.pulsed >= pulseEvery(m)
}

function beat() {
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
  if (!shouldPulse(memo)) return
  memo.pulsed = Date.now()
  save('donate', memo)
  donate.pulse = true
  window.setTimeout(() => (donate.pulse = false), PULSE_MS)
}

let started = false
/** Запускает анимацию кнопки (вызывается один раз при старте приложения) */
export function scheduleDonatePulse() {
  if (started || typeof window === 'undefined') return
  started = true
  window.setTimeout(() => {
    // первый «стук» — независимо от прошлого запуска, если окно ещё не открывали
    if (!memo.opened) memo.pulsed = 0
    beat()
    // дальше проверяем раз в 10 секунд, не пора ли снова
    window.setInterval(beat, 10_000)
  }, FIRST_MS)
}

/** Окно доната открыли — дальше сердечко стучит реже */
export function markDonateOpened() {
  donate.pulse = false
  if (memo.opened) return
  memo.opened = true
  save('donate', memo)
}
