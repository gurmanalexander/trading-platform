// Сквозная проверка: расширение-мост + журнал + учебная биржа в настоящем Chromium.
//
// Что проверяется: ключ с правом торговли мост отклоняет; ключи только для чтения принимает;
// мост сам, в фоне, загружает историю счетов — журнал для этого открывать не нужно; журнал
// показывает готовые сделки; сайт не может получить ключи. С флагом --sync (нужны общедоступные
// ретрансляторы Nostr): второе устройство без расширения получает сделки через синхронизацию,
// а свежая сделка доходит до него, когда вкладка журнала на «компьютере» закрыта.
//
// Запуск (нужны собранный dist и Playwright с Chromium):
//   npm run build && node scripts/e2e-bridge.mjs [--sync] [--shots <папка>]
import { createServer } from 'node:http'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { startMockExchange } from './mock-exchange.mjs'

const { chromium, devices } = createRequire(import.meta.url)('playwright')
const root = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const withSync = process.argv.includes('--sync')
const shotsAt = process.argv.indexOf('--shots')
const shots = shotsAt > 0 ? process.argv[shotsAt + 1] : ''
if (shots) mkdirSync(shots, { recursive: true })

const MOCK_PORT = 8787
const SITE_PORT = 8090
const SITE = `http://localhost:${SITE_PORT}/trading-platform/journal/`

let failed = 0
const check = (name, ok, detail = '') => {
  if (!ok) failed++
  console.log(`${ok ? '  ok ' : 'FAIL '} ${name}${detail ? ' — ' + detail : ''}`)
}

// ---------- окружение: учебная биржа, сайт, проверочная сборка расширения ----------

if (!existsSync(join(root, 'dist/journal/index.html'))) throw new Error('нет сборки журнала: сначала npm run build')
const { server: mockServer } = await startMockExchange(MOCK_PORT)

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.zip': 'application/zip' }
const site = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  if (!path.startsWith('/trading-platform/')) return res.writeHead(404).end()
  let file = join(root, 'dist', normalize(path.slice('/trading-platform/'.length)))
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html')
  if (!file.startsWith(join(root, 'dist')) || !existsSync(file)) return res.writeHead(404).end()
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(readFileSync(file))
})
await new Promise((r) => site.listen(SITE_PORT, '127.0.0.1', r))

const extDir = join(root, 'dist-extension-e2e')
execFileSync(process.execPath, [join(root, 'scripts/build-extension.mjs'), '--dev'], {
  // расписание фоновой догрузки ускорено: раз в 12 секунд вместо пяти минут
  env: { ...process.env, TVX_BRIDGE_MOCK: `http://localhost:${MOCK_PORT}`, TVX_EXT_OUT: 'dist-extension-e2e', TVX_BRIDGE_TICK: '0.2' },
  stdio: 'inherit',
})

const profile = mkdtempSync(join(tmpdir(), 'tvx-e2e-'))
const ctx = await chromium.launchPersistentContext(profile, {
  channel: 'chromium',
  headless: true,
  viewport: { width: 1440, height: 900 },
  locale: 'ru-RU',
  args: [`--disable-extensions-except=${extDir}`, `--load-extension=${extDir}`],
})

