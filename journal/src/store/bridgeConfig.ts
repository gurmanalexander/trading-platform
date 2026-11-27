import { watch } from 'vue'
import { bridgeConfig } from '../bridge/client'
import { prefs, state } from './journal'
import { cloud } from './sync'

/**
 * Передаёт мосту настройки фоновой работы и держит их в актуальном виде: код синхронизации
 * (чтобы мост сам выгружал сделки для других устройств, когда журнал закрыт), глубину первой
 * загрузки и счета, удалённые из журнала.
 */
export function startBridgeConfig() {
  watch(
    () => [state.bridge, cloud.code, cloud.relays.join(' '), prefs.depthDays, state.removed.join(' ')],
    () => {
      if (state.bridge !== 'ready') return
      bridgeConfig({
        sync: cloud.code ? { code: cloud.code, relays: cloud.relays.filter((u) => u.startsWith('wss://')) } : null,
        depthDays: prefs.depthDays,
        removed: [...state.removed],
      }).catch(() => {})
    },
    { immediate: true },
  )
}
