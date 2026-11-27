import { createApp } from 'vue'
import '../../src/styles/base.css'
import App from './App.vue'

createApp(App).mount('#app')

// Service worker: кэш оболочки (быстрый повторный запуск, установка на телефон)
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {})
  })
}
