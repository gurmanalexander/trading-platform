/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// base './' — сборку можно положить в любую папку любого статического хостинга
export default defineConfig({
  base: './',
  plugins: [vue()],
  build: {
    target: 'es2022',
    cssCodeSplit: false,
  },
  server: { host: true },
  // тесты: язык интерфейса по умолчанию — русский (см. tests/setup-lang.ts)
  test: { setupFiles: ['tests/setup-lang.ts'] },
})
