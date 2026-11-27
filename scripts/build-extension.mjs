// Собирает расширение-мост в dist-extension/ и упаковывает его в архив.
//
//   node scripts/build-extension.mjs           обычная сборка: мост отвечает только сайту журнала
//   node scripts/build-extension.mjs --dev     ещё и страницам на localhost (для разработки)
//
// Переменные окружения:
//   TVX_JOURNAL_SITE  адрес журнала, если он размещён не на GitHub Pages автора
//   TVX_BRIDGE_MOCK   адрес учебной «биржи» (scripts/mock-exchange.mjs) вместо настоящих — для проверки
//   TVX_EXT_OUT       папка сборки вместо dist-extension (проверочная сборка не затирает обычную)
import { deflateRawSync, crc32 } from 'node:zlib'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative } from 'node:path'
import { build } from 'vite'
import vue from '@vitejs/plugin-vue'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const ext = join(root, 'extension')
const out = process.env.TVX_EXT_OUT ? join(root, process.env.TVX_EXT_OUT) : join(root, 'dist-extension')
const dev = process.argv.includes('--dev')
const mock = process.env.TVX_BRIDGE_MOCK ?? ''
const site = process.env.TVX_JOURNAL_SITE ?? 'https://gurmanalexander.github.io/trading-platform/journal/'
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

// Кому мост отвечает: начала адресов (проверяет фоновая часть) и шаблоны для манифеста
const sites = [site, ...(dev ? ['http://localhost:', 'http://127.0.0.1:'] : [])]
const matches = [site + '*', ...(dev ? ['http://localhost/*', 'http://127.0.0.1/*'] : [])]
// Куда расширению разрешено ходить
const hosts = mock ? [new URL(mock).origin] : ['https://fapi.binance.com', 'https://api.binance.com', 'https://api.bybit.com', 'https://api.bytick.com']

const define = { __SITES__: JSON.stringify(sites), __MOCK__: JSON.stringify(mock), __VERSION__: JSON.stringify(version) }
const common = { configFile: false, root: ext, logLevel: 'warn', define }

// страница со счетами
await build({
  ...common,
  base: './',
  publicDir: join(ext, 'public'),
  plugins: [vue()],
  build: { outDir: out, emptyOutDir: true, target: 'es2022', rollupOptions: { input: join(ext, 'options.html') } },
})
// фоновая часть — модуль
await build({
  ...common,
  publicDir: false,
  build: { outDir: out, emptyOutDir: false, target: 'es2022', lib: { entry: join(ext, 'src/background.ts'), formats: ['es'], fileName: () => 'background.js' } },
})
// посредник на странице — обычный скрипт без импортов
await build({
  ...common,
  publicDir: false,
  build: { outDir: out, emptyOutDir: false, target: 'es2022', lib: { entry: join(ext, 'src/content.ts'), formats: ['iife'], name: 'tvxBridge', fileName: () => 'content.js' } },
})

const icons = { 16: 'icon-16.png', 32: 'icon-32.png', 48: 'icon-48.png', 128: 'icon-128.png' }
const manifest = {
  manifest_version: 3,
  name: 'tvx bridge',
  version,
  description: 'Read-only bridge between your exchange API keys and the tvx trading journal. Keys never leave the extension.',
  minimum_chrome_version: '116',
  icons,
  action: { default_title: 'tvx bridge', default_icon: icons },
  options_ui: { page: 'options.html', open_in_tab: true },
  background: { service_worker: 'background.js', type: 'module' },
  content_scripts: [{ matches, js: ['content.js'], run_at: 'document_start' }],
  host_permissions: hosts.map((h) => h + '/*'),
  // страницы и фоновая часть расширения могут соединяться только с биржами
  content_security_policy: { extension_pages: `script-src 'self'; object-src 'self'; connect-src ${hosts.join(' ')}` },
}
writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')

// ---------- архив ----------

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
}

/** Простой zip: каждый файл сжат deflate, без дополнительных полей */
function zip(files) {
  const parts = []
  const central = []
  let offset = 0
  for (const { name, data } of files) {
    const nameBuf = Buffer.from(name, 'utf8')
    const body = deflateRawSync(data, { level: 9 })
    const head = Buffer.alloc(30)
    head.writeUInt32LE(0x04034b50, 0)
    head.writeUInt16LE(20, 4) // версия для распаковки
    head.writeUInt16LE(0x0800, 6) // имена в UTF-8
    head.writeUInt16LE(8, 8) // deflate
    head.writeUInt16LE(0, 10) // время и дата — постоянные: архив из одних и тех же файлов получается одинаковым
    head.writeUInt16LE(0x21, 12)
    head.writeUInt32LE(crc32(data), 14)
    head.writeUInt32LE(body.length, 18)
    head.writeUInt32LE(data.length, 22)
    head.writeUInt16LE(nameBuf.length, 26)
    parts.push(head, nameBuf, body)
    const cen = Buffer.alloc(46)
    cen.writeUInt32LE(0x02014b50, 0)
    cen.writeUInt16LE(20, 4)
    head.copy(cen, 6, 4, 30) // те же поля, что в местном заголовке
    cen.writeUInt32LE(offset, 42)
    central.push(cen, nameBuf)
    offset += head.length + nameBuf.length + body.length
  }
  const cenBuf = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(files.length, 8)
  end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(cenBuf.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...parts, cenBuf, end])
}

const files = walk(out)
  .sort()
  .map((p) => ({ name: relative(out, p).split('\\').join('/'), data: readFileSync(p) }))
const archive = zip(files)
// архив кладётся рядом с журналом, чтобы его можно было скачать с сайта
const journalDist = join(root, 'dist/journal')
// проверочная сборка (другая папка, учебная биржа) на сайт не попадает
const plain = !process.env.TVX_EXT_OUT && !mock && !dev
const target = plain && existsSync(journalDist) ? join(journalDist, 'tvx-bridge.zip') : out + '.zip'
mkdirSync(dirname(target), { recursive: true })
writeFileSync(target, archive)
console.log(`расширение: ${relative(root, out)}/ (${files.length} файлов), архив: ${relative(root, target)} (${(archive.length / 1024).toFixed(0)} КБ)${dev ? ' [dev]' : ''}${mock ? ' [mock ' + mock + ']' : ''}`)