try {
  const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent('serviceworker', { timeout: 15_000 }))
  const extId = new URL(sw.url()).host
  check('расширение загрузилось', !!extId, extId)

  // ---------- страница расширения: добавление ключей ----------

  const opt = await ctx.newPage()
  await opt.goto(`chrome-extension://${extId}/options.html`)
  await opt.waitForSelector('form.form')

  async function addKey(exchange, apiKey, label) {
    await opt.click(`.seg-btn:has-text("${exchange}")`)
    await opt.fill('.row:has-text("Название") input', label)
    await opt.fill('.row:has-text("API Key") input', apiKey)
    await opt.fill('.row:has-text("API Secret") input', 'mock-secret')
    await opt.click('button.submit')
    await opt.waitForFunction(() => !document.querySelector('button.submit')?.disabled)
  }

  await addKey('Binance', 'mock-binance-trade', 'Торговый')
  const rejected = await opt.textContent('.err').catch(() => '')
  check('ключ с правом торговли отклонён', /кроме чтения/.test(rejected ?? '') && /торговля фьючерсами/.test(rejected ?? ''), (rejected ?? '').slice(0, 90))
  check('отклонённый ключ не сохранён', (await opt.locator('.acct').count()) === 0)
  if (shots) await opt.screenshot({ path: join(shots, 'bridge-rejected.png') })

  await addKey('Binance', 'mock-binance-read', 'Binance основной')
  await addKey('Bybit', 'mock-bybit-read', 'Bybit')
  check('два ключа только для чтения добавлены', (await opt.locator('.acct').count()) === 2)
  check('поля ключа очищены после добавления', (await opt.inputValue('.row:has-text("API Secret") input')) === '')
  check('у ключа Bybit показан срок действия', (await opt.locator('.acct .exp').count()) === 1)
  // журнал ещё ни разу не открывали — историю грузит сама фоновая часть расширения
  const loaded = await opt
    .waitForFunction(() => [...document.querySelectorAll('.acct .st')].length === 2 && [...document.querySelectorAll('.acct .st')].every((el) => /обновлено/.test(el.textContent ?? '')), null, { timeout: 120_000 })
    .then(() => true, () => false)
  check('мост сам загрузил историю обоих счетов, журнал не открыт', loaded, (await opt.locator('.acct .st').allTextContents()).join(' | '))
  if (shots) await opt.screenshot({ path: join(shots, 'bridge-accounts.png'), fullPage: true })

  // секрет в хранилище расширения — только не извлекаемый ключ подписи
  const stored = await opt.evaluate(
    () =>
      new Promise((resolve) => {
        const req = indexedDB.open('tvx-bridge')
        req.onsuccess = () => {
          const all = req.result.transaction('accounts').objectStore('accounts').getAll()
          all.onsuccess = () => resolve(all.result.map((a) => ({ fields: Object.keys(a).sort(), type: String(a.key), extractable: a.key.extractable, text: JSON.stringify(a) })))
        }
      }),
  )
  check('секрет хранится как не извлекаемый CryptoKey', stored.length === 2 && stored.every((a) => a.extractable === false && /CryptoKey/.test(a.type)))
  check('строки секрета в хранилище нет', stored.every((a) => !a.text.includes('mock-secret')))

  // ---------- журнал ----------

  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  // недоступный ретранслятор — не ошибка журнала: он работает с теми, что на связи
  page.on('console', (m) => m.type() === 'error' && !/WebSocket connection/.test(m.text()) && errors.push(m.text()))
  const opened = Date.now()
  await page.goto(SITE)
  await page.waitForSelector('.hero-num', { timeout: 30_000 })
  await page.click('.periods .sg:last-child') // «Всё время»
  // сделки уже собраны мостом — журналу остаётся их забрать
  await page.waitForFunction(() => /^\s*[1-9]\d{2,}/.test(document.querySelector('.hero-sub')?.textContent ?? ''), null, { timeout: 30_000 }).catch(() => {})
  const shownIn = Date.now() - opened
  const hero = (await page.textContent('.hero-num')) ?? ''
  const sub = (await page.textContent('.hero-sub')) ?? ''
  const count = Number((/^\s*(\d+)/.exec(sub) ?? [])[1])
  check('журнал получил от моста готовые сделки', count > 150, `${hero.trim()} · ${sub.trim().slice(0, 40)} · через ${shownIn} мс после открытия`)
  check('оба счёта показаны в отборе', (await page.locator('.achip').count()) === 2)
  if (shots) await page.screenshot({ path: join(shots, 'journal-live.png') })

  // сайт не может вытащить ключи: мост отвечает только на запросы из протокола
  const probe = await page.evaluate(async () => {
    const ask = (req) =>
      new Promise((resolve) => {
        const id = Math.floor(Math.random() * 1e9)
        const on = (e) => {
          if (e.data?.from === 'tvx-bridge' && e.data.id === id) {
            removeEventListener('message', on)
            resolve(e.data.res)
          }
        }
        addEventListener('message', on)
        postMessage({ to: 'tvx-bridge', id, req }, location.origin)
        setTimeout(() => resolve({ timeout: true }), 4000)
      })
    return { hello: await ask({ op: 'hello' }), secrets: await ask({ op: 'secrets' }), order: await ask({ op: 'order', account: 'x', symbol: 'BTCUSDT' }), own: await ask({ own: 'removed', account: 'x' }) }
  })
  const helloText = JSON.stringify(probe.hello)
  check('в ответе моста нет ни ключа, ни секрета', probe.hello.ok && !helloText.includes('mock-binance-read') && !helloText.includes('mock-secret') && !/apiKey|"key"/.test(helloText))
  check('неизвестные запросы мост отклоняет', probe.secrets.ok === false && probe.order.ok === false, `${probe.secrets.error}, ${probe.order.error}`)
  check('служебные запросы страницы расширения сайту недоступны', probe.own.ok === false, String(probe.own.error))

  // со страницы другого сайта моста нет вовсе
  const other = await ctx.newPage()
  await other.goto(`http://127.0.0.1:${MOCK_PORT}/bybit/v5/market/time`).catch(() => {})
  await other.goto('data:text/html,<title>other</title>')
  const foreign = await other.evaluate(
    () =>
      new Promise((resolve) => {
        addEventListener('message', (e) => e.data?.from === 'tvx-bridge' && resolve('answered'))
        postMessage({ to: 'tvx-bridge', id: 1, req: { op: 'hello' } }, '*')
        setTimeout(() => resolve('silent'), 1500)
      }),
  )
  check('на постороннем сайте мост не отвечает', foreign === 'silent')
  await other.close()

  // сделка открывается в карточке, пометка сохраняется
  await page.click('.tabs .tab:nth-child(2)')
  await page.waitForSelector('.tbl tbody tr')
  await page.click('.tbl tbody tr:nth-child(4)')
  await page.fill('.tag-in', 'пробой')
  await page.keyboard.press('Enter')
  await page.fill('.dr .note', 'вход по уровню')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  check('метка появилась в списке сделок', (await page.locator('.tbl .tg', { hasText: '#пробой' }).count()) === 1)
  const link = await page.evaluate(() => {
    document.querySelector('.tbl tbody tr:nth-child(4)').click()
    return new Promise((r) => setTimeout(() => r(document.querySelector('.dr-chart')?.href ?? ''), 200))
  })
  check('ссылка на график tvx ведёт в терминал', link.startsWith(`http://localhost:${SITE_PORT}/trading-platform/?q=`) && /futures/.test(decodeURIComponent(link)), decodeURIComponent(link))
  await page.keyboard.press('Escape')

  // после перезагрузки всё на месте и повторно с биржи не тянется
  await page.goto('about:blank')
  await page.goto(SITE)
  await page.waitForSelector('.hero-num')
  await page.waitForTimeout(1500)
  const sub2 = (await page.textContent('.hero-sub')) ?? ''
  check('после перезагрузки сделки на месте', Number((/^\s*(\d+)/.exec(sub2) ?? [])[1]) === count, sub2.trim().slice(0, 30))

  // ---------- второе устройство: сделки приходят через синхронизацию ----------

  if (withSync) {
    await page.click('button[aria-label="Синхронизация устройств"]')
    await page.click('text=Включить синхронизацию')
    await page.waitForSelector('.qr svg', { timeout: 15_000 })
    const syncUrl = await page.inputValue('.modal input[readonly]')
    check('ссылка подключения создана', /#sync=[A-Za-z0-9_-]{43}$/.test(syncUrl))
    if (shots) await page.screenshot({ path: join(shots, 'sync-dialog.png') })
    // даём первому устройству выгрузить документы
    await page.waitForFunction(() => /на связи [1-9]/.test(document.querySelector('.modal')?.textContent ?? ''), null, { timeout: 30_000 }).catch(() => {})
    await page.waitForTimeout(12_000)

    const browser2 = await chromium.launch()
    const phone = await browser2.newContext({ ...devices['iPhone 13'], locale: 'ru-RU' })
    const p2 = await phone.newPage()
    await p2.goto(syncUrl)
    await p2.click('text=Подключить это устройство')
    await p2.keyboard.press('Escape')
    let got = 0
    for (let i = 0; i < 40 && got < count; i++) {
      await p2.waitForTimeout(1500)
      await p2.click('.periods .sg:last-child').catch(() => {})
      const text = (await p2.textContent('.hero-sub').catch(() => '')) ?? ''
      got = Number((/^\s*(\d+)/.exec(text) ?? [])[1]) || 0
    }
    check('телефон без расширения получил сделки через синхронизацию', got === count, `${got} из ${count}`)
    await p2.click('.btab:nth-child(2)')
    await p2.waitForTimeout(500)
    check('пометка тоже дошла до телефона', (await p2.locator('.tbl .tg', { hasText: '#пробой' }).count()) === 1)
    await p2.click('.btab:nth-child(4)')
    const acctText = (await p2.textContent('.acct-list').catch(() => '')) ?? ''
    check('на телефоне счета помечены как «ключ на другом устройстве»', /ключ на другом устройстве/.test(acctText))
    await p2.click('.btab:nth-child(1)')
    if (shots) {
      await p2.waitForTimeout(400)
      await p2.screenshot({ path: join(shots, 'phone-synced.png') })
    }

    // На «компьютере» закрываем и журнал, и страницу расширения: остаётся только его фоновая часть.
    // На бирже появляется новая сделка — телефон должен её увидеть.
    await page.close()
    await opt.close()
    await fetch(`http://localhost:${MOCK_PORT}/control/trade?account=demo-bybit`)
    let fresh = got
    for (let i = 0; i < 50 && fresh <= count; i++) {
      await p2.waitForTimeout(1500)
      const text = (await p2.textContent('.hero-sub').catch(() => '')) ?? ''
      fresh = Number((/^\s*(\d+)/.exec(text) ?? [])[1]) || 0
    }
    check('свежая сделка дошла до телефона при закрытом журнале на компьютере', fresh === count + 1, `${fresh} из ${count + 1}`)
    await browser2.close()
  }

  check('ошибок в консоли журнала нет', errors.length === 0, errors.slice(0, 3).join(' | '))
} finally {
  await ctx.close()
  mockServer.close()
  site.close()
  rmSync(profile, { recursive: true, force: true })
}

console.log(failed ? `\nне прошло проверок: ${failed}` : '\nвсе проверки пройдены')
process.exit(failed ? 1 : 0)
