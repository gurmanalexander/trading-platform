/**
 * Посредник на странице журнала: передаёт запросы страницы фоновой части расширения и ответы
 * обратно. Сам ничего не знает о ключах. Браузер подключает его только на сайте журнала
 * (список адресов — в манифесте).
 */
const TAG = 'tvx-bridge'
// в Firefox интерфейс расширений называется browser, в остальных браузерах — chrome
const api: typeof chrome = (globalThis as unknown as { browser?: typeof chrome }).browser ?? chrome

const post = (msg: object) => window.postMessage({ from: TAG, ...msg }, location.origin)

window.addEventListener('message', (e) => {
  if (e.source !== window || e.origin !== location.origin) return
  const m = e.data
  if (!m || m.to !== TAG || typeof m.id !== 'number') return
  const lost = () => post({ id: m.id, res: { ok: false, error: 'reload' } })
  try {
    // после обновления расширения старый посредник теряет с ним связь — странице нужна перезагрузка
    if (!api.runtime?.id) return lost()
    api.runtime.sendMessage(m.req).then(
      (res) => post({ id: m.id, res: res ?? { ok: false, error: 'reload' } }),
      lost,
    )
  } catch {
    lost()
  }
})

// страница могла загрузиться раньше нас — сообщаем, что мост на месте
post({ ready: true })
