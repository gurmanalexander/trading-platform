# Сценарий обучающего видео

Собран из `scenes.mjs` командой `node scripts/tutorial/record.mjs --script` — не правьте руками: текст меняется в `scenes.mjs`.
Слева — русская запись, справа — английская; действия на экране описаны в `scenes.mjs` рядом с каждой репликой.

## Вступление · Introduction

| # | Русский | English |
| --- | --- | --- |
| 1 | Это обзор терминала tvx — бесплатной платформы для графиков бирж Binance и Bybit. Пойдём от простого к сложному: первый запуск и график, окна, отбор и списки, рисование и позиции, а в конце — быстрые приёмы, синхронизация и телефон. | This is an overview of tvx, a free charting terminal for Binance and Bybit. We will go from simple to advanced: the first launch and the chart, windows, the screener and watchlists, drawing and positions, and finally quick tricks, sync and the phone. |

## 1. Первый запуск · 1. First launch

| # | Русский | English |
| --- | --- | --- |
| 2 | Часть 1. Первый запуск. | Part 1. First launch. |
| 3 | При первом запуске терминал предлагает пару настроек. Язык интерфейса — русский или английский. | On the first launch the terminal asks for a couple of settings. The interface language is English or Russian. |
| 4 | Тема — светлая, тёмная или как в системе. Часовой пояс для внутридневных графиков и биржа с рынком, на которых открываются монеты. | The theme is light, dark or the system one. Then the time zone for intraday charts, and the exchange and market where coins open. |
| 5 | Всё это потом меняется в настройках. Нажимаем «Начать». | All of this can be changed later in the settings. Press “Start”. |
| 6 | Перед нами три окна одной монеты: сверху — пять минут, внизу слева — день, справа — час. Справа — панель с отбором, списками, чеклистом и оповещениями. | Here are three windows of one coin: five minutes at the top, the daily chart bottom left and the hourly one on the right. On the right is the panel with the screener, watchlists, checklist and alerts. |
| 7 | Чтобы сменить монету, просто начните печатать её название — откроется поиск. Enter — и монета меняется во всех окнах сразу. | To change the coin, just start typing its name and the search opens. Press Enter, and the coin changes in all windows at once. |
| 8 | Интервал активного окна переключается кнопками наверху. В выпадающем меню — все интервалы, а звёздочка выносит нужный на панель. | The interval of the active window is switched with the buttons at the top. The drop-down has all intervals, and the star puts one on the toolbar. |
| 9 | Интервал можно набрать с клавиатуры: цифры — минуты. Вводим 15 и Enter, а 5 возвращает пятиминутки. | You can also type the interval: digits mean minutes. Type 15 and Enter, and 5 brings back five minutes. |

## 2. График и его вид · 2. The chart and its look

| # | Русский | English |
| --- | --- | --- |
| 10 | Часть 2. График и его вид. | Part 2. The chart and its look. |
| 11 | График двигается мышью во все стороны, а колесо меняет масштаб по времени. | Drag the chart with the mouse in any direction, and the wheel zooms the time scale. |
| 12 | Колесо над ценовой шкалой растягивает график по вертикали, кнопка «авто» возвращает обычный масштаб. Другая монета открывается в том же масштабе и на том же месте. | The wheel over the price scale stretches the chart vertically, and the “auto” button resets the scale. Another coin opens with the same zoom and position. |
| 13 | Справа от последней цены — время до закрытия свечи, а цена подсвечена цветом бара. Сетка и шкала времени продолжаются в будущее. | Next to the last price is the time until the candle closes, and the price is colored like the bar. The grid and time scale continue into the future. |
| 14 | В меню вида графика — бары, свечи, полые свечи, Хейкен Аши и линия, а ещё тонкие бары и линия текущей цены. | The chart type menu has bars, candles, hollow candles, Heikin Ashi and line, plus thin bars and the current price line. |
| 15 | Часовой пояс меняется кнопкой в правом нижнем углу графика. Внутридневные графики показывают выбранное время, дневные — даты биржи. | The time zone is changed with the button in the bottom right corner of the chart. Intraday charts show the chosen time, daily ones show exchange dates. |
| 16 | Под шестерёнкой — тема, свои цвета и окно «Шрифты, таймер, размер позиции»: крупный шрифт шкал и легенды, таймер свечи и депозит для расчёта объёма. | The gear menu has the theme, custom colors and the “Fonts, timer, position size” window: larger scale and legend fonts, the candle timer and the deposit used for position size. |
| 17 | Alt+Enter разворачивает активное окно на весь экран и возвращает раскладку. Alt+G переносит все окна к нужной дате, а стрелка справа внизу — обратно к текущей цене. | Alt+Enter maximizes the active window and restores the layout. Alt+G jumps all windows to a date, and the arrow at the bottom right brings you back to the current price. |

