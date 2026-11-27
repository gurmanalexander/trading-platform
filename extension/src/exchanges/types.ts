import type { PullChunk, PullCursor } from '../../../journal/src/core/protocol'
import type { Snapshot } from '../../../journal/src/core/types'
import type { Ctx } from './http'

/** Ключ отклонён: у него есть права, кроме чтения. flags — какие именно (названия биржи) */
export class KeyRejected extends Error {
  constructor(public flags: string[]) {
    super('key is not read-only: ' + flags.join(', '))
  }
}

/** Клиент биржи. Умеет только читать: методов, меняющих что-либо на бирже, в нём нет */
export interface ExchangeClient {
  /** Проверяет ключ: рабочий ли он и только ли для чтения. Бросает KeyRejected или BridgeError */
  verify(ctx: Ctx): Promise<{ expiresAt?: number }>
  /** Очередная порция истории начиная с since (или с места, записанного в cursor) */
  pull(ctx: Ctx, since: number, cursor: PullCursor | null): Promise<PullChunk>
  snapshot(ctx: Ctx): Promise<Snapshot>
}
