// Собирает расширение-мост и упаковывает его в архивы для установки.
//
// Сборок две: для браузеров на Chromium (Chrome, Edge, Brave, Opera, Vivaldi, Яндекс Браузер) и для
// Firefox (компьютер и Android). Код один, различается только манифест: в Chromium фоновая часть —
// service worker, в Firefox — фоновый скрипт; Firefox дополнительно требует идентификатор расширения.
//
//   node scripts/build-extension.mjs           обе сборки: мост отвечает только сайту журнала
//   node scripts/build-extension.mjs --dev     ещё и страницам на localhost (для разработки)
//
// Переменные окружения:
//   TVX_JOURNAL_SITE  адрес журнала, если он размещён не на GitHub Pages автора
//   TVX_BRIDGE_MOCK   адрес учебной «биржи» (scripts/mock-exchange.mjs) вместо настоящих — для проверки
//   TVX_BRIDGE_TICK   раз во сколько минут мост сам догружает историю (по умолчанию 5)
//   TVX_EXT_OUT       папка сборки вместо dist-extension (проверочная сборка не затирает обычную)
import { deflateRawSync, crc32 } from 'node:zlib'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative } from 'node:path'
import { build } from 'vite'
import vue from '@vitejs/plugin-vue'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const ext = join(root, 'extension')
const outBase = process.env.TVX_EXT_OUT ? join(root, process.env.TVX_EXT_OUT) : join(root, 'dist-extension')
const dev = process.argv.includes('--dev')
const mock = process.env.TVX_BRIDGE_MOCK ?? ''
const tick = Number(process.env.TVX_BRIDGE_TICK) || 5
const site = process.env.TVX_JOURNAL_SITE ?? 'https://gurmanalexander.github.io/trading-platform/journal/'
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

// Кому мост отвечает: начала адресов (проверяет фоновая часть) и шаблоны для манифеста
const sites = [site, ...(dev ? ['http://localhost:', 'http://127.0.0.1:'] : [])]
const matches = [site + '*', ...(dev ? ['http://localhost/*', 'http://127.0.0.1/*'] : [])]
// Куда расширению разрешено обращаться с ключом
const hosts = mock ? [new URL(mock).origin] : ['https://fapi.binance.com', 'https://api.binance.com', 'https://api.bybit.com', 'https://api.bytick.com']

const define = { __SITES__: JSON.stringify(sites), __MOCK__: JSON.stringify(mock), __VERSION__: JSON.stringify(version), __TICK_MIN__: String(tick) }
const common = { configFile: false, root: ext, logLevel: 'warn', define }
const icons = { 16: 'icon-16.png', 32: 'icon-32.png', 48: 'icon-48.png', 128: 'icon-128.png' }

function manifestFor(browser) {
  const base = {
    manifest_version: 3,
    name: 'tvx bridge',
    version,
    description: 'Read-only bridge between your exchange API keys and the tvx trading journal. Keys never leave the extension.',
    icons,
    action: { default_title: 'tvx bridge', default_icon: icons },
    options_ui: { page: 'options.html', open_in_tab: true },
    // расписание фоновой догрузки истории
    permissions: ['alarms'],
    content_scripts: [{ matches, js: ['content.js'], run_at: 'document_start' }],
    // Запросы по HTTP — только к биржам. По WebSocket мост соединяется с ретрансляторами синхронизации
    // (их список задаёт пользователь) и передаёт туда только зашифрованные сделки, без ключей.
    content_security_policy: { extension_pages: `script-src 'self'; object-src 'self'; connect-src ${hosts.join(' ')} wss:` },
  }
  if (browser === 'firefox')
    return {
      ...base,
      background: { scripts: ['background.js'] },
      // Firefox выдаёт доступ к сайту журнала так же, как к биржам, — через host_permissions
      host_permissions: [...hosts.map((h) => h + '/*'), ...matches],
      browser_specific_settings: {
        gecko: { id: 'tvx-bridge@gurmanalexander.github.io', strict_min_version: '128.0', data_collection_permissions: { required: ['none'] } },
        gecko_android: { strict_min_version: '128.0' },
      },
    }
  return { ...base, minimum_chrome_version: '116', background: { service_worker: 'background.js' }, host_permissions: hosts.map((h) => h + '/*') }
}

async function buildFor(browser) {
  const out = browser === 'firefox' ? outBase + '-firefox' : outBase
  // страница со счетами
  await build({
    ...common,
    base: './',
    publicDir: join(ext, 'public'),
    plugins: [vue()],
    build: { outDir: out, emptyOutDir: true, target: 'es2022', rollupOptions: { input: join(ext, 'options.html') } },
  })
  // фоновая часть и посредник на странице — обычные скрипты одним файлом, без импортов:
  // такой вид одинаково годится и для service worker в Chromium, и для фонового скрипта в Firefox
  for (const [entry, name, file] of [
    ['src/background.ts', 'tvxBridgeBackground', 'background.js'],
    ['src/content.ts', 'tvxBridge', 'content.js'],
  ]) {
    await build({
      ...common,
      publicDir: false,
      build: { outDir: out, emptyOutDir: false, target: 'es2022', lib: { entry: join(ext, entry), formats: ['iife'], name, fileName: () => file } },
    })
  }
  writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifestFor(browser), null, 2) + '\n')

  const files = walk(out)
    .sort()
    .map((p) => ({ name: relative(out, p).split('\\').join('/'), data: readFileSync(p) }))
  const archive = zip(files)
  // архивы обычной сборки кладутся рядом с журналом, чтобы их можно было скачать с сайта;
  // проверочная сборка (другая папка, учебная биржа, localhost) на сайт не попадает
  const journalDist = join(root, 'dist/journal')
  const plain = !process.env.TVX_EXT_OUT && !mock && !dev
  const target = plain && existsSync(journalDist) ? join(journalDist, browser === 'firefox' ? 'tvx-bridge-firefox.zip' : 'tvx-bridge.zip') : out + '.zip'
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, archive)
  console.log(`расширение (${browser}): ${relative(root, out)}/ (${files.length} файлов), архив: ${relative(root, target)} (${(archive.length / 1024).toFixed(0)} КБ)${dev ? ' [dev]' : ''}${mock ? ' [mock ' + mock + ']' : ''}`)
}

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

await buildFor('chromium')
await buildFor('firefox')