## 3. Окна и шаблоны · 3. Windows and templates

| # | Русский | English |
| --- | --- | --- |
| 18 | Часть 3. Окна и шаблоны. | Part 3. Windows and templates. |
| 19 | Раскладка выбирается здесь: до восьми графиков, готовые варианты или своя сетка. Ниже — синхронизация окон: инструмент, интервал, перекрестие и время. | Pick the layout here: up to eight charts, presets or your own grid. Below is window sync: symbol, interval, crosshair and time. |
| 20 | Перекрестие повторяется во всех окнах — удобно сверять одно место на разных интервалах. Границы окон и боковой панели перетаскиваются. | The crosshair is mirrored in every window, which helps to compare one spot on different intervals. Window and side panel borders can be dragged. |
| 21 | Удачную настройку сохраните как шаблон: раскладка, интервалы, вид графиков и индикаторы. Шаблон со звёздочкой становится кнопкой на панели, его можно привязать к вкладке «Отбор» или «Список». | Save a good setup as a template: layout, intervals, chart types and indicators. A starred template becomes a toolbar button, and it can be bound to the Screener or Watchlist tab. |

## 4. Отбор монет · 4. Screener

| # | Русский | English |
| --- | --- | --- |
| 22 | Часть 4. Отбор монет. | Part 4. Screener. |
| 23 | Вкладка «Отбор» показывает монеты биржи по вашим условиям: биржа, рынок, оборот за сутки, изменение цены и сортировка. Здесь же можно показать только криптовалюты, только акции и TradFi — или всё вместе. | The Screener tab lists the exchange coins that match your conditions: exchange, market, daily turnover, price change and sorting. You can also show only crypto, only stocks and TradFi, or everything. |
| 24 | Столбцы настраиваются: цена, изменение, объём. Цена окрашена по изменению за сутки, сортировка — щелчком по заголовку. | Columns are configurable: price, change, volume. The price is colored by the daily change, and clicking a header sorts. |
| 25 | Щелчок по строке открывает монету. Пробел листает отбор вниз, Shift+Пробел — вверх, а стрелки — по одной монете. | Clicking a row opens the coin. Space pages through the screener, Shift+Space goes back, and the arrow keys move one coin at a time. |
| 26 | Слева от названия — направление. Щелчок помечает монету как лонг, второй — как шорт. Точка справа показывает, в каких списках монета, и добавляет её в любой. | Left of the name is the direction mark: one click marks the coin long, a second one short. The dot on the right shows which lists the coin is in and adds it to any of them. |
| 27 | Можно взять сразу несколько монет: Ctrl+щелчок — по одной, Shift+щелчок — подряд. Правая кнопка — и все выбранные получают направление и уходят в нужный список. | You can take several coins at once: Ctrl+click picks them one by one, Shift+click picks a range. Right-click, and all of them get a direction and go to the list you need. |

## 5. Списки наблюдения · 5. Watchlists

