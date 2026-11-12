import { createApp } from 'vue'
import App from './App.vue'
import './styles/base.css'
import './stores/alerts'

createApp(App).mount('#app')

// Service worker: кэш оболочки приложения (быстрый повторный запуск, установка на телефон)
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {})
  })
}
