import { reactive } from 'vue'
import { load, save } from './storage'

/** Куда можно отправить донат. Адреса проверены владельцем; сеть подписана крупно — ошибка сети стоит денег */
export interface DonateTarget {
  id: string
  coin: string
  network: string
  /** адрес кошелька (или ссылка Binance Pay) — из него рисуется QR-код */
  address: string
  note?: string
}

export const DONATE_TARGETS: DonateTarget[] = [
  { id: 'trc20', coin: 'USDT', network: 'TRC20 · Tron', address: 'TDiQ3qYR3nKasjs7v2Yvf4F9gtKCaApWMb' },
  {
    id: 'evm',
    coin: 'USDT',
    network: 'BEP20 · BNB Smart Chain или ERC20 · Ethereum',
    address: '0xdb91a73ce273e760cfed4b7ae39d73d7502419b6',
    note: 'Один адрес для обеих сетей. В Ethereum комиссия сети заметно выше',
  },
]

/** Binance Pay: перевод внутри Binance без комиссии — по QR-коду в приложении Binance или по ссылке */
export const BINANCE_PAY = { name: 'izi4ka', link: 'https://app.binance.com/uni-qr/LxreT8Gt' }

// ---------- редкая анимация кнопки ----------
// Кнопка доната не мигает постоянно: изредка (не чаще раза в несколько дней) и только у тех,
// кто пользуется терминалом не первый день, сердечко пару раз мягко «вздыхает». Открыли окно
// доната хоть раз — больше не анимируется.

const DAY = 86_400_000
/** сколько дней пользуются терминалом, прежде чем кнопка впервые оживёт */
const FIRST_AFTER_DAYS = 2
/** не чаще, чем раз в столько дней */
const EVERY_DAYS = 4
/** через сколько после запуска, мс — не мешаем в первые секунды работы */
const DELAY_MS = 45_000
/** сколько длится анимация, мс */
const PULSE_MS = 4500

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

/** Пора ли оживить кнопку — по дням использования и времени прошлой анимации */
export function shouldPulse(m: DonateMemo, now = Date.now()): boolean {
  return !m.opened && now - m.first >= FIRST_AFTER_DAYS * DAY && now - m.pulsed >= EVERY_DAYS * DAY
}

let started = false
/** Запускает отложенную анимацию, если она сейчас уместна (вызывается один раз при старте) */
export function scheduleDonatePulse() {
  if (started || typeof window === 'undefined') return
  started = true
  window.setTimeout(() => {
    if (!shouldPulse(memo) || document.visibilityState !== 'visible') return
    memo.pulsed = Date.now()
    save('donate', memo)
    donate.pulse = true
    window.setTimeout(() => (donate.pulse = false), PULSE_MS)
  }, DELAY_MS)
}

/** Окно доната открыли — анимация больше не нужна */
export function markDonateOpened() {
  donate.pulse = false
  if (memo.opened) return
  memo.opened = true
  save('donate', memo)
}