| # | Русский | English |
| --- | --- | --- |
| 28 | Часть 5. Списки наблюдения. | Part 5. Watchlists. |
| 29 | На вкладке «Список» все ваши списки идут одним потоком. У каждого — цветная метка, щелчок по названию сворачивает список. Цены и изменения обновляются вживую. | On the Watchlist tab all your lists flow as sections. Each has a color tag, and clicking the name collapses it. Prices and changes update live. |
| 30 | Звёздочка отмечает текущий список: туда попадают монеты по Alt+W и при вставке. Монеты и целые списки перетаскиваются мышью, а на планшете — долгим нажатием. | The star marks the current list: coins go there with Alt+W and on paste. Coins and whole lists are dragged with the mouse, or with a long press on a tablet. |
| 31 | Переключатель наверху — фильтр по направлению. Рядом: поделиться списком, вставка монет из буфера, столбцы и новый список. | The switch at the top filters by direction. Next to it: share the list, paste coins from the clipboard, columns, and a new list. |
| 32 | «Поделиться списком» собирает по каждой отмеченной монете картинку со всеми окнами и строку «монета, направление, уровень» — удобно отправить в Telegram. | “Share list” makes, for every checked coin, a picture with all windows and a line “coin, direction, level”, handy to send to Telegram. |

## 6. Рисование · 6. Drawing

| # | Русский | English |
| --- | --- | --- |
| 33 | Часть 6. Рисование. | Part 6. Drawing. |
| 34 | Инструменты рисования — на панели слева. Горизонтальный уровень ставится одним щелчком, быстрее всего — сочетанием Alt+H. Цена уровня сразу видна на шкале. | Drawing tools are on the left. A horizontal level takes one click, fastest with Alt+H. The level price shows right away on the scale. |
| 35 | Уровень привязан к монете, а не к окну, поэтому он виден на всех интервалах. Маркеры появляются при наведении, и рисунок можно тянуть сразу. | The level belongs to the coin, not the window, so it shows on every interval. Handles appear on hover, and you can drag a drawing right away. |
| 36 | Щелчок по линии открывает панель: цвет, толщина, вид, подпись. Панель можно унести за ручку куда удобно — даже за пределы графика. | Click the line to open its panel: color, width, style, label. Drag the panel by its grip wherever you like, even outside the chart. |
| 37 | Видимость по интервалам — как в TradingView: отмечайте любые интервалы по одному, группами или готовым вариантом. Например, этот уровень оставим только на пяти минутах и часе. | Timeframe visibility works like in TradingView: tick any intervals one by one, as groups, or with a preset. For example, keep this level only on five minutes and one hour. |
| 38 | Линия тренда и прямоугольник рисуются двумя щелчками. Магнит притягивает точки к ценам свечей: у него три режима, а ещё перекрестие может прилипать к ценам. | Trend lines and rectangles take two clicks. The magnet snaps points to candle prices: it has three modes, and the crosshair can snap to prices too. |
| 39 | Инструмент «Текст»: щёлкните по графику и введите надпись. У текста — размер, цвет, подложка, и его можно закрепить на экране. | The Text tool: click on the chart and type. Text has size, color and background, and can be pinned to the screen. |
| 40 | Ctrl+Z отменяет действие, Delete удаляет выбранный рисунок. Рисунок двигается стрелками и копируется перетаскиванием с Ctrl. | Ctrl+Z undoes, Delete removes the selected drawing. Arrow keys nudge a drawing, and dragging with Ctrl copies it. |
| 41 | Карандаш — Alt+B — рисует от руки: обвести участок, показать стрелкой. Он остаётся в руке, пока не нажмёте Esc, а штрих двигается и красится, как любой рисунок. | The pencil, Alt+B, draws freehand: circle an area or sketch an arrow. It stays active until you press Esc, and a stroke moves and changes color like any drawing. |

## 7. Линейка и рисунки на индикаторах · 7. Ruler and drawing on indicators

