// Запись обучающего видео: приложение открывается в браузере, сценарий (scenes.mjs) ведёт курсор
// и клавиатуру, кадры пишутся через screencast, а субтитры и главы — по тем же отметкам времени.
//
//   node scripts/tutorial/record.mjs                 — оба языка, файлы в public/help
//   node scripts/tutorial/record.mjs --lang en       — один язык
//   node scripts/tutorial/record.mjs --until 3 --fast --shots   — черновой прогон первых глав со снимками
//
// Озвучка: если есть scripts/tutorial/audio/<lang>/<номер реплики>.mp3 (или .wav), длительность реплики
// берётся по файлу, и звук ложится в видео. Номера реплик печатаются в scripts/tutorial/out/<lang>/lines.txt.

import { mkdirSync, rmSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { execFileSync, spawnSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { createServer } from 'vite'
import { routeMarket, fakeStreams } from './market.mjs'
import { overlay } from './overlay.mjs'
import { desktop, phone } from './scenes.mjs'

// Playwright — не зависимость проекта: берётся установленный в системе (или в node_modules, если есть)
const { chromium, devices } = createRequire(import.meta.url)('playwright')

// Запросы к бирже идут из Node: в среде с прокси он должен его использовать — перезапускаемся с NODE_USE_ENV_PROXY
if ((process.env.HTTPS_PROXY || process.env.https_proxy) && !process.env.NODE_USE_ENV_PROXY) {
  const r = spawnSync(process.execPath, ['--no-warnings', ...process.argv.slice(1)], { stdio: 'inherit', env: { ...process.env, NODE_USE_ENV_PROXY: '1' } })
  process.exit(r.status ?? 1)
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..')
const HERE = join(ROOT, 'scripts/tutorial')
const W = 1600
const H = 900

const argv = process.argv.slice(2)
const arg = (name, def) => {
  const i = argv.indexOf('--' + name)
  return i < 0 ? def : (argv[i + 1] ?? true)
}
const LANGS = arg('lang') ? [arg('lang')] : ['ru', 'en']
const UNTIL = arg('until') ? +arg('until') : Infinity
const FAST = argv.includes('--fast')
const SHOTS = argv.includes('--shots')
const NO_PHONE = argv.includes('--no-phone')
const OUT = {
  ru: { video: 'tvx-obzor.mp4', vtt: 'tvx-obzor.vtt', chapters: 'chapters.json' },
  en: { video: 'tvx-overview.mp4', vtt: 'tvx-overview.vtt', chapters: 'chapters.en.json' },
}

const sleep = (ms) => new Promise((r) => setTimeout(r, FAST ? ms / 4 : ms))
const now = () => Date.now() / 1000

function duration(file) {
  const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString()
  return parseFloat(out)
}

/** Перевод строки интерфейса: русская строка — ключ, как в приложении */
async function loadDict(server) {
  const dict = {}
  for (const f of readdirSync(join(ROOT, 'src/i18n/en'))) {
    const m = await server.ssrLoadModule('/src/i18n/en/' + f)
    Object.assign(dict, m.default)
  }
  return dict
}

/** Пишет кадры страницы; frames — [{file, t}] с временем получения кадра */
async function screencast(page, dir) {
  mkdirSync(dir, { recursive: true })
  const cdp = await page.context().newCDPSession(page)
  const frames = []
  let n = 0
  cdp.on('Page.screencastFrame', async ({ data, sessionId }) => {
    const file = join(dir, `f${String(++n).padStart(6, '0')}.jpg`)
    writeFileSync(file, Buffer.from(data, 'base64'))
    frames.push({ file, t: now() })
    cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {})
  })
  const vp = page.viewportSize()
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 90, maxWidth: vp.width, maxHeight: vp.height, everyNthFrame: 1 })
  return {
    frames,
    stop: async () => {
      await cdp.send('Page.stopScreencast').catch(() => {})
    },
  }
}

