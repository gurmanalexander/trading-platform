import { createApp } from 'vue'
import '../../../src/styles/base.css'
import Options from './Options.vue'

// тема — как в системе
const mq = matchMedia('(prefers-color-scheme: dark)')
const apply = () => (document.documentElement.dataset.theme = mq.matches ? 'dark' : 'light')
apply()
mq.addEventListener('change', apply)

createApp(Options).mount('#app')
