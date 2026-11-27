/**
 * Общие типы журнала сделок. Ими пользуются и сайт, и расширение-мост: мост приводит ответы бирж
 * к Fill/Funding, сайт собирает из них сделки и считает статистику.
 */
export type ExchangeId = 'binance' | 'bybit'

/** Счёт: одна пара ключей на одной бирже. Самих ключей здесь нет — они не покидают расширение */
export interface Account {
  id: string
  exchange: ExchangeId
  label: string
  /** последние символы открытой части ключа — чтобы отличать счета друг от друга */
  hint: string
  addedAt: number
}

/** Одно исполнение (частичное или полное) ордера */
export interface Fill {
  /** идентификатор исполнения на бирже — по нему отсекаются повторы */
  id: string
  /** мс UTC */
  t: number
  sym: string
  /** 1 — покупка, −1 — продажа */
  side: 1 | -1
  px: number
  qty: number
  /** комиссия в валюте расчётов; положительная — уплачена, отрицательная — возврат мейкеру */
  fee: number
  /**
   * Сторона позиции в режиме хеджирования (Binance: LONG/SHORT). Пусто — односторонний режим
   * или биржа не сообщает сторону.
   */
  ps?: 'L' | 'S'
  /** сколько из qty закрыло встречную позицию, если биржа это сообщает (Bybit: closedSize) */
  closed?: number
  /** реализованный результат этого исполнения по данным биржи, без комиссии (Binance: realizedPnl) */
  pnl?: number
  maker?: boolean
}

/** Начисление или списание фандинга */
export interface Funding {
  id: string
  t: number
  sym: string
  /** положительное — получено, отрицательное — уплачено */
  amt: number
}

/** Сделка «от нуля до нуля»: позиция открылась, менялась и закрылась */
export interface Trade {
  id: string
  acct: string
  sym: string
  /** 1 — лонг, −1 — шорт */
  side: 1 | -1
  /** время первого исполнения, мс */
  open: number
  /** время закрытия, мс; 0 — позиция ещё открыта */
  close: number
  /** средняя цена набора позиции */
  entry: number
  /** средняя цена закрытой части; 0, пока ничего не закрыто */
  exit: number
  /** наибольший размер позиции за время сделки */
  qty: number
  /** оборот: сумма цена × объём по всем исполнениям */
  vol: number
  /** результат по ценам, без комиссий и фандинга */
  gross: number
  /** комиссии (положительное — уплачено) */
  fee: number
  /** фандинг за время удержания (положительное — получено) */
  funding: number
  /** число исполнений */
  fills: number
  /**
   * Начало сделки не попало в загруженную историю: цена входа неизвестна, результат неполный.
   * Такие сделки показываются в списке, но в статистику не идут.
   */
  partial?: boolean
}

/** Итог сделки с комиссиями и фандингом */
export const netOf = (t: Trade): number => t.gross - t.fee + t.funding

/** Открытая сейчас позиция — снимок с биржи */
export interface OpenPosition {
  sym: string
  side: 1 | -1
  qty: number
  entry: number
  mark: number
  upnl: number
  leverage?: number
}

/** Состояние счёта на момент последнего обновления */
export interface Snapshot {
  at: number
  /** средства с учётом нереализованного результата, в долларах */
  equity: number
  /** средства без нереализованного результата */
  wallet: number
  upnl: number
  positions: OpenPosition[]
}

/** Пометки пользователя к сделке */
export interface Note {
  tags: string[]
  text: string
}
