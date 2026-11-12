import { reactive, watch } from 'vue'
import { symbolKey, type SymbolRef, type Ticker } from '../types'
import { load, persist } from '../lib/storage'
import { fmtPrice, precisionOf } from '../lib/format'
import { onTicker, watchTicker } from './tickers'
import { toast } from './app'

export interface PriceAlert {
  id: string
  ref: SymbolRef
  price: number
  /** up — сработает, когда цена поднимется до уровня; down — когда опустится */
  dir: 'up' | 'down'
  active: boolean
  createdAt: number
  triggeredAt?: number
}

export const alerts = reactive<PriceAlert[]>(load<PriceAlert[]>('alerts', []).filter((a) => a && a.ref && a.price > 0))
persist('alerts', alerts, () => alerts)

export function addAlert(ref: SymbolRef, price: number, lastPrice: number) {
  alerts.unshift({
    id: Math.random().toString(36).slice(2, 10),
    ref: { exchange: ref.exchange, market: ref.market, symbol: ref.symbol },
    price,
    dir: price >= lastPrice ? 'up' : 'down',
    active: true,
    createdAt: Date.now(),
  })
  requestNotifications()
}

export function removeAlert(id: string) {
  const i = alerts.findIndex((a) => a.id === id)
  if (i >= 0) alerts.splice(i, 1)
}

export function rearmAlert(a: PriceAlert, lastPrice: number) {
  a.dir = a.price >= lastPrice ? 'up' : 'down'
  a.active = true
  a.triggeredAt = undefined
}

export const notifySupported = typeof Notification !== 'undefined'

export function requestNotifications() {
  if (notifySupported && Notification.permission === 'default') Notification.requestPermission().catch(() => {})
}

// ---------- проверка ----------

// Активным оповещениям нужны живые цены, даже если инструмента нет в списке наблюдения
const offs = new Map<string, () => void>()
watch(
  () => alerts.filter((a) => a.active).map((a) => symbolKey(a.ref)),
  () => {
    const want = new Map<string, SymbolRef>()
    for (const a of alerts) if (a.active) want.set(symbolKey(a.ref), a.ref)
    for (const [key, off] of offs) {
      if (!want.has(key)) {
        off()
        offs.delete(key)
      }
    }
    for (const [key, ref] of want) if (!offs.has(key)) offs.set(key, watchTicker(ref))
  },
  { immediate: true },
)

onTicker((key: string, t: Ticker) => {
  for (const a of alerts) {
    if (!a.active || symbolKey(a.ref) !== key) continue
    if ((a.dir === 'up' && t.last >= a.price) || (a.dir === 'down' && t.last <= a.price)) fire(a, t.last)
  }
})

function fire(a: PriceAlert, last: number) {
  a.active = false
  a.triggeredAt = Date.now()
  const p = precisionOf(symbolKey(a.ref), a.price)
  const text = `${a.ref.symbol}: цена ${a.dir === 'up' ? 'поднялась до' : 'опустилась до'} ${fmtPrice(a.price, p)} (сейчас ${fmtPrice(last, p)})`
  toast(text, 'alert', 15000)
  beep()
  navigator.vibrate?.([200, 100, 200])
  if (notifySupported && Notification.permission === 'granted') {
    const opts = { body: text, tag: a.id, icon: './icon-192.png' }
    // На телефонах уведомление можно показать только через service worker
    navigator.serviceWorker
      ?.getRegistration()
      .then((reg) => (reg ? reg.showNotification('Оповещение о цене', opts) : void new Notification('Оповещение о цене', opts)))
      .catch(() => {
        try {
          new Notification('Оповещение о цене', opts)
        } catch {
          /* уведомления недоступны — остаётся сообщение в приложении */
        }
      })
  }
}

let audio: AudioContext | null = null
function beep() {
  try {
    audio ??= new AudioContext()
    const t0 = audio.currentTime
    for (let i = 0; i < 2; i++) {
      const osc = audio.createOscillator()
      const gain = audio.createGain()
      osc.frequency.value = i ? 1175 : 880
      gain.gain.setValueAtTime(0.0001, t0 + i * 0.18)
      gain.gain.exponentialRampToValueAtTime(0.25, t0 + i * 0.18 + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.18 + 0.16)
      osc.connect(gain).connect(audio.destination)
      osc.start(t0 + i * 0.18)
      osc.stop(t0 + i * 0.18 + 0.17)
    }
  } catch {
    /* звук недоступен */
  }
}
