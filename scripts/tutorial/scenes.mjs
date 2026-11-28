// Сценарий обучающего видео: главы и реплики на двух языках, действия — через режиссёра d (record.mjs).
// Строки интерфейса берутся через d.T('русская строка') — на английской записи это перевод из словаря.

const ru = (ru, en) => ({ ru, en })

const title = (d, ru) => `[title="${d.T(ru)}"]`

/** Окно графика с номером i (0 — первое) */
const pane = (i) => `:nth-match(.pane, ${i + 1})`

/** Область цены окна: точка в долях её ширины и высоты */
async function inChart(d, i, fx, fy) {
  const host = d.page.locator('.chart-host').nth(i)
  const b = await host.boundingBox()
  // справа — ценовая шкала (~70 px), внизу — шкала времени (~28 px)
  return { x: b.x + (b.width - 72) * fx, y: b.y + (b.height - 30) * fy }
}

/** Закрыть окно (Escape) или выпадающее меню (оно закрывается нажатием мимо — без видимого щелчка) */
/**
 * Точка на цене в окне i (как в первой версии обзора — по данным графика, а не долями экрана):
 * fx — доля ширины области цены; kind — 'close' (закрытие бара под x), 'high' / 'low' (максимум / минимум видимой части).
 */
async function onPrice(d, i, fx, kind) {
  const host = await d.page.locator('.chart-host').nth(i).boundingBox()
  const x = host.x + (host.width - 72) * fx
  const y = await d.page.evaluate(
    async ([i, lx, kind]) => {
      const c = (await import('/src/chart/registry.ts')).chartAt(i)
      const ts = c.chart.timeScale()
      const bars = c.bars
      const idx = Math.max(0, Math.min(bars.length - 1, Math.round(ts.coordinateToLogical(lx) ?? 0)))
      let v = bars[idx].close
      if (kind === 'high' || kind === 'low') {
        const r = ts.getVisibleLogicalRange()
        const part = bars.slice(Math.max(0, Math.floor(r.from)), Math.min(bars.length, Math.ceil(r.to)))
        v = kind === 'high' ? Math.max(...part.map((b) => b.high)) : Math.min(...part.map((b) => b.low))
      }
      return c.yOf(v)
    },
    [i, x - host.x, kind],
  )
  return { x, y: host.y + Math.max(20, Math.min(host.height - 40, y ?? host.height / 2)) }
}

async function esc(d) {
  await d.page.keyboard.press('Escape')
  await d.page.evaluate(() => document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })))
  await d.sleep(300)
}

// ---------------------------------------------------------------------------------------------

