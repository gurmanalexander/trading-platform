import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// Журнал — отдельное приложение в подпапке tvx: собирается в dist/journal/ и публикуется вместе с ним.
// Общий с tvx код (стили, значки, шифрование синхронизации) берётся прямо из ../src.
const here = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  root: here,
  base: './',
  plugins: [vue()],
  build: {
    outDir: fileURLToPath(new URL('../dist/journal', import.meta.url)),
    emptyOutDir: true,
    target: 'es2022',
    cssCodeSplit: false,
  },
  server: { host: true, port: 5174, fs: { allow: [fileURLToPath(new URL('..', import.meta.url))] } },
})
