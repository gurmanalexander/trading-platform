import type { Account, ExchangeId, Fill, Funding, Snapshot, Trade } from './types'

/**
 * Обмен между сайтом журнала и расширением-мостом.
 *
 * Мост сам, в фоне, загружает историю счетов с биржи, собирает из неё сделки и — если включена
 * синхронизация — публикует их в зашифрованном виде для других устройств. Сайт только спрашивает
 * у моста готовое: какие есть счета, как идёт загрузка, какие сделки. Ключей он не видит,
 * а запросов, меняющих что-либо на бирже, в протоколе нет.
 *
 * Сообщения идут через window.postMessage: страница → { to: BRIDGE, id, req },
 * мост → { from: BRIDGE, id, res }.
 */
export const BRIDGE = 'tvx-bridge'
export const PROTOCOL = 2

export type BridgeRequest =
  /** кто на связи: версия моста, счета и ход их загрузки */
  | { op: 'hello' }
  /** ход загрузки счетов — журнал спрашивает его, пока открыт */
  | { op: 'status' }
  /** готовые сделки и состояние счёта */
  | { op: 'trades'; account: string }
  /** догрузить историю сейчас, не дожидаясь расписания; без account — все счета */
  | { op: 'refresh'; account?: string }
  /** настройки фоновой работы: синхронизация, глубина первой загрузки, удалённые из журнала счета */
  | { op: 'config'; config: BridgeConfig }
  /** открыть страницу расширения, где добавляют ключи */
  | { op: 'options' }

export interface BridgeConfig {
  /** код и ретрансляторы синхронизации; null — фоновой выгрузки нет */
  sync: { code: string; relays: string[] } | null
  /** на сколько дней назад грузить историю нового счёта */
  depthDays: number
  /** счета, которые пользователь удалил из журнала: мост их не грузит и не публикует */
  removed: string[]
}

/** Где остановилась загрузка у биржи — внутреннее дело моста */
export type PullCursor = Record<string, unknown>

/** Порция истории от клиента биржи */
export interface PullChunk {
  fills: Fill[]
  funding: Funding[]
  /** null — история загружена до текущего момента */
  next: PullCursor | null
  /** доля сделанного, 0…1 */
  progress: number
}

export interface BridgeAccount extends Account {
  /** когда ключ перестанет действовать (Bybit ограничивает срок ключей без привязки к IP) */
  expiresAt?: number
}

/** Ход фоновой загрузки счёта */
export interface AccountStatus {
  busy: boolean
  /** доля сделанного в текущей загрузке, 0…1 */
  progress: number
  /** когда история последний раз была загружена до конца; 0 — ещё ни разу */
  pulledAt: number
  /** растёт, когда у счёта меняются сделки или состояние: журналу пора их перечитать */
  rev: number
  error?: BridgeErrorCode
  message?: string
}

export interface Hello {
  version: string
  protocol: number
  accounts: BridgeAccount[]
  status: Record<string, AccountStatus>
}

export interface AccountData {
  trades: Trade[]
  snapshot?: Snapshot
  /** время самого раннего загруженного исполнения — сделки старше мост не знает; 0 — исполнений нет */
  earliest: number
  rev: number
}

export type BridgeErrorCode =
  /** расширение не установлено или не отвечает */
  | 'absent'
  /** расширение обновилось — страницу нужно перезагрузить */
  | 'reload'
  /** сайту нельзя обращаться к мосту */
  | 'forbidden'
  | 'no-account'
  /** ключ не подходит: удалён, истёк или не хватает прав */
  | 'auth'
  /** биржа недоступна из этого региона */
  | 'geo'
  | 'rate'
  | 'network'
  | 'exchange'
  | 'bad-request'

export type BridgeResponse<T = unknown> = { ok: true; data: T } | { ok: false; error: BridgeErrorCode; message?: string }

export const EXCHANGES: { id: ExchangeId; name: string; markets: string }[] = [
  { id: 'binance', name: 'Binance', markets: 'USDⓈ-M Futures' },
  { id: 'bybit', name: 'Bybit', markets: 'USDT / USDC Perpetual' },
]

export type { Snapshot }