/** Склеивает кадры в ролик W×H; кадр держится до следующего */
function encode(frames, from, to, file, bg) {
  const list = file + '.txt'
  const use = frames.filter((f) => f.t <= to)
  let lines = ''
  use.forEach((f, i) => {
    const start = Math.max(from, f.t)
    const end = i + 1 < use.length ? Math.max(from, use[i + 1].t) : to
    if (end - start <= 0.0005 && i + 1 < use.length) return
    lines += `file '${f.file}'\nduration ${Math.max(0.001, end - start).toFixed(4)}\n`
  })
  lines += `file '${use[use.length - 1].file}'\n`
  writeFileSync(list, lines)
  execFileSync('ffmpeg', [
    '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list,
    '-vf', `scale=${W}:${H}:force_original_aspect_ratio=decrease:flags=lanczos,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=${bg},fps=25,format=yuv420p`,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '27', '-tune', 'animation', '-g', '250', '-movflags', '+faststart', file,
  ])
}

const vttTime = (s) => {
  const ms = Math.max(0, Math.round(s * 1000))
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  const sec = Math.floor((ms % 60000) / 1000)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`
}

/** Длинная реплика — по предложениям: каждое на экране пропорционально своей длине */
function cuesOf(text, start, end) {
  const parts = text.split(/(?<=[.!?…])\s+(?=[A-ZА-ЯЁ«"0-9])/).filter(Boolean)
  const total = parts.reduce((a, p) => a + p.length, 0)
  const out = []
  let t = start
  for (const p of parts) {
    const d = ((end - start) * p.length) / total
    out.push({ start: t, end: t + d - 0.05, text: p })
    t += d
  }
  return out
}

/** Режиссёр: то, чем сценарий управляет страницей */
function director(page, lang, dict, log) {
  const pos = { x: W / 2, y: H / 2 }
  const d = {
    page,
    lang,
    fast: FAST,
    /** строка интерфейса на языке записи */
    T: (ru) => (lang === 'en' ? (dict[ru] ?? ru) : ru),
    L: (o) => o[lang],
    sleep,
    /** часть обзора: заставка и запись в оглавление */
    async chapter(n, title) {
      if (log.stopped) return
      if (n > UNTIL) {
        log.stopped = true
        throw new StopRecording()
      }
      const name = title[lang]
      const label = n ? `${n}. ${name}` : name
      const t = now()
      log.chapters.push({ t, title: label })
      if (n) {
        await page.evaluate(([s, b]) => window.__tutCard(s, b), [lang === 'ru' ? `Часть ${n}` : `Part ${n}`, name])
        log.lines.push({ start: t, end: t + 2.4, text: lang === 'ru' ? `Часть ${n}. ${name}.` : `Part ${n}. ${name}.` })
        await sleep(2600)
        await page.evaluate(() => window.__tutCard('', null))
        await sleep(500)
      }
    },
    /** реплика: субтитры (и звук) идут, пока выполняются действия; не короче, чем нужно прочитать */
    async say(text, act) {
      const s = text[lang]
      const id = ++log.n
      const audio = ['mp3', 'wav'].map((e) => join(HERE, 'audio', lang, `${id}.${e}`)).find(existsSync)
      const need = audio ? duration(audio) + 0.35 : Math.max(2.5, s.length / (lang === 'ru' ? 13.5 : 15) + 0.9)
      const start = now()
      log.script.push(`${id}\t${s}`)
      if (act) await act()
      const left = need - (now() - start)
      if (left > 0) await new Promise((r) => setTimeout(r, FAST ? left * 250 : left * 1000))
      const end = now()
      log.lines.push(...cuesOf(s, start, end - 0.15))
      if (audio) log.audio.push({ file: audio, t: start })
      if (SHOTS) await page.screenshot({ path: join(log.dir, `shot-${String(id).padStart(3, '0')}.png`) })
      await sleep(250)
    },
    /** плавное движение курсора */
    async move(x, y, ms = 450) {
      const dist = Math.hypot(x - pos.x, y - pos.y)
      const steps = Math.max(2, Math.round(Math.min(ms, 250 + dist * 0.6) / 16))
      for (let i = 1; i <= steps; i++) {
        const k = i / steps
        const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2
        await page.mouse.move(pos.x + (x - pos.x) * e, pos.y + (y - pos.y) * e)
        await new Promise((r) => setTimeout(r, FAST ? 2 : 14))
      }
      pos.x = x
      pos.y = y
    },
    /** середина элемента (или точка в долях его размера) */
    async at(loc, fx = 0.5, fy = 0.5) {
      if (typeof loc === 'object' && 'x' in loc) return loc
      const l = typeof loc === 'string' ? page.locator(loc).first() : loc
      await l.waitFor({ state: 'visible', timeout: 8000 })
      const b = await l.boundingBox()
      return { x: b.x + b.width * fx, y: b.y + b.height * fy }
    },
    async hover(loc, fx, fy) {
      const p = await d.at(loc, fx, fy)
      await d.move(p.x, p.y)
      return p
    },
    async click(loc, fx, fy, opts = {}) {
      const p = await d.at(loc, fx, fy)
      await d.move(p.x, p.y)
      await sleep(120)
      // клавиши-модификаторы зажимаются на время щелчка (mouse.click их не принимает)
      const mods = opts.modifiers ?? []
      for (const m of mods) await page.keyboard.down(m)
      await page.mouse.click(p.x, p.y, { button: opts.button, clickCount: opts.clickCount })
      for (const m of mods) await page.keyboard.up(m)
      await sleep(350)
      return p
    },
    async dblclick(loc, fx, fy) {
      const p = await d.at(loc, fx, fy)
      await d.move(p.x, p.y)
      await page.mouse.dblclick(p.x, p.y)
      await sleep(350)
    },
    async drag(from, to, ms = 700) {
      await d.move(from.x, from.y)
      await page.mouse.down()
      await d.move(to.x, to.y, ms)
      await page.mouse.up()
      await sleep(300)
    },
    /** сочетание клавиш с подсказкой на экране: 'Alt+H' */
    async keys(combo, label) {
      const shown = (label ?? combo).split('+').map((k) => ({ Control: 'Ctrl', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Space: lang === 'ru' ? 'Пробел' : 'Space', Slash: '/' })[k] ?? k)
      await page.evaluate((k) => window.__tutKeys(k), shown)
      await sleep(250)
      await page.keyboard.press(combo)
      await sleep(400)
    },
    async type(text, delay = 90) {
      await page.keyboard.type(text, { delay: FAST ? 10 : delay })
    },
    async wheel(dy, times = 1) {
      for (let i = 0; i < times; i++) {
        await page.mouse.wheel(0, dy)
        await sleep(110)
      }
    },
    /** ответы на следующие окна prompt/confirm: строка — ввести и принять, true — принять, false — отменить */
    dialogs(answers) {
      const q = [...answers]
      const h = (dlg) => {
        const a = q.shift()
        if (!q.length) page.off('dialog', h)
        if (a === false) dlg.dismiss().catch(() => {})
        else dlg.accept(typeof a === 'string' ? a : undefined).catch(() => {})
      }
      page.on('dialog', h)
    },
    /** текст в системный буфер — как будто его скопировали из заметок */
    async clip(text) {
      await page.evaluate((s) => navigator.clipboard.writeText(s), text)
    },
    pos,
  }
  return d
}

class StopRecording extends Error {}

async function recordLang(lang, server, dict, url) {
  const work = join(HERE, 'out', lang)
  rmSync(work, { recursive: true, force: true })
  mkdirSync(work, { recursive: true })
  const log = { dir: work, lines: [], chapters: [], script: [], audio: [], n: 0, stopped: false }
  const browser = await chromium.launch()
  const tz = lang === 'ru' ? 'Europe/Moscow' : 'Europe/London'
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, locale: lang === 'ru' ? 'ru-RU' : 'en-US', timezoneId: tz })
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(url).origin })
  await routeMarket(ctx)
  await ctx.addInitScript(fakeStreams)
  await ctx.addInitScript(overlay)
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.log(`[${lang}] pageerror:`, e.message))
  await page.goto(url)
  await page.waitForTimeout(1500)
  const cast = await screencast(page, join(work, 'frames'))
  const t0 = now()
  const d = director(page, lang, dict, log)
  try {
    await desktop(d)
  } catch (e) {
    if (!(e instanceof StopRecording)) {
      await page.screenshot({ path: join(work, 'error.png') })
      throw e
    }
  }
  const t1 = now()
  await cast.stop()
  // телефон «подключён» к той же синхронизации: на нём те же списки, уровни и настройки
  const storage = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)))
  // на маленьком экране таблица ATR закрывает график — на телефоне она выключена
  try {
    const appState = JSON.parse(storage['tvx:app'])
    appState.atrTable = false
    storage['tvx:app'] = JSON.stringify(appState)
  } catch {}
  await ctx.close()

  // телефон — отдельная запись в том же ролике
  let phoneSeg = null
  if (!log.stopped && !NO_PHONE) {
    const pctx = await browser.newContext({ ...devices['iPhone 13'], locale: lang === 'ru' ? 'ru-RU' : 'en-US', timezoneId: tz })
    await pctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(url).origin })
    await routeMarket(pctx)
    await pctx.addInitScript(fakeStreams)
    await pctx.addInitScript(() => (window.__tutTouch = true))
    await pctx.addInitScript((st) => {
      if (sessionStorage.getItem('tut-seeded')) return
      for (const [k, v] of Object.entries(st)) localStorage.setItem(k, v)
      sessionStorage.setItem('tut-seeded', '1')
    }, storage)
    await pctx.addInitScript(overlay)
    const ppage = await pctx.newPage()
    await ppage.goto(url)
    await ppage.waitForTimeout(1200)
    const pcast = await screencast(ppage, join(work, 'pframes'))
    const p0 = now()
    const pd = director(ppage, lang, dict, log)
    await phone(pd)
    const p1 = now()
    await pcast.stop()
    await pctx.close()
    phoneSeg = { frames: pcast.frames, from: p0, to: p1 }
  }
  await browser.close()

  // ролик: компьютер, затем телефон
  const segs = [join(work, 'seg-desktop.mp4')]
  encode(cast.frames, t0, t1, segs[0], '#0e1117')
  const shift = (t) => (phoneSeg && t >= phoneSeg.from ? t - phoneSeg.from + (t1 - t0) : t - t0)
  if (phoneSeg) {
    segs.push(join(work, 'seg-phone.mp4'))
    encode(phoneSeg.frames, phoneSeg.from, phoneSeg.to, segs[1], '#1b2130')
  }
  const silent = join(work, 'video.mp4')
  if (segs.length > 1) {
    writeFileSync(join(work, 'segs.txt'), segs.map((s) => `file '${s}'`).join('\n'))
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', join(work, 'segs.txt'), '-c', 'copy', '-movflags', '+faststart', silent])
  } else execFileSync('cp', [segs[0], silent])

  const dest = join(ROOT, 'public/help')
  const out = OUT[lang]
  // черновой прогон (--until, --fast) никогда не пишет в public/help
  const draft = log.stopped || UNTIL !== Infinity || FAST
  const final = draft ? join(work, out.video) : join(dest, out.video)
  if (log.audio.length) {
    // озвучка: каждая реплика — со своей отметки времени
    const inputs = log.audio.flatMap((a) => ['-i', a.file])
    const filters = log.audio.map((a, i) => `[${i + 1}:a]adelay=${Math.round(shift(a.t) * 1000)}:all=1[a${i}]`).join(';')
    const mix = `${filters};${log.audio.map((_, i) => `[a${i}]`).join('')}amix=inputs=${log.audio.length}:normalize=0[aout]`
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', silent, ...inputs, '-filter_complex', mix, '-map', '0:v', '-map', '[aout]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '80k', '-movflags', '+faststart', final])
  } else execFileSync('cp', [silent, final])

  const vtt = 'WEBVTT\n\n' + log.lines.map((c) => `${vttTime(shift(c.start))} --> ${vttTime(shift(c.end))}\n${c.text}\n`).join('\n')
  const chapters = log.chapters.map((c) => ({ t: +shift(c.t).toFixed(1), title: c.title }))
  const where = draft ? work : dest
  writeFileSync(join(where, out.vtt), vtt)
  writeFileSync(join(where, out.chapters), JSON.stringify(chapters, null, 1) + '\n')
  writeFileSync(join(work, 'lines.txt'), log.script.join('\n') + '\n')
  console.log(`[${lang}] ${final} · ${duration(final).toFixed(0)} s · глав ${chapters.length}`)
}

const server = await createServer({ root: ROOT, server: { port: 5199, strictPort: true }, logLevel: 'error' })
await server.listen()
try {
  const dict = await loadDict(server)
  for (const lang of LANGS) await recordLang(lang, server, dict, 'http://localhost:5199/')
} finally {
  await server.close()
}
