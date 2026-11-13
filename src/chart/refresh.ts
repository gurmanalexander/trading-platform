import { ref } from 'vue'
import { adapters } from '../exchanges'
import { refresh as refreshScreener } from '../stores/screener'
import { refreshDayStats } from '../stores/atr'
import { wakeRelays } from '../stores/cloud'
import { allCharts } from './registry'

/** Идёт обновление по просьбе пользователя */
export const refreshing = ref(false)

/**
 * «Обновить всё» без перезапуска приложения: соединения с биржами создаются заново,
 * графики дочитывают свежие свечи, отбор и дневные показатели запрашиваются снова.
 */
export async function refreshAll() {
  if (refreshing.value) return
  refreshing.value = true
  const started = Date.now()
  try {
    Object.values(adapters).forEach((a) => a.reconnect())
    wakeRelays(true)
    refreshDayStats()
    await Promise.allSettled([...allCharts().map((c) => c.refreshNow()), refreshScreener()])
    // слишком быстрый ответ выглядит так, будто ничего не произошло
    const left = 500 - (Date.now() - started)
    if (left > 0) await new Promise((r) => setTimeout(r, left))
  } finally {
    refreshing.value = false
  }
}
