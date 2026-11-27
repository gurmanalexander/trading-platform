// Снимки журнала для README: тёмная тема на компьютере, на двух языках (демо-данные).
// Запуск: npm run build && node scripts/journal-shots.mjs  (нужен Playwright с Chromium)
import { createServer } from 'node:http'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const { chromium } = createRequire(import.meta.url)('playwright')
const root = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const dist = join(root, 'dist')
if (!existsSync(join(dist, 'journal/index.html'))) throw new Error('нет сборки журнала: сначала npm run build')

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' }
const server = createServer((req, res) => {
  let file = join(dist, normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)))
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html')
  if (!file.startsWith(dist) || !existsSync(file)) return res.writeHead(404).end()
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(readFileSync(file))
})
await new Promise((r) => server.listen(8091, '127.0.0.1', r))

const browser = await chromium.launch()
for (const [lang, out, demo, period] of [
  ['en', 'docs/screenshots/journal.png', 'Try it with demo data', 3],
  ['ru', 'docs/screenshots/ru/journal.png', 'Посмотреть на демо-данных', 3],
]) {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 1040 }, deviceScaleFactor: 2, colorScheme: 'dark', locale: lang === 'ru' ? 'ru-RU' : 'en-US', timezoneId: 'UTC' })
  await ctx.addInitScript((l) => localStorage.setItem('tvx:lang', l), lang)
  const page = await ctx.newPage()
  await page.goto('http://127.0.0.1:8091/journal/')
  await page.click(`text=${demo}`)
  await page.waitForSelector('.hero-num')
  await page.click(`.periods .sg:nth-child(${period + 1})`) // 90 дней
  await page.addStyleTag({ content: '.demo-bar{display:none!important}' })
  await page.waitForTimeout(400)
  await page.screenshot({ path: join(root, out) })
  await ctx.close()
  console.log('снимок:', out)
}
await browser.close()
server.close()