export async function desktop(d) {
  const { page, T } = d

  await d.chapter(0, ru('Вступление', 'Introduction'))
  await d.say(
    ru(
      'Это обзор терминала tvx — бесплатной платформы для графиков бирж Binance и Bybit. Пойдём от простого к сложному: первый запуск и график, окна, отбор и списки, рисование и позиции, а в конце — быстрые приёмы, синхронизация и телефон.',
      'This is an overview of tvx, a free charting terminal for Binance and Bybit. We will go from simple to advanced: the first launch and the chart, windows, the screener and watchlists, drawing and positions, and finally quick tricks, sync and the phone.',
    ),
    async () => {
      await d.hover('.ob-hero')
    },
  )

  // ---------- 1 ----------
  await d.chapter(1, ru('Первый запуск', 'First launch'))
  await d.say(
    ru(
      'При первом запуске терминал предлагает пару настроек. Язык интерфейса — русский или английский.',
      'On the first launch the terminal asks for a couple of settings. The interface language is English or Russian.',
    ),
    async () => {
      // языки: English, Русский — показываем оба и выбираем язык записи
      const mine = d.lang === 'ru' ? 1 : 0
      await d.click(`.ob-row >> nth=0 >> button >> nth=${1 - mine}`)
      await d.sleep(600)
      await d.click(`.ob-row >> nth=0 >> button >> nth=${mine}`)
    },
  )
  await d.say(
    ru(
      'Тема — светлая, тёмная или как в системе. Часовой пояс для внутридневных графиков и биржа с рынком, на которых открываются монеты.',
      'The theme is light, dark or the system one. Then the time zone for intraday charts, and the exchange and market where coins open.',
    ),
    async () => {
      await d.click('.ob-row >> nth=1 >> button >> nth=1')
      await d.sleep(500)
      await d.click('.ob-row >> nth=1 >> button >> nth=0')
      await d.hover('.ob-row >> nth=2 >> select')
      await d.sleep(500)
      await d.hover('.ob-row >> nth=3 >> .seg >> nth=0')
      await d.click('.ob-row >> nth=3 >> .seg >> nth=1 >> button >> nth=0')
      await d.click('.ob-row >> nth=3 >> .seg >> nth=0 >> button >> nth=0')
    },
  )
  await d.say(ru('Всё это потом меняется в настройках. Нажимаем «Начать».', 'All of this can be changed later in the settings. Press “Start”.'), async () => {
    await d.click('.ob-start')
    await d.sleep(1500)
  })
  await d.say(
    ru(
      'Перед нами три окна одной монеты: сверху — пять минут, внизу слева — день, справа — час. Справа — панель с отбором, списками, чеклистом и оповещениями.',
      'Here are three windows of one coin: five minutes at the top, the daily chart bottom left and the hourly one on the right. On the right is the panel with the screener, watchlists, checklist and alerts.',
    ),
    async () => {
      await d.hover(await inChart(d, 0, 0.5, 0.45))
      await d.hover(await inChart(d, 1, 0.5, 0.5))
      await d.hover(await inChart(d, 2, 0.5, 0.5))
      await d.hover('.side-tabs')
    },
  )
  await d.say(
    ru(
      'Чтобы сменить монету, просто начните печатать её название — откроется поиск. Enter — и монета меняется во всех окнах сразу.',
      'To change the coin, just start typing its name and the search opens. Press Enter, and the coin changes in all windows at once.',
    ),
    async () => {
      await d.hover(await inChart(d, 0, 0.55, 0.4))
      await d.sleep(300)
      await d.type('SOL', 220)
      await d.sleep(1300)
      await d.keys('Enter')
      await d.sleep(1200)
    },
  )
  await d.say(
    ru(
      'Интервал активного окна переключается кнопками наверху. В выпадающем меню — все интервалы, а звёздочка выносит нужный на панель.',
      'The interval of the active window is switched with the buttons at the top. The drop-down has all intervals, and the star puts one on the toolbar.',
    ),
    async () => {
      await d.click('.topbar .btn.tf >> nth=2')
      await d.sleep(900)
      await d.click('.topbar .btn.tf >> nth=1')
      await d.click('.topbar .dropdown >> nth=0 >> button >> nth=0')
      await d.sleep(1600)
      await esc(d)
    },
  )
  await d.say(
    ru(
      'Интервал можно набрать с клавиатуры: цифры — минуты. Вводим 15 и Enter, а 5 возвращает пятиминутки.',
      'You can also type the interval: digits mean minutes. Type 15 and Enter, and 5 brings back five minutes.',
    ),
    async () => {
      await d.type('15', 250)
      await d.sleep(700)
      await d.keys('Enter')
      await d.sleep(1500)
      await d.type('5', 250)
      await d.sleep(600)
      await d.keys('Enter')
    },
  )

  // ---------- 2 ----------
  await d.chapter(2, ru('График и его вид', 'The chart and its look'))
  await d.say(
    ru(
      'График двигается мышью во все стороны, а колесо меняет масштаб по времени.',
      'Drag the chart with the mouse in any direction, and the wheel zooms the time scale.',
    ),
    async () => {
      const a = await inChart(d, 0, 0.6, 0.5)
      await d.drag(a, { x: a.x - 260, y: a.y + 10 }, 900)
      await d.drag({ x: a.x - 260, y: a.y }, a, 700)
      await d.drag(a, { x: a.x, y: a.y + 80 }, 700)
      await d.wheel(-120, 4)
      await d.sleep(400)
      await d.wheel(120, 4)
    },
  )
  await d.say(
    ru(
      'Колесо над ценовой шкалой растягивает график по вертикали, кнопка «авто» возвращает обычный масштаб. Другая монета открывается в том же масштабе и на том же месте.',
      'The wheel over the price scale stretches the chart vertically, and the “auto” button resets the scale. Another coin opens with the same zoom and position.',
    ),
    async () => {
      const host = await d.page.locator('.chart-host').first().boundingBox()
      await d.move(host.x + host.width - 30, host.y + host.height * 0.4)
      await d.wheel(120, 4)
      await d.sleep(500)
      await d.wheel(-120, 3)
      await d.click(`${pane(0)} .pane-tools .chip >> nth=0`)
    },
  )
  await d.say(
    ru(
      'Справа от последней цены — время до закрытия свечи, а цена подсвечена цветом бара. Сетка и шкала времени продолжаются в будущее.',
      'Next to the last price is the time until the candle closes, and the price is colored like the bar. The grid and time scale continue into the future.',
    ),
    async () => {
      const host = await d.page.locator('.chart-host').first().boundingBox()
      await d.move(host.x + host.width - 40, host.y + host.height * 0.45)
      await d.sleep(800)
      await d.hover(await inChart(d, 0, 0.97, 0.6))
    },
  )
  await d.say(
    ru(
      'В меню вида графика — бары, свечи, полые свечи, Хейкен Аши и линия, а ещё тонкие бары и линия текущей цены.',
      'The chart type menu has bars, candles, hollow candles, Heikin Ashi and line, plus thin bars and the current price line.',
    ),
    async () => {
      await d.click(title(d, 'Вид графика'))
      await d.sleep(600)
      await d.click('.dropdown-menu .menu-item >> nth=1')
      await d.sleep(1200)
      await d.click(title(d, 'Вид графика'))
      await d.hover('.dropdown-menu label.menu-item >> nth=0')
      await d.hover('.dropdown-menu label.menu-item >> nth=1')
      await d.sleep(600)
      await esc(d)
    },
  )
  await d.say(
    ru(
      'Часовой пояс меняется кнопкой в правом нижнем углу графика. Внутридневные графики показывают выбранное время, дневные — даты биржи.',
      'The time zone is changed with the button in the bottom right corner of the chart. Intraday charts show the chosen time, daily ones show exchange dates.',
    ),
    async () => {
      await d.click(`${pane(0)} .tz-btn`)
      await d.sleep(1600)
      await esc(d)
    },
  )
  await d.say(
    ru(
      'Под шестерёнкой — тема, свои цвета и окно «Вид: шрифты, поля, размер позиции»: крупный шрифт шкал и легенды, таймер свечи, поля графика — как в TradingView — и депозит для расчёта объёма.',
      'The gear menu has the theme, custom colors and the “View: fonts, margins, position size” window: larger scale and legend fonts, the candle timer, chart margins like in TradingView, and the deposit used for position size.',
    ),
    async () => {
      await d.click(title(d, 'Настройки'))
      await d.sleep(700)
      await d.click(`.dropdown-menu .menu-item:has-text("${T('Вид: шрифты, поля, размер позиции…')}")`)
      await d.sleep(600)
      await d.page.locator('.vd select').first().selectOption('13')
      await d.sleep(900)
      await d.hover('.vd input.field.num >> nth=2')
      await d.sleep(500)
      await d.click('.vd input[inputmode="decimal"] >> nth=0')
      await d.type('1000')
      await d.page.keyboard.press('Tab')
      await d.sleep(700)
      await d.page.locator('.vd select').first().selectOption('11')
      await d.sleep(500)
      await d.click('.vd-actions .btn')
    },
  )
  await d.say(
    ru(
      'Alt+Enter разворачивает активное окно на весь экран и возвращает раскладку. Alt+G переносит все окна к нужной дате, а стрелка справа внизу — обратно к текущей цене.',
      'Alt+Enter maximizes the active window and restores the layout. Alt+G jumps all windows to a date, and the arrow at the bottom right brings you back to the current price.',
    ),
    async () => {
      await d.keys('Alt+Enter')
      await d.sleep(1200)
      await d.keys('Alt+Enter')
      await d.sleep(600)
      await d.keys('Alt+g', 'Alt+G')
      const day = new Date(Date.now() - 6 * 86400e3)
      const v = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}T12:00`
      await d.page.locator('.gt input').fill(v)
      await d.sleep(700)
      await d.click('.gt .btn.primary')
      await d.sleep(1800)
      await d.click(`${pane(0)} .rt-btn`)
    },
  )

  // ---------- 3 ----------
  await d.chapter(3, ru('Окна и шаблоны', 'Windows and templates'))
  await d.say(
    ru(
      'Раскладка выбирается здесь: до восьми графиков, готовые варианты или своя сетка. Ниже — синхронизация окон: инструмент, интервал, перекрестие и время.',
      'Pick the layout here: up to eight charts, presets or your own grid. Below is window sync: symbol, interval, crosshair and time.',
    ),
    async () => {
      await d.click(title(d, 'Раскладка и синхронизация окон'))
      await d.sleep(600)
      await d.hover('.dropdown-menu .layouts .btn >> nth=4')
      await d.hover('.dropdown-menu .custom')
      await d.hover('.dropdown-menu .sync')
      await d.sleep(800)
      await esc(d)
    },
  )
  await d.say(
    ru(
      'Перекрестие повторяется во всех окнах — удобно сверять одно место на разных интервалах. Границы окон и боковой панели перетаскиваются.',
      'The crosshair is mirrored in every window, which helps to compare one spot on different intervals. Window and side panel borders can be dragged.',
    ),
    async () => {
      await d.hover(await inChart(d, 2, 0.4, 0.5))
      const p = await inChart(d, 2, 0.7, 0.35)
      await d.move(p.x, p.y, 1200)
      const split = await d.at('.split.main')
      await d.drag(split, { x: split.x, y: split.y + 90 })
      await d.dblclick('.split.main')
      const side = await d.at('.side-split')
      await d.drag(side, { x: side.x - 60, y: side.y })
      await d.drag({ x: side.x - 60, y: side.y }, side)
    },
  )
  await d.say(
    ru(
      'Удачную настройку сохраните как шаблон: раскладка, интервалы, вид графиков и индикаторы. Шаблон со звёздочкой становится кнопкой на панели, его можно привязать к вкладке «Отбор» или «Список».',
      'Save a good setup as a template: layout, intervals, chart types and indicators. A starred template becomes a toolbar button, and it can be bound to the Screener or Watchlist tab.',
    ),
    async () => {
      await d.click(title(d, 'Шаблоны: раскладка и настройки всех окон'))
      await d.sleep(500)
      d.dialogs([d.L(ru('Скальпинг', 'Scalping')), false])
      await d.click(`.dropdown-menu .menu-item:has-text("${T('Сохранить как новый…')}")`)
      await d.sleep(900)
      await d.hover('.topbar .tpl-fav')
      await d.sleep(500)
    },
  )

  await chapters4to7(d)
  await chapters8to11(d)
  await chapters12to15(d)
}

/** Строка отбора или списка по тикеру */
const row = (kind, sym) => `.${kind}-row:has(b:text-is("${sym}"))`
const scRow = (n) => `:nth-match(.sc-list .sc-row, ${n + 1})`

async function chapters4to7(d) {
  const { page, T } = d

  // ---------- 4 ----------
  await d.chapter(4, ru('Отбор монет', 'Screener'))
  await d.say(
    ru(
      'Вкладка «Отбор» показывает монеты биржи по вашим условиям: биржа, рынок, оборот за сутки, изменение цены и сортировка. Здесь же можно показать только криптовалюты, только акции и TradFi — или всё вместе.',
      'The Screener tab lists the exchange coins that match your conditions: exchange, market, daily turnover, price change and sorting. You can also show only crypto, only stocks and TradFi, or everything.',
    ),
    async () => {
      await d.click('.sc-top .filter')
      await d.sleep(600)
      await d.click('.sf .chips .chip >> nth=0')
      await d.hover('.sf select >> nth=2')
      await d.sleep(900)
      await d.click('.sf .btn.primary')
    },
  )
  await d.say(
    ru(
      'Столбцы настраиваются: цена, изменение, объём. Цена окрашена по изменению за сутки, сортировка — щелчком по заголовку.',
      'Columns are configurable: price, change, volume. The price is colored by the daily change, and clicking a header sorts.',
    ),
    async () => {
      await d.click('.sc-top .dropdown >> nth=0 >> button')
      await d.sleep(500)
      await d.click('.dropdown-menu label.check >> nth=2')
      await d.sleep(500)
      await esc(d)
      // заголовки: тикер, цена, изменение, объём
      await d.click('.sc-head button >> nth=2')
      await d.sleep(900)
      await d.click('.sc-head button >> nth=2')
      await d.sleep(600)
      await d.click('.sc-head button >> nth=3')
    },
  )
  await d.say(
    ru(
      'Щелчок по строке открывает монету. Пробел листает отбор вниз, Shift+Пробел — вверх, а стрелки — по одной монете.',
      'Clicking a row opens the coin. Space pages through the screener, Shift+Space goes back, and the arrow keys move one coin at a time.',
    ),
    async () => {
      await d.click(scRow(1))
      await d.sleep(800)
      await d.keys('Space')
      await d.sleep(800)
      await d.keys('ArrowDown')
      await d.sleep(800)
      await d.keys('Shift+Space')
      await d.sleep(500)
    },
  )
  await d.say(
    ru(
      'Слева от названия — направление. Щелчок помечает монету как лонг, второй — как шорт. Точка справа показывает, в каких списках монета, и добавляет её в любой.',
      'Left of the name is the direction mark: one click marks the coin long, a second one short. The dot on the right shows which lists the coin is in and adds it to any of them.',
    ),
    async () => {
      await d.click(`${scRow(1)} .side-mark`)
      await d.sleep(500)
      await d.click(`${scRow(2)} .side-mark`)
      await d.click(`${scRow(2)} .side-mark`)
      await d.click(`${scRow(1)} .picker`)
      await d.sleep(500)
      await d.click('.dropdown-menu .lp .menu-item >> nth=1')
      await d.sleep(500)
      await esc(d)
    },
  )
  await d.say(
    ru(
      'Можно взять сразу несколько монет: Ctrl+щелчок — по одной, Shift+щелчок — подряд. Правая кнопка — и все выбранные получают направление и уходят в нужный список.',
      'You can take several coins at once: Ctrl+click picks them one by one, Shift+click picks a range. Right-click, and all of them get a direction and go to the list you need.',
    ),
    async () => {
      await d.click(scRow(3), 0.3, 0.5, { modifiers: ['Control'] })
      await d.click(scRow(5), 0.3, 0.5, { modifiers: ['Shift'] })
      await d.sleep(400)
      await d.click(scRow(4), 0.3, 0.5, { button: 'right' })
      await d.sleep(500)
      await d.click('.sc-menu .lp-sides .btn >> nth=0')
      await d.click('.sc-menu .lp .menu-item >> nth=5')
      await d.sleep(500)
      await esc(d)
      await d.click(`.sc-sel .btn[title="${T('Снять выбор')}"]`)
    },
  )

  // ---------- 5 ----------
  await d.chapter(5, ru('Списки наблюдения', 'Watchlists'))
  await d.say(
    ru(
      'На вкладке «Список» все ваши списки идут одним потоком. У каждого — цветная метка, щелчок по названию сворачивает список. Цены и изменения обновляются вживую.',
      'On the Watchlist tab all your lists flow as sections. Each has a color tag, and clicking the name collapses it. Prices and changes update live.',
    ),
    async () => {
      await d.click('.side-tabs button >> nth=1')
      await d.sleep(800)
      await d.click('.list-head >> nth=2')
      await d.sleep(500)
      await d.click('.list-head >> nth=2')
      await d.hover('.wl-row .num >> nth=0')
    },
  )
  await d.say(
    ru(
      'Звёздочка отмечает текущий список: туда попадают монеты по Alt+W и при вставке. Монеты и целые списки перетаскиваются мышью, а на планшете — долгим нажатием.',
      'The star marks the current list: coins go there with Alt+W and on paste. Coins and whole lists are dragged with the mouse, or with a long press on a tablet.',
    ),
    async () => {
      await d.hover('.list-head .cur')
      // тянем за название (отметка направления слева — кнопка, за неё список не тянется)
      const from = await d.at('.wl-row >> nth=0 >> .sym', 0.7)
      const to = await d.at('.list-head >> nth=1', 0.4)
      await d.drag(from, { x: to.x, y: to.y + 6 }, 1100)
      await d.sleep(500)
    },
  )
  await d.say(
    ru(
      'Переключатель наверху — фильтр по направлению. Рядом: поделиться списком, вставка монет из буфера, столбцы и новый список.',
      'The switch at the top filters by direction. Next to it: share the list, paste coins from the clipboard, columns, and a new list.',
    ),
    async () => {
      await d.click('.wl-top .seg button >> nth=1')
      await d.sleep(900)
      await d.click('.wl-top .seg button >> nth=0')
      await d.hover('.wl-actions .btn >> nth=0')
      await d.hover('.wl-actions .btn >> nth=1')
      await d.hover('.wl-actions .dropdown')
      await d.click('.wl-actions .btn >> nth=-1')
      await d.sleep(300)
      await d.type(d.L(ru('Идеи на неделю', 'Weekly ideas')), 70)
      await d.click('.draft .swatch >> nth=3')
      await d.click('.draft .btn.primary')
    },
  )
  await d.say(
    ru(
      '«Поделиться списком» собирает по каждой отмеченной монете картинку со всеми окнами и строку «монета, направление, уровень» — удобно отправить в Telegram.',
      '“Share list” makes, for every checked coin, a picture with all windows and a line “coin, direction, level”, handy to send to Telegram.',
    ),
    async () => {
      await d.click('.wl-actions .btn >> nth=0')
      await d.sleep(1600)
      await d.hover('.ls-foot')
      await d.sleep(800)
      await esc(d)
    },
  )

  // ---------- 6 ----------
  await d.chapter(6, ru('Рисование', 'Drawing'))
  await d.click(scRowOrList(d))
  await d.say(
    ru(
      'Инструменты рисования — на панели слева. Горизонтальный уровень ставится одним щелчком, быстрее всего — сочетанием Alt+H. Цена уровня сразу видна на шкале.',
      'Drawing tools are on the left. A horizontal level takes one click, fastest with Alt+H. The level price shows right away on the scale.',
    ),
    async () => {
      await d.hover('.drawbar .btn >> nth=3')
      await d.sleep(500)
      await d.keys('Alt+h', 'Alt+H')
      // уровень — по максимуму видимой части графика
      await d.click(await onPrice(d, 0, 0.62, 'high'))
      await d.sleep(600)
    },
  )
  await d.say(
    ru(
      'Уровень привязан к монете, а не к окну, поэтому он виден на всех интервалах. Маркеры появляются при наведении, и рисунок можно тянуть сразу.',
      'The level belongs to the coin, not the window, so it shows on every interval. Handles appear on hover, and you can drag a drawing right away.',
    ),
    async () => {
      await d.hover(await inChart(d, 2, 0.5, 0.5))
      await d.sleep(500)
      await d.hover(await inChart(d, 1, 0.5, 0.5))
      await d.sleep(400)
    },
  )
  await d.say(
    ru(
      'Щелчок по линии открывает панель: цвет, толщина, вид, подпись. Панель можно унести за ручку куда удобно — даже за пределы графика.',
      'Click the line to open its panel: color, width, style, label. Drag the panel by its grip wherever you like, even outside the chart.',
    ),
    async () => {
      await d.hover('.dbar')
      await d.click('.dbar .swatch >> nth=2')
      await d.click('.dbar .row >> nth=1 >> .btn >> nth=1')
      await d.click('.dbar .row >> nth=1 >> .btn >> nth=5')
      const g = await d.at('.dbar .grip')
      await d.drag(g, { x: g.x + 180, y: g.y + 140 }, 900)
      await d.dblclick('.dbar .grip')
    },
  )
  await d.say(
    ru(
      'Видимость по интервалам — как в TradingView: отмечайте любые интервалы по одному, группами или готовым вариантом. Например, этот уровень оставим только на пяти минутах и часе.',
      'Timeframe visibility works like in TradingView: tick any intervals one by one, as groups, or with a preset. For example, keep this level only on five minutes and one hour.',
    ),
    async () => {
      await d.click('.dbar .vis-btn')
      await d.sleep(600)
      await d.click('.vm .presets .chip >> nth=3')
      await d.sleep(400)
      await d.click(`.vm .tfs .chip:text-is("${d.lang === 'ru' ? '1ч' : '1h'}")`)
      await d.sleep(1200)
      await esc(d)
      await d.hover(await inChart(d, 1, 0.5, 0.5))
    },
  )
  await d.say(
    ru(
      'Линия тренда и прямоугольник рисуются двумя щелчками. Магнит притягивает точки к ценам свечей: у него три режима, а ещё перекрестие может прилипать к ценам.',
      'Trend lines and rectangles take two clicks. The magnet snaps points to candle prices: it has three modes, and the crosshair can snap to prices too.',
    ),
    async () => {
      await d.click('.drawbar .magnet')
      await d.sleep(700)
      await d.click('.dropdown-menu .menu-item >> nth=2')
      await d.keys('Alt+t', 'Alt+T')
      await d.click(await onPrice(d, 0, 0.2, 'close'))
      await d.click(await onPrice(d, 0, 0.55, 'close'))
      await d.sleep(500)
      await d.click(await inChart(d, 0, 0.9, 0.9))
    },
  )
  await d.say(
    ru(
      'Инструмент «Текст»: щёлкните по графику и введите надпись. У текста — размер, цвет, подложка, и его можно закрепить на экране.',
      'The Text tool: click on the chart and type. Text has size, color and background, and can be pinned to the screen.',
    ),
    async () => {
      await d.click(`.drawbar .btn[title="${d.T('Текст')}"]`)
      await d.click(await inChart(d, 0, 0.62, 0.12))
      await d.sleep(500)
      await d.type(d.L(ru('Жду пробой уровня', 'Waiting for a breakout')), 60)
      await d.sleep(300)
      await d.click('.td .btn.primary')
      await d.sleep(500)
      await d.click('.dbar .row >> nth=1 >> .btn >> nth=1')
      await d.sleep(400)
    },
  )
  await d.say(
    ru(
      'Ctrl+Z отменяет действие, Delete удаляет выбранный рисунок. Рисунок двигается стрелками и копируется перетаскиванием с Ctrl.',
      'Ctrl+Z undoes, Delete removes the selected drawing. Arrow keys nudge a drawing, and dragging with Ctrl copies it.',
    ),
    async () => {
      await d.keys('ArrowRight')
      await d.keys('ArrowRight')
      await d.keys('Delete')
      await d.sleep(500)
      await d.keys('Control+z', 'Ctrl+Z')
      await d.sleep(500)
      await d.click(await inChart(d, 0, 0.9, 0.9))
    },
  )
  await d.say(
    ru(
      'Карандаш — Alt+B — рисует от руки: обвести участок, показать стрелкой. Он остаётся в руке, пока не нажмёте Esc, а штрих двигается и красится, как любой рисунок.',
      'The pencil, Alt+B, draws freehand: circle an area or sketch an arrow. It stays active until you press Esc, and a stroke moves and changes color like any drawing.',
    ),
    async () => {
      await d.keys('Alt+b', 'Alt+B')
      const c = await inChart(d, 0, 0.45, 0.45)
      // овал вокруг участка
      await d.move(c.x + 70, c.y, 300)
      await d.page.mouse.down()
      for (let i = 1; i <= 48; i++) {
        const a = (i / 48) * Math.PI * 2
        await d.move(c.x + Math.cos(a) * 70, c.y + Math.sin(a) * 40, 25)
      }
      await d.page.mouse.up()
      // стрелка к нему
      await d.move(c.x + 190, c.y - 90, 300)
      await d.page.mouse.down()
      await d.move(c.x + 85, c.y - 20, 500)
      await d.move(c.x + 110, c.y - 22, 150)
      await d.page.mouse.up()
      await d.move(c.x + 85, c.y - 20, 300)
      await d.page.mouse.down()
      await d.move(c.x + 95, c.y - 45, 150)
      await d.page.mouse.up()
      await d.sleep(600)
      await d.keys('Escape', 'Esc')
      await d.sleep(800)
      await d.keys('Control+z', 'Ctrl+Z')
      await d.keys('Control+z', 'Ctrl+Z')
      await d.keys('Control+z', 'Ctrl+Z')
    },
  )

  // ---------- 7 ----------
  await d.chapter(7, ru('Линейка и рисунки на индикаторах', 'Ruler and drawing on indicators'))
  await d.say(
    ru(
      'Линейка — Alt+M или Shift+щелчок. Она показывает разницу в цене и процентах, в пунктах, свечах и времени, а ещё в долях дневного ATR.',
      'The ruler is Alt+M or Shift+click. It shows the difference in price and percent, in ticks, bars and time, and in fractions of the daily ATR.',
    ),
    async () => {
      const a = await inChart(d, 0, 0.3, 0.7)
      await d.move(a.x, a.y)
      await d.page.keyboard.down('Shift')
      await d.page.evaluate(() => window.__tutKeys(['Shift', '🖱']))
      await d.page.mouse.click(a.x, a.y)
      await d.page.keyboard.up('Shift')
      const b = await inChart(d, 0, 0.62, 0.3)
      await d.move(b.x, b.y, 1400)
      await d.sleep(1600)
      await d.page.mouse.click(b.x, b.y)
      await d.sleep(800)
    },
  )
  await d.say(
    ru(
      'Добавим индикатор — кнопкой наверху или клавишей «косая черта». Возьмём индекс относительной силы.',
      'Let’s add an indicator, with the button at the top or the slash key. We take the Relative Strength Index.',
    ),
    async () => {
      await d.click(await inChart(d, 0, 0.9, 0.9))
      await d.keys('Slash', '/')
      await d.sleep(700)
      await d.click('.ind-row:has-text("RSI")')
      await d.sleep(500)
      await esc(d)
    },
  )
  await d.say(
    ru(
      'Рисовать можно и в панели индикатора: уровни, линии и линейка ставятся в его значениях, а магнит притягивает к его линии. Например, уровень перекупленности на RSI и линейка по нему.',
      'You can draw in an indicator pane too: levels, lines and the ruler use the indicator values, and the magnet snaps to its line. For example, an overbought level on the RSI and a ruler on it.',
    ),
    async () => {
      await d.keys('Alt+h', 'Alt+H')
      const rsi = await rsiPoint(d, 0.7, 0.12)
      await d.click(rsi)
      await d.sleep(600)
      await d.click(await inChart(d, 0, 0.9, 0.1))
      const a = await rsiPoint(d, 0.35, 0.75)
      const b = await rsiPoint(d, 0.6, 0.25)
      await d.move(a.x, a.y)
      await d.page.keyboard.down('Shift')
      await d.page.mouse.click(a.x, a.y)
      await d.page.keyboard.up('Shift')
      await d.move(b.x, b.y, 1200)
      await d.sleep(1500)
      await d.page.mouse.click(b.x, b.y)
    },
  )
}

/** Первое окно: точка в панели RSI (вторая панель графика) — в долях её ширины и высоты */
async function rsiPoint(d, fx, fy) {
  const host = await d.page.locator('.chart-host').first().boundingBox()
  const tables = await d.page.locator('.chart-host').first().locator('table tr').evaluateAll((rows) => rows.map((r) => r.getBoundingClientRect()).map((r) => ({ top: r.top, h: r.height })))
  // строки таблицы графика: панель, разделитель, панель… — вторая высокая строка и есть RSI
  const panes = tables.filter((r) => r.h > 30)
  const p = panes[1] ?? panes[0]
  return { x: host.x + (host.width - 72) * fx, y: p.top + p.h * fy }
}

function scRowOrList() {
  return '.wl-row >> nth=0'
}

/** Текущая цена монеты (через тот же адрес, что и у приложения) */
async function lastPrice(d, sym) {
  return d.page.evaluate(async (s) => +(await (await fetch(`https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${s}`)).json()).lastPrice, sym)
}
/** Цена с разумным числом знаков */
const px = (v) => (v >= 1000 ? v.toFixed(1) : v >= 10 ? v.toFixed(2) : v >= 1 ? v.toFixed(3) : v.toPrecision(4))
const dmy = (daysAgo) => {
  const t = new Date(Date.now() - daysAgo * 86400e3)
  return `${String(t.getDate()).padStart(2, '0')}.${String(t.getMonth() + 1).padStart(2, '0')}.${t.getFullYear()}`
}

async function chapters8to11(d) {
  const { page, T } = d

  // ---------- 8 ----------
  await d.chapter(8, ru('Позиции лонг и шорт', 'Long and short positions'))
  await d.click('.wl-row >> nth=0')
  await d.say(
    ru(
      'Длинная и короткая позиция — как в TradingView. Выбираем инструмент и щёлкаем по цене входа. Стоп ставится сам — в 10% дневного ATR, цель — по соотношению R/R, по умолчанию 5 к 1.',
      'Long and short positions work like in TradingView. Pick the tool and click at the entry price. The stop is set automatically at 10% of the daily ATR, and the target by the R/R ratio, 5 to 1 by default.',
    ),
    async () => {
      await d.click(`.drawbar .btn[title="${d.T('Длинная позиция')}"]`)
      await d.click(await onPrice(d, 0, 0.7, 'close'))
      await d.sleep(900)
    },
  )
  await d.say(
    ru(
      'Вход, стоп и цель тянутся мышью и притягиваются магнитом к ценам свечей, с Shift — без магнита. Или вводятся числами на панели.',
      'Entry, stop and target are dragged with the mouse and snap to candle prices; hold Shift to drag without the magnet. Or type them on the panel.',
    ),
    async () => {
      await d.hover('.dbar .prices label >> nth=0')
      await d.hover('.dbar .prices label >> nth=1')
      await d.hover('.dbar .prices label >> nth=2')
    },
  )
  await d.say(
    ru(
      'Поле R/R задаёт соотношение: меняем на 3 — цель встаёт ближе. С замком стоп и тейк связаны: тянешь стоп — тейк следует за ним.',
      'The R/R field sets the ratio: change it to 3 and the target moves closer. With the lock on, stop and target are linked: drag the stop and the target follows.',
    ),
    async () => {
      await d.click('.dbar .rr input', 0.5, 0.5, { clickCount: 3 })
      await d.type('3', 200)
      await d.page.keyboard.press('Enter')
      await d.sleep(800)
      await d.hover('.dbar .lock')
      await d.sleep(500)
    },
  )
  await d.say(
    ru(
      'На графике видно, как идёт сделка, — результат в единицах риска. А если в настройках задан депозит и риск, в подписи появляется объём позиции.',
      'The chart shows how the trade is going, with the result in units of risk. And if you set a deposit and risk in the settings, the label shows the position size.',
    ),
    async () => {
      await d.hover(await inChart(d, 0, 0.74, 0.55))
      await d.sleep(800)
      await d.hover('.dbar .row.prices + .row')
    },
  )
  await d.say(
    ru(
      'Ctrl+C копирует позицию текстом: вход, стоп и тейк. И наоборот — вставьте такой текст, и позиция перестроится по нему, а без выбранной позиции появится новая.',
      'Ctrl+C copies the position as text: entry, stop and target. And the other way round: paste such text and the position is rebuilt from it, or a new one appears if none is selected.',
    ),
    async () => {
      await d.keys('Control+c', 'Ctrl+C')
      await d.sleep(500)
      const sym = await page.locator('.topbar .symbol b').textContent()
      const p = await lastPrice(d, sym)
      await d.clip(`${sym} LONG\n${d.lang === 'ru' ? 'ТВХ' : 'Entry'}: ${px(p * 0.997)}\nSL: ${px(p * 0.992)}\nTP: ${px(p * 1.012)}`)
      await d.keys('Control+v', 'Ctrl+V')
      await d.sleep(900)
      await d.click(await inChart(d, 0, 0.3, 0.92))
    },
  )

  // ---------- 9 ----------
  await d.chapter(9, ru('Быстрая вставка и «Поделиться»', 'Quick paste and Share'))
  const bnb = await lastPrice(d, 'BNBUSDT')
  const xrp = await lastPrice(d, 'XRPUSDT')
  const ada = await lastPrice(d, 'ADAUSDT')
  await d.say(
    ru(
      'Самый быстрый способ открыть сетап — вставить строку из заметок или таблицы: дата, монета, направление и уровень. Копируем строку и нажимаем Ctrl+V прямо на графике.',
      'The fastest way to open a setup is to paste a line from your notes or a spreadsheet: date, coin, direction and level. Copy the line and press Ctrl+V right on the chart.',
    ),
    async () => {
      await d.clip(`${dmy(3)} BNBUSDT Long ${px(bnb * 0.985)}`)
      await d.hover(await inChart(d, 0, 0.5, 0.5))
      await d.keys('Control+v', 'Ctrl+V')
      await d.sleep(1500)
    },
  )
  await d.say(
    ru(
      'Терминал открывает монету, ставит направление и уровень, добавляет её в текущий список и сдвигает графики к дате.',
      'The terminal opens the coin, sets the direction and level, adds it to the current list and moves the charts to the date.',
    ),
    async () => {
      await d.hover(await inChart(d, 1, 0.7, 0.5))
      await d.hover(await inChart(d, 2, 0.5, 0.5))
    },
  )
  await d.say(
    ru(
      'Можно вставить сразу несколько строк — монеты встанут в текущий список с направлениями и уровнями. Если вставка без буфера неудобна, есть окно «Вставить текстом».',
      'You can paste several lines at once, and the coins go to the current list with directions and levels. There is also a “Paste as text” window.',
    ),
    async () => {
      await d.clip(`XRPUSDT short ${px(xrp * 1.02)}\nADAUSDT long ${px(ada * 0.97)}`)
      await d.keys('Control+v', 'Ctrl+V')
      await d.sleep(1200)
      await d.click('.side-tabs button >> nth=1')
      await d.sleep(600)
    },
  )
  await d.say(
    ru(
      'В столбце «Итог» — как далеко цена от ближайшего уровня в долях дневного ATR, а если на графике есть позиция — её результат.',
      'The Result column shows how far the price is from the nearest level in fractions of the daily ATR, or the result of a position if there is one.',
    ),
    async () => {
      await d.hover('.wl-cols .num >> nth=1')
      await d.hover('.wl-row .st >> nth=0')
    },
  )
  await d.say(
    ru(
      'Кнопка «Поделиться» показывает ближайшие уровни и последние позиции. Отмечаете нужное — и получаете ссылку, QR-код или текст для мессенджера. У получателя всё откроется и нарисуется само.',
      'The Share button shows the nearest levels and latest positions. Tick what you need and get a link, a QR code or text for a messenger. For the recipient everything opens and draws itself.',
    ),
    async () => {
      await d.click(title(d, 'Поделиться: уровни, позиции, ссылка и QR-код'))
      await d.sleep(1800)
      await d.hover('.sh h3 >> nth=0')
      await d.sleep(800)
      await esc(d)
    },
  )

  // ---------- 10 ----------
  await d.chapter(10, ru('Чеклист сделки', 'Trade checklist'))
  await d.say(
    ru(
      'Чеклист — отдельная вкладка, Alt+K. Отмечаем стиль, тип уровня, предпосылки и вход — и заметка сразу появляется на графике. Отмеченное запоминается по каждой монете.',
      'The checklist is its own tab, Alt+K. Tick the style, level type, conditions and entry, and a note appears on the chart right away. Answers are remembered per coin.',
    ),
    async () => {
      await d.keys('Alt+k', 'Alt+K')
      await d.sleep(600)
      for (const i of [0, 3, 5, 8]) {
        const a = page.locator('.cl .answer').nth(i)
        if (await a.count()) await d.click(a)
      }
      await d.hover(await inChart(d, 0, 0.12, 0.25))
    },
  )
  await d.say(
    ru(
      'Текст чеклиста можно скопировать, а галочка «на графике» решает, показывать ли заметку. Под шестерёнкой настраиваются сами блоки: вопросы, ответы и условия.',
      'The checklist text can be copied, and the “on chart” box decides whether the note is shown. The gear opens block setup: questions, answers and conditions.',
    ),
    async () => {
      await d.hover('.cl .foot .check')
      await d.click('.cl-head .btn')
      await d.sleep(1300)
      await d.click('.cl-head .btn')
    },
  )

  // ---------- 11 ----------
  await d.chapter(11, ru('ATR и индикаторы', 'ATR and indicators'))
  await d.say(
    ru(
      'В легенде — дневной ATR: среднее пяти прошлых дневных свечей, сколько его пройдено сегодня и размер стопа. Таблица ATR на младших интервалах — стоп, тейк, люфт, границы дня — включается кнопкой «ATR».',
      'The legend shows the daily ATR, the average of five previous daily candles, how much of it is used today and the stop size. The ATR table on lower intervals, with stop, target, slack and day bounds, is toggled by the ATR button.',
    ),
    async () => {
      await d.hover(`${pane(0)} .legend-atr`)
      await d.sleep(800)
      await d.hover('.pane-atr')
      await d.click(`${pane(0)} .pane-tools .chip:text-is("ATR")`)
      await d.sleep(700)
      await d.click(`${pane(0)} .pane-tools .chip:text-is("ATR")`)
    },
  )
  await d.say(
    ru(
      'Индикаторы: объём, средние, Боллинджер, VWAP, RSI, MACD, стохастик, ATR, а для фьючерсов — дельта объёма CDV и открытый интерес. Параметры и цвета меняются прямо из легенды.',
      'Indicators: volume, moving averages, Bollinger, VWAP, RSI, MACD, stochastic, ATR, and for futures the CDV volume delta and open interest. Parameters and colors are changed right from the legend.',
    ),
    async () => {
      await d.click(title(d, 'Индикаторы (/)'))
      await d.sleep(500)
      await d.page.locator('.ind-list').evaluate((el) => el.scrollTo({ top: 400, behavior: 'smooth' }))
      await d.sleep(800)
      await d.click('.ind-row:has-text("CDV")')
      await d.sleep(400)
      await esc(d)
      // строка индикатора в легенде раскрывается щелчком: скрыть, настройки, удалить
      await d.click(`${pane(0)} .legend-row >> nth=0`, 0.3)
      await d.sleep(1400)
      await d.click(`${pane(0)} .legend-row >> nth=0`, 0.3)
    },
  )
}

async function chapters12to15(d) {
  const { page, T } = d

  // ---------- 12 ----------
  await d.chapter(12, ru('Оповещения о цене', 'Price alerts'))
  await d.say(
    ru(
      'Оповещение ставится правой кнопкой по графику или сочетанием Alt+A. Его линию можно взять мышью и перетащить на другую цену.',
      'Set an alert with a right-click on the chart or with Alt+A. Its line can be grabbed with the mouse and moved to another price.',
    ),
    async () => {
      await d.click(await inChart(d, 0, 0.55, 0.25), 0.5, 0.5, { button: 'right' })
      await d.sleep(800)
      await d.click('.ctx-menu .menu-item >> nth=0')
      await d.sleep(600)
      const a = await inChart(d, 0, 0.4, 0.25)
      await d.drag(a, { x: a.x, y: a.y + 40 }, 900)
    },
  )
  await d.say(
    ru(
      'Наведите на линию — появится крестик: он удаляет оповещение. Ещё удалить можно правой кнопкой по линии или во вкладке оповещений.',
      'Hover over the line and a cross appears: it removes the alert. You can also remove it with a right-click on the line or in the alerts tab.',
    ),
    async () => {
      await d.click(await inChart(d, 0, 0.55, 0.5), 0.5, 0.5, { button: 'right' })
      await d.sleep(700)
      await d.click('.ctx-menu .menu-item >> nth=0')
      await d.sleep(500)
      await d.hover(await inChart(d, 0, 0.35, 0.5))
      await d.sleep(900)
      await d.click('.alert-tip')
      await d.sleep(600)
    },
  )
  await d.say(
    ru(
      'Когда цена дойдёт до уровня, терминал покажет сообщение и подаст звук, а непрочитанные считаются на колокольчике. Оповещения работают, пока терминал открыт.',
      'When the price reaches the level, the terminal shows a message and plays a sound, and unread alerts are counted on the bell. Alerts work while the terminal is open.',
    ),
    async () => {
      await d.click(title(d, 'Оповещения (Alt+A)'))
      await d.sleep(700)
      await d.hover('.al-form')
      await d.hover('.al-bar')
    },
  )

  // ---------- 13 ----------
  await d.chapter(13, ru('Обзор по спискам', 'Watchlist dashboard'))
  await d.say(
    ru(
      'Обзор открывается кнопкой на панели или сочетанием Alt+D. Наверху — сводка: монеты и направления, сделки, монеты у уровня, запас хода и оповещения. Ниже — подробности, щелчок по строке открывает монету.',
      'The dashboard opens with the toolbar button or Alt+D. At the top is a summary: coins and directions, trades, coins near a level, room to move and alerts. Below are the details, and clicking a row opens the coin.',
    ),
    async () => {
      await d.keys('Alt+d', 'Alt+D')
      await d.sleep(1500)
      const m = page.locator('.modal').last()
      await d.hover(m, 0.3, 0.3)
      await d.hover(m, 0.6, 0.6)
      await d.sleep(600)
      await esc(d)
    },
  )

  // ---------- 14 ----------
  await d.chapter(14, ru('Снимки, настройки и клавиши', 'Snapshots, settings and hotkeys'))
  await d.say(
    ru(
      'Камера сохраняет все окна одной картинкой, а кнопка рядом копирует снимок в буфер — сразу вставить в чат. В меню камеры — снимок только активного окна.',
      'The camera saves all windows as one picture, and the button next to it copies the snapshot to the clipboard, ready to paste into a chat. The camera menu also has the active window only.',
    ),
    async () => {
      await d.hover(title(d, 'Снимок всех окон одной картинкой (Alt+Shift+S)'))
      await d.click(title(d, 'Другие варианты снимка'))
      await d.sleep(1200)
      await esc(d)
      await d.click(title(d, 'Копировать снимок всех окон в буфер обмена (Alt+Shift+C)'))
      await d.sleep(900)
    },
  )
  await d.say(
    ru(
      'Цвета свечей, фона и сетки настраиваются отдельно для светлой и тёмной темы. Язык интерфейса переключается в настройках, без перезагрузки.',
      'Candle, background and grid colors are set separately for the light and dark themes. The interface language is switched in the settings, without reloading.',
    ),
    async () => {
      // темы в меню: как в системе, тёмная, светлая
      await d.click(title(d, 'Настройки'))
      await d.sleep(500)
      await d.click('.dropdown-menu .menu-item >> nth=1')
      await d.sleep(900)
      await d.hover(`.dropdown-menu .menu-item:has-text("${d.lang === 'ru' ? 'English' : 'Русский'}")`)
      await d.sleep(800)
      await d.click(`.dropdown-menu .menu-item:has-text("${T('Свои цвета…')}")`)
      await d.sleep(1400)
      await esc(d)
      await d.sleep(300)
      await d.click(title(d, 'Настройки'))
      await d.sleep(400)
      await d.click('.dropdown-menu .menu-item >> nth=0')
      await d.sleep(300)
      await esc(d)
    },
  )
  await d.say(
    ru(
      'Все горячие клавиши собраны в справке, нужное сочетание находится поиском. Рядом — кнопка «Обучение» с этим обзором и сердечко, если захотите поддержать проект.',
      'All hotkeys are in the help, and search finds the one you need. Next to it are the Tutorial button with this overview and the heart, if you would like to support the project.',
    ),
    async () => {
      await d.keys('Shift+Slash', '?')
      await d.sleep(600)
      await d.type(d.L(ru('уровень', 'level')), 120)
      await d.sleep(1200)
      await esc(d)
      await d.hover(title(d, 'Обучение: видео-обзор терминала'))
      await d.hover('.topbar .donate')
    },
  )

  // ---------- 15 ----------
  await d.chapter(15, ru('Синхронизация устройств', 'Device sync'))
  await d.say(
    ru(
      'Синхронизация включается в настройках. Списки с направлениями, уровни и рисунки, оповещения, чеклист и шаблоны становятся одинаковыми на всех ваших устройствах.',
      'Sync is turned on in the settings. Lists with directions, levels and drawings, alerts, the checklist and templates become the same on all your devices.',
    ),
    async () => {
      await d.click(title(d, 'Настройки'))
      await d.sleep(400)
      await d.click(`.dropdown-menu .menu-item:has-text("${T('Синхронизация устройств…')}")`)
      await d.sleep(900)
      await d.click('.sy .btn.primary.big')
      await d.sleep(1500)
    },
  )
  await d.say(
    ru(
      'Второе устройство подключается ссылкой или QR-кодом. Своего сервера нет: данные шифруются на устройстве и идут через публичные ретрансляторы, которые видят только шифр. Ссылка — ключ к вашим данным, не публикуйте её.',
      'A second device connects with the link or QR code. There is no server of our own: data is encrypted on the device and goes through public relays that only see ciphertext. The link is the key to your data, so keep it private.',
    ),
    async () => {
      await d.hover('.sy .qr')
      await d.sleep(900)
      await d.hover('.sy .note')
      await d.sleep(500)
      await esc(d)
    },
  )
}

// ---------------------------------------------------------------------------------------------

export async function phone(d) {
  const { page, T } = d
  const tap = async (loc) => {
    const p = await d.at(loc)
    await page.touchscreen.tap(p.x, p.y)
    await d.sleep(600)
  }
  await d.chapter(16, ru('Терминал на телефоне', 'The terminal on a phone'))
  await d.say(
    ru(
      'Откройте ссылку синхронизации на телефоне — и на нём те же списки, уровни, позиции и оповещения, что и на компьютере.',
      'Open the sync link on your phone, and it has the same lists, levels, positions and alerts as the computer.',
    ),
    async () => {
      await d.sleep(800)
    },
  )
  await d.say(
    ru(
      'График занимает весь экран, окна шаблона переключаются вкладками наверху, а кнопка рядом показывает все окна сразу.',
      'The chart fills the screen, template windows switch with the tabs at the top, and the button next to them shows all windows at once.',
    ),
    async () => {
      await tap('.pane-tabs button >> nth=2')
      await tap('.pane-tabs button >> nth=0')
      await tap('.pane-tabs .all')
      await d.sleep(800)
      await tap('.pane-tabs .all')
    },
  )
  await d.say(
    ru(
      'Под графиком — полоса с соседними монетами списка: стрелки или свайп листают их, не уходя с графика.',
      'Under the chart is a strip with neighbouring coins of the list: arrows or a swipe step through them without leaving the chart.',
    ),
    async () => {
      await tap('.strip .side.next')
      await d.sleep(700)
      await tap('.strip .side.next')
      await d.sleep(500)
      await tap('.strip .side >> nth=0')
    },
  )
  await d.say(
    ru(
      'Внизу — разделы: отбор, списки, чеклист и оповещения. Касание по монете открывает её график.',
      'At the bottom are the sections: screener, lists, checklist and alerts. Tap a coin to open its chart.',
    ),
    async () => {
      await tap('.bnav button >> nth=2')
      await d.sleep(900)
      await tap('.wl-row >> nth=1')
      await d.sleep(700)
    },
  )
  await d.say(
    ru(
      'Карандаш открывает инструменты рисования. Вставка работает и без клавиатуры: скопируйте сделку или строки с монетами и нажмите кнопку вставки — в списке, в меню «Ещё» или на панели позиции.',
      'The pencil opens the drawing tools. Paste works without a keyboard too: copy a trade or lines with coins and press the paste button in the list, in the More menu or on the position panel.',
    ),
    async () => {
      await tap(`.topbar ${title(d, 'Рисование')}`)
      await d.sleep(900)
      await tap(`.topbar ${title(d, 'Рисование')}`)
      await tap('.bnav .dropdown button')
      await d.sleep(1300)
      await page.evaluate(() => document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })))
      await d.sleep(400)
    },
  )
  await d.say(
    ru(
      'Телефон можно повернуть — навигация уйдёт в колонку слева, а график займёт всю ширину. Терминал добавляется на главный экран и запускается как приложение.',
      'Turn the phone sideways and navigation moves to a column on the left while the chart takes the full width. The terminal can be added to the home screen and starts like an app.',
    ),
    async () => {
      await page.setViewportSize({ width: 844, height: 390 })
      await d.sleep(2200)
      await page.setViewportSize({ width: 390, height: 664 })
      await d.sleep(800)
    },
  )
  await d.say(
    ru(
      'На этом всё. Начните с отбора и списков, добавьте уровни, включите синхронизацию — а к остальному возвращайтесь по мере надобности. Удачной торговли!',
      'That’s it. Start with the screener and watchlists, add your levels, turn on sync, and come back to the rest when you need it. Happy trading!',
    ),
  )
}