| # | Русский | English |
| --- | --- | --- |
| 42 | Часть 7. Линейка и рисунки на индикаторах. | Part 7. Ruler and drawing on indicators. |
| 43 | Линейка — Alt+M или Shift+щелчок. Она показывает разницу в цене и процентах, в пунктах, свечах и времени, а ещё в долях дневного ATR. | The ruler is Alt+M or Shift+click. It shows the difference in price and percent, in ticks, bars and time, and in fractions of the daily ATR. |
| 44 | Добавим индикатор — кнопкой наверху или клавишей «косая черта». Возьмём индекс относительной силы. | Let’s add an indicator, with the button at the top or the slash key. We take the Relative Strength Index. |
| 45 | Рисовать можно и в панели индикатора: уровни, линии и линейка ставятся в его значениях, а магнит притягивает к его линии. Например, уровень перекупленности на RSI и линейка по нему. | You can draw in an indicator pane too: levels, lines and the ruler use the indicator values, and the magnet snaps to its line. For example, an overbought level on the RSI and a ruler on it. |

## 8. Позиции лонг и шорт · 8. Long and short positions

| # | Русский | English |
| --- | --- | --- |
| 46 | Часть 8. Позиции лонг и шорт. | Part 8. Long and short positions. |
| 47 | Длинная и короткая позиция — как в TradingView. Выбираем инструмент и щёлкаем по цене входа. Стоп ставится сам — в 10% дневного ATR, цель — по соотношению R/R, по умолчанию 5 к 1. | Long and short positions work like in TradingView. Pick the tool and click at the entry price. The stop is set automatically at 10% of the daily ATR, and the target by the R/R ratio, 5 to 1 by default. |
| 48 | Вход, стоп и цель тянутся мышью и притягиваются магнитом к ценам свечей, с Shift — без магнита. Или вводятся числами на панели. | Entry, stop and target are dragged with the mouse and snap to candle prices; hold Shift to drag without the magnet. Or type them on the panel. |
| 49 | Поле R/R задаёт соотношение: меняем на 3 — цель встаёт ближе. С замком стоп и тейк связаны: тянешь стоп — тейк следует за ним. | The R/R field sets the ratio: change it to 3 and the target moves closer. With the lock on, stop and target are linked: drag the stop and the target follows. |
| 50 | На графике видно, как идёт сделка, — результат в единицах риска. А если в настройках задан депозит и риск, в подписи появляется объём позиции. | The chart shows how the trade is going, with the result in units of risk. And if you set a deposit and risk in the settings, the label shows the position size. |
| 51 | Ctrl+C копирует позицию текстом: вход, стоп и тейк. И наоборот — вставьте такой текст, и позиция перестроится по нему, а без выбранной позиции появится новая. | Ctrl+C copies the position as text: entry, stop and target. And the other way round: paste such text and the position is rebuilt from it, or a new one appears if none is selected. |

## 9. Быстрая вставка и «Поделиться» · 9. Quick paste and Share

| # | Русский | English |
| --- | --- | --- |
| 52 | Часть 9. Быстрая вставка и «Поделиться». | Part 9. Quick paste and Share. |
| 53 | Самый быстрый способ открыть сетап — вставить строку из заметок или таблицы: дата, монета, направление и уровень. Копируем строку и нажимаем Ctrl+V прямо на графике. | The fastest way to open a setup is to paste a line from your notes or a spreadsheet: date, coin, direction and level. Copy the line and press Ctrl+V right on the chart. |
| 54 | Терминал открывает монету, ставит направление и уровень, добавляет её в текущий список и сдвигает графики к дате. | The terminal opens the coin, sets the direction and level, adds it to the current list and moves the charts to the date. |
| 55 | Можно вставить сразу несколько строк — монеты встанут в текущий список с направлениями и уровнями. Если вставка без буфера неудобна, есть окно «Вставить текстом». | You can paste several lines at once, and the coins go to the current list with directions and levels. There is also a “Paste as text” window. |
| 56 | В столбце «Итог» — как далеко цена от ближайшего уровня в долях дневного ATR, а если на графике есть позиция — её результат. | The Result column shows how far the price is from the nearest level in fractions of the daily ATR, or the result of a position if there is one. |
| 57 | Кнопка «Поделиться» показывает ближайшие уровни и последние позиции. Отмечаете нужное — и получаете ссылку, QR-код или текст для мессенджера. У получателя всё откроется и нарисуется само. | The Share button shows the nearest levels and latest positions. Tick what you need and get a link, a QR code or text for a messenger. For the recipient everything opens and draws itself. |

