// Растровые значки журнала и расширения-моста из journal/public/icon.svg.
// Запуск: node scripts/gen-journal-icons.mjs (нужен Playwright с Chromium)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'

// Playwright может стоять глобально (вне node_modules проекта) — так его найдёт и require
const { chromium } = createRequire(import.meta.url)('playwright')

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const svg = readFileSync(join(root, 'journal/public/icon.svg'), 'utf8')
const uri = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64')

/** [файл, размер, поля для «маскируемого» значка, фон] */
const targets = [
  ['journal/public/icon-180.png', 180, 0, '#ffffff'],
  ['journal/public/icon-192.png', 192, 0, 'transparent'],
  ['journal/public/icon-512.png', 512, 0, 'transparent'],
  ['journal/public/icon-maskable-512.png', 512, 0.12, '#ffffff'],
  ['extension/public/icon-16.png', 16, 0, 'transparent'],
  ['extension/public/icon-32.png', 32, 0, 'transparent'],
  ['extension/public/icon-48.png', 48, 0, 'transparent'],
  ['extension/public/icon-128.png', 128, 0, 'transparent'],
]

const browser = await chromium.launch()
for (const [file, size, pad, bg] of targets) {
  const page = await browser.newPage({ viewport: { width: size, height: size } })
  const inner = Math.round(size * (1 - pad * 2))
  await page.setContent(
    `<body style="margin:0;width:${size}px;height:${size}px;display:grid;place-items:center;background:${bg}"><img src="${uri}" width="${inner}" height="${inner}"></body>`,
  )
  mkdirSync(dirname(join(root, file)), { recursive: true })
  writeFileSync(join(root, file), await page.screenshot({ omitBackground: bg === 'transparent' }))
  await page.close()
}
await browser.close()
console.log('готово:', targets.length, 'значков')
