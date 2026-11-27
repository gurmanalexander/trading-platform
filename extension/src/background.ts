import { PROTOCOL, type BridgeRequest, type BridgeResponse, type Hello } from '../../journal/src/core/protocol'
import type { ExchangeId } from '../../journal/src/core/types'
import { HOSTS, VERSION, allowedSite } from './config'
import { binance } from './exchanges/binance'
import { bybit } from './exchanges/bybit'
import { BridgeError } from './exchanges/http'
import type { ExchangeClient } from './exchanges/types'
import { contextOf, listAccounts } from './vault'

/**
 * Фоновая часть моста. Принимает от страницы журнала только четыре вида запросов (см. протокол)
 * и отвечает уже готовыми данными. Проверяет, что запрос пришёл с разрешённого сайта, из его
 * основной вкладки (не из встроенного окна).
 */
const clients: Record<ExchangeId, ExchangeClient> = {
  binance: binance(HOSTS.binance),
  bybit: bybit(HOSTS.bybit),
}

async function handle(req: BridgeRequest): Promise<unknown> {
  switch (req?.op) {
    case 'hello':
      return { version: VERSION, protocol: PROTOCOL, accounts: await listAccounts() } satisfies Hello
    case 'options':
      await chrome.runtime.openOptionsPage()
      return true
    case 'pull':
    case 'snapshot': {
      if (typeof req.account !== 'string') throw new BridgeError('bad-request')
      const acc = await contextOf(req.account)
      if (!acc) throw new BridgeError('no-account')
      const client = clients[acc.exchange]
      if (req.op === 'snapshot') return client.snapshot(acc.ctx)
      if (typeof req.since !== 'number' || !isFinite(req.since) || req.since < 0) throw new BridgeError('bad-request')
      return client.pull(acc.ctx, req.since, req.cursor ?? null)
    }
    default:
      throw new BridgeError('bad-request')
  }
}

chrome.runtime.onMessage.addListener((req: BridgeRequest, sender, respond: (res: BridgeResponse) => void) => {
  const trusted = sender.id === chrome.runtime.id && sender.frameId === 0 && allowedSite(sender.url)
  if (!trusted) {
    respond({ ok: false, error: 'forbidden' })
    return false
  }
  handle(req).then(
    (data) => respond({ ok: true, data }),
    (e) => respond(e instanceof BridgeError ? { ok: false, error: e.code, message: e.message } : { ok: false, error: 'exchange', message: String(e?.message ?? e) }),
  )
  return true // ответ придёт позже
})

// значок расширения открывает страницу со счетами
chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage())