## 10. Чеклист сделки · 10. Trade checklist

| # | Русский | English |
| --- | --- | --- |
| 58 | Часть 10. Чеклист сделки. | Part 10. Trade checklist. |
| 59 | Чеклист — отдельная вкладка, Alt+K. Отмечаем стиль, тип уровня, предпосылки и вход — и заметка сразу появляется на графике. Отмеченное запоминается по каждой монете. | The checklist is its own tab, Alt+K. Tick the style, level type, conditions and entry, and a note appears on the chart right away. Answers are remembered per coin. |
| 60 | Текст чеклиста можно скопировать, а галочка «на графике» решает, показывать ли заметку. Под шестерёнкой настраиваются сами блоки: вопросы, ответы и условия. | The checklist text can be copied, and the “on chart” box decides whether the note is shown. The gear opens block setup: questions, answers and conditions. |

## 11. ATR и индикаторы · 11. ATR and indicators

| # | Русский | English |
| --- | --- | --- |
| 61 | Часть 11. ATR и индикаторы. | Part 11. ATR and indicators. |
| 62 | В легенде — дневной ATR: среднее пяти прошлых дневных свечей, сколько его пройдено сегодня и размер стопа. Таблица ATR на младших интервалах — стоп, тейк, люфт, границы дня — включается кнопкой «ATR». | The legend shows the daily ATR, the average of five previous daily candles, how much of it is used today and the stop size. The ATR table on lower intervals, with stop, target, slack and day bounds, is toggled by the ATR button. |
| 63 | Индикаторы: объём, средние, Боллинджер, VWAP, RSI, MACD, стохастик, ATR, а для фьючерсов — дельта объёма CDV и открытый интерес. Параметры и цвета меняются прямо из легенды. | Indicators: volume, moving averages, Bollinger, VWAP, RSI, MACD, stochastic, ATR, and for futures the CDV volume delta and open interest. Parameters and colors are changed right from the legend. |

## 12. Оповещения о цене · 12. Price alerts

| # | Русский | English |
| --- | --- | --- |
| 64 | Часть 12. Оповещения о цене. | Part 12. Price alerts. |
| 65 | Оповещение ставится правой кнопкой по графику или сочетанием Alt+A. Его линию можно взять мышью и перетащить на другую цену. | Set an alert with a right-click on the chart or with Alt+A. Its line can be grabbed with the mouse and moved to another price. |
| 66 | Когда цена дойдёт до уровня, терминал покажет сообщение и подаст звук, а непрочитанные считаются на колокольчике. Оповещения работают, пока терминал открыт. | When the price reaches the level, the terminal shows a message and plays a sound, and unread alerts are counted on the bell. Alerts work while the terminal is open. |

## 13. Обзор по спискам · 13. Watchlist dashboard

| # | Русский | English |
| --- | --- | --- |
| 67 | Часть 13. Обзор по спискам. | Part 13. Watchlist dashboard. |
| 68 | Обзор открывается кнопкой на панели или сочетанием Alt+D. Наверху — сводка: монеты и направления, сделки, монеты у уровня, запас хода и оповещения. Ниже — подробности, щелчок по строке открывает монету. | The dashboard opens with the toolbar button or Alt+D. At the top is a summary: coins and directions, trades, coins near a level, room to move and alerts. Below are the details, and clicking a row opens the coin. |

## 14. Снимки, настройки и клавиши · 14. Snapshots, settings and hotkeys

