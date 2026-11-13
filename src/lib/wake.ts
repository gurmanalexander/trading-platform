/**
 * «Приложение вернулось»: окно снова на экране, устройство проснулось или появилась сеть.
 *
 * Одного события видимости мало: установленное приложение на телефоне после долгого простоя
 * может вернуться без него. Поэтому слушаем всё, что об этом сообщает (видимость, фокус, показ
 * страницы, возобновление, сеть), и сверх того следим за таймером: если он «проспал» — значит,
 * приложение было заморожено. Близкие по времени сигналы сливаются в один вызов.
 */
export type WakeReason = 'visible' | 'online'
type WakeHandler = (awayMs: number, reason: WakeReason) => void

const TICK_MS = 2000
const handlers = new Set<WakeHandler>()
/** когда приложение в последний раз точно работало на экране */
let lastAlive = Date.now()
let away = 0
let reason: WakeReason = 'visible'
let timer: ReturnType<typeof setTimeout> | 0 = 0

function signal(why: WakeReason) {
  const now = Date.now()
  away = Math.max(away, now - lastAlive)
  lastAlive = now
  if (why === 'online') reason = why
  if (timer) return
  timer = setTimeout(() => {
    timer = 0
    const a = away
    const r = reason
    away = 0
    reason = 'visible'
    for (const h of [...handlers]) h(a, r)
  }, 50)
}

/** awayMs — сколько приложение не работало на экране; reason = 'online' — вернулась сеть */
export function onWake(handler: WakeHandler): () => void {
  handlers.add(handler)
  return () => handlers.delete(handler)
}

if (typeof document !== 'undefined') {
  setInterval(() => {
    if (document.visibilityState !== 'visible') return
    // таймер не срабатывал слишком долго — приложение спало, хотя событий об этом не было
    if (Date.now() - lastAlive > TICK_MS * 5) signal('visible')
    else lastAlive = Date.now()
  }, TICK_MS)
  const visible = () => {
    if (document.visibilityState === 'visible') signal('visible')
  }
  document.addEventListener('visibilitychange', visible)
  document.addEventListener('resume', visible)
  window.addEventListener('pageshow', visible)
  window.addEventListener('focus', visible)
  window.addEventListener('online', () => signal('online'))
}
