import type { Account, ExchangeId, Fill, Funding, Snapshot } from './types'

/**
 * Обмен между сайтом журнала и расширением-мостом.
 *
 * Сайт не видит ключей: он просит «догрузи историю счёта» или «дай состояние счёта», а мост сам
 * подписывает запросы к бирже и возвращает уже приведённые данные. Запросов, меняющих что-либо
 * на бирже, в протоколе нет.
 *
 * Сообщения идут через window.postMessage: страница → { to: BRIDGE, id, req },
 * мост → { from: BRIDGE, id, res }.
 */
export const BRIDGE = 'tvx-bridge'
export const PROTOCOL = 1

export type BridgeRequest =
  | { op: 'hello' }
  /** очередная порция истории; cursor — из предыдущего ответа, null — начать с момента since */
  | { op: 'pull'; account: string; since: number; cursor: PullCursor | null }
  | { op: 'snapshot'; account: string }
  /** открыть страницу расширения, где добавляют ключи */
  | { op: 'options' }

/** Где остановилась загрузка. Сайт его не разбирает — только возвращает мосту */
export type PullCursor = Record<string, unknown>

export interface Hello {
  version: string
  protocol: number
  accounts: BridgeAccount[]
}

export interface BridgeAccount extends Account {
  /** когда ключ перестанет действовать (Bybit ограничивает срок ключей без привязки к IP) */
  expiresAt?: number
}

export interface PullChunk {
  fills: Fill[]
  funding: Funding[]
  /** null — история загружена до текущего момента */
  next: PullCursor | null
  /** доля сделанного, 0…1 */
  progress: number
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