| # | Русский | English |
| --- | --- | --- |
| 69 | Часть 14. Снимки, настройки и клавиши. | Part 14. Snapshots, settings and hotkeys. |
| 70 | Камера сохраняет все окна одной картинкой, а кнопка рядом копирует снимок в буфер — сразу вставить в чат. В меню камеры — снимок только активного окна. | The camera saves all windows as one picture, and the button next to it copies the snapshot to the clipboard, ready to paste into a chat. The camera menu also has the active window only. |
| 71 | Цвета свечей, фона и сетки настраиваются отдельно для светлой и тёмной темы. Язык интерфейса переключается в настройках, без перезагрузки. | Candle, background and grid colors are set separately for the light and dark themes. The interface language is switched in the settings, without reloading. |
| 72 | Все горячие клавиши собраны в справке, нужное сочетание находится поиском. Рядом — кнопка «Обучение» с этим обзором и сердечко, если захотите поддержать проект. | All hotkeys are in the help, and search finds the one you need. Next to it are the Tutorial button with this overview and the heart, if you would like to support the project. |

## 15. Синхронизация устройств · 15. Device sync

| # | Русский | English |
| --- | --- | --- |
| 73 | Часть 15. Синхронизация устройств. | Part 15. Device sync. |
| 74 | Синхронизация включается в настройках. Списки с направлениями, уровни и рисунки, оповещения, чеклист и шаблоны становятся одинаковыми на всех ваших устройствах. | Sync is turned on in the settings. Lists with directions, levels and drawings, alerts, the checklist and templates become the same on all your devices. |
| 75 | Второе устройство подключается ссылкой или QR-кодом. Своего сервера нет: данные шифруются на устройстве и идут через публичные ретрансляторы, которые видят только шифр. Ссылка — ключ к вашим данным, не публикуйте её. | A second device connects with the link or QR code. There is no server of our own: data is encrypted on the device and goes through public relays that only see ciphertext. The link is the key to your data, so keep it private. |

## 16. Терминал на телефоне · 16. The terminal on a phone

| # | Русский | English |
| --- | --- | --- |
| 76 | Часть 16. Терминал на телефоне. | Part 16. The terminal on a phone. |
| 77 | Откройте ссылку синхронизации на телефоне — и на нём те же списки, уровни, позиции и оповещения, что и на компьютере. | Open the sync link on your phone, and it has the same lists, levels, positions and alerts as the computer. |
| 78 | График занимает весь экран, окна шаблона переключаются вкладками наверху, а кнопка рядом показывает все окна сразу. | The chart fills the screen, template windows switch with the tabs at the top, and the button next to them shows all windows at once. |
| 79 | Под графиком — полоса с соседними монетами списка: стрелки или свайп листают их, не уходя с графика. | Under the chart is a strip with neighbouring coins of the list: arrows or a swipe step through them without leaving the chart. |
| 80 | Внизу — разделы: отбор, списки, чеклист и оповещения. Касание по монете открывает её график. | At the bottom are the sections: screener, lists, checklist and alerts. Tap a coin to open its chart. |
| 81 | Карандаш открывает инструменты рисования. Вставка работает и без клавиатуры: скопируйте сделку или строки с монетами и нажмите кнопку вставки — в списке, в меню «Ещё» или на панели позиции. | The pencil opens the drawing tools. Paste works without a keyboard too: copy a trade or lines with coins and press the paste button in the list, in the More menu or on the position panel. |
| 82 | Телефон можно повернуть — навигация уйдёт в колонку слева, а график займёт всю ширину. Терминал добавляется на главный экран и запускается как приложение. | Turn the phone sideways and navigation moves to a column on the left while the chart takes the full width. The terminal can be added to the home screen and starts like an app. |
| 83 | На этом всё. Начните с отбора и списков, добавьте уровни, включите синхронизацию — а к остальному возвращайтесь по мере надобности. Удачной торговли! | That’s it. Start with the screener and watchlists, add your levels, turn on sync, and come back to the rest when you need it. Happy trading! |
