import { ref } from 'vue'

/** Текущее время (сек), обновляется раз в секунду — один таймер на всё приложение */
export const nowSec = ref(Math.floor(Date.now() / 1000))
setInterval(() => {
  if (document.visibilityState === 'visible') nowSec.value = Math.floor(Date.now() / 1000)
}, 1000)
