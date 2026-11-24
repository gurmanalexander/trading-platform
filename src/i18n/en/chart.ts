// Переводы: chart/drawings.ts, chart/controller.ts, chart/setup.ts, chart/trade.ts, chart/snapshot.ts, chart/position.ts,
// lib/indicators.ts (названия индикаторов, параметров и линий — переводятся там, где показываются), lib/format.ts,
// lib/signal.ts, stores/alerts.ts
export default {
  // подписи позиции и линейки на графике (chart/drawings.ts)
  'Цель': 'Target',
  'Стоп': 'Stop',
  'Лонг': 'Long',
  'Шорт': 'Short',
  'Объём': 'Volume',
  '{n} п.': '{n} pts',
  '{n} бар.': '{n} bars',
  'сейчас {r}': 'now {r}',
  'тейк {r}': 'target hit {r}',
  'стоп -1R': 'stopped -1R',
  'закрыта {r}': 'closed {r}',
  'вход не исполнен': 'entry not filled',
  'ждёт входа': 'awaiting entry',

  // загрузка графика (chart/controller.ts)
  'Нет данных по инструменту': 'No data for this symbol',
  'Не удалось загрузить данные': 'Failed to load data',

  // вставка сетапов (chart/setup.ts)
  'лонг': 'long',
  'шорт': 'short',
  'уровень {level}': 'level {level}',
  'уровень уже есть': 'level already exists',
  'уже в списке «{name}»': 'already in watchlist "{name}"',
  'добавлен в конец списка «{name}»': 'added to the end of watchlist "{name}"',
  'В список «{name}» добавлено {n}: {list}': 'Added {n} to watchlist "{name}": {list}',
  'Уже в списках, обновлены направление и уровни — {n}: {list}': 'Already in watchlists, side and levels updated — {n}: {list}',
  'уже в списках, обновлены направление и уровни — {n}: {list}': 'already in watchlists, side and levels updated — {n}: {list}',
  'Не разобрано строк: {n} — {lines}': 'Lines not recognized: {n} — {lines}',

  // позиция из текста (chart/trade.ts)
  'Цены позиции обновлены из текста': 'Position prices updated from text',
  'Не получилось: стоп и цель должны быть по разные стороны от входа': 'Failed: stop and target must be on opposite sides of the entry',
  'Чтобы создать позицию из текста, нужны вход, стоп и цель. Либо выделите позицию и вставьте снова':
    'To create a position from text, you need an entry, a stop and a target. Or select a position and paste again',
  'Лонг {symbol} добавлен на график': 'Long {symbol} added to the chart',
  'Шорт {symbol} добавлен на график': 'Short {symbol} added to the chart',

  // текст сделки для копирования (lib/signal.ts)
  'ТВХ': 'Entry',

  // снимок графика (chart/snapshot.ts)
  'Браузер не умеет копировать картинки в буфер — сохраните снимок файлом': 'This browser cannot copy images to the clipboard — save the snapshot as a file',
  'Снимок скопирован в буфер обмена': 'Snapshot copied to clipboard',
  'Не удалось скопировать картинку в буфер обмена': 'Failed to copy the image to the clipboard',

  // оповещения о цене (stores/alerts.ts)
  '{symbol}: цена поднялась до {price} (сейчас {last})': '{symbol}: price rose to {price} (now {last})',
  '{symbol}: цена опустилась до {price} (сейчас {last})': '{symbol}: price fell to {price} (now {last})',
  'Оповещение о цене': 'Price alert',

  // длительности (lib/format.ts)
  '{d}д {h}ч': '{d}d {h}h',
  '{d}д': '{d}d',
  '{h}ч {m}м': '{h}h {m}m',
  '{h}ч': '{h}h',
  '{m}м': '{m}m',

  // индикаторы (lib/indicators.ts): name, short, подписи параметров и линий — t(def.name), t(p.label) при показе
  'Период': 'Length',
  'Скользящая средняя (SMA)': 'Moving Average (SMA)',
  'Экспоненциальная средняя (EMA)': 'Exponential Moving Average (EMA)',
  'Взвешенная средняя (WMA)': 'Weighted Moving Average (WMA)',
  'Полосы Боллинджера': 'Bollinger Bands',
  'Отклонение': 'StdDev',
  'Средняя': 'Basis',
  'Верх': 'Upper',
  'Низ': 'Lower',
  'VWAP (дневной)': 'VWAP (daily)',
  'Индекс относительной силы (RSI)': 'Relative Strength Index (RSI)',
  'Быстрая': 'Fast length',
  'Медленная': 'Slow length',
  'Сигнальная': 'Signal length',
  'Гистограмма': 'Histogram',
  'Сигнал': 'Signal',
  'Стохастик': 'Stochastic',
  'Период %K': '%K length',
  'Сглаживание %K': '%K smoothing',
  'Период %D': '%D smoothing',
  'Средний истинный диапазон (ATR)': 'Average True Range (ATR)',
  'Свечи Хейкен Аши': 'Heikin Ashi candles',
  'Открытый интерес (Open Interest) — фьючерсы': 'Open Interest — futures',
} satisfies Record<string, string>
