import { onScopeDispose, shallowReactive, watch, type WatchSource } from 'vue'
import { symbolKey, type SymbolRef } from '../types'
import { adapters } from '../exchanges'
import { getTf } from '../lib/timeframes'
import { evaluatePosition, latestPosition, type PositionState } from '../chart/position'
import { drawings, type Drawing } from './drawings'
import { onTicker, tickers } from './tickers'

/** Состояние последней позиции инструмента — для списка наблюдения */
export interface Tracked {
  type: 'long' | 'short'
  entry: number
  stop: number
  target: number
  status: PositionState['status']
  /** итог закрытой сделки, R; у открытой считается на лету по текущей цене */
  r: number
}

export const tracked = shallowReactive<Record<string, Tracked>>({})

/** подпись позиции, для которой состояние уже посчитано: id + точки */
const done = new Map<string, string>()
const signature = (d: Drawing) => d.id + d.type + JSON.stringify(d.pts)
// интервал свечей подбирается так, чтобы путь от входа до сейчас уместился в один запрос
const TFS = ['1m', '5m', '15m', '1h', '4h', '1d']

async function evaluate(ref: SymbolRef) {
  const key = symbolKey(ref)
  const d = latestPosition(drawings[key])
  if (!d) {
    done.delete(key)
    delete tracked[key]
    return
  }
  const sig = signature(d)
  if (done.get(key) === sig) return
  done.set(key, sig)
  const base = { type: d.type as 'long' | 'short', entry: d.pts[0].p, target: d.pts[1].p, stop: d.pts[2].p }
  const age = Date.now() / 1000 - d.pts[0].t
  if (age <= 0) {
    tracked[key] = { ...base, status: 'pending', r: 0 }
    return
  }
  const tf = getTf(TFS.find((id) => age / getTf(id).sec <= 950) ?? '1d')
  try {
    const { bars } = await adapters[ref.exchange].fetchKlines(ref.market, ref.symbol, tf, 1000)
    if (done.get(key) !== sig) return // пока ждали ответ, позицию изменили
    const st = evaluatePosition(d, bars)
    tracked[key] = { ...base, status: st.status, r: st.r }
  } catch {
    done.delete(key) // повторим при следующем изменении или обновлении списка
  }
}

/** Следит за последними позициями инструментов списка */
export function useTrackedPositions(source: WatchSource<SymbolRef[]>) {
  let timer = 0
  let current: SymbolRef[] = []
  const run = () => {
    timer = 0
    current.forEach(evaluate)
  }
  const schedule = () => {
    // рисунок во время перетаскивания меняется на каждый кадр — ждём, пока движение закончится
    clearTimeout(timer)
    timer = window.setTimeout(run, 700)
  }
  const stop = watch(
    [source, () => drawings],
    ([list]) => {
      current = list as SymbolRef[]
      schedule()
    },
    { immediate: true, deep: true },
  )
  onScopeDispose(() => {
    stop()
    clearTimeout(timer)
  })
}

// Открытая сделка закрывается, как только живая цена доходит до стопа или цели
onTicker((key, t) => {
  const p = tracked[key]
  if (!p || p.status !== 'open') return
  const sign = p.type === 'long' ? 1 : -1
  if (sign * (t.last - p.stop) <= 0) tracked[key] = { ...p, status: 'sl', r: -1 }
  else if (sign * (t.last - p.target) >= 0) tracked[key] = { ...p, status: 'tp', r: Math.abs(p.target - p.entry) / Math.abs(p.entry - p.stop) }
})

/** Текущий результат в R: у открытой сделки — по живой цене */
export function currentR(key: string): number | null {
  const p = tracked[key]
  if (!p) return null
  if (p.status !== 'open') return p.r
  const last = tickers[key]?.last
  const risk = Math.abs(p.entry - p.stop)
  return last && risk ? ((p.type === 'long' ? 1 : -1) * (last - p.entry)) / risk : null
}
