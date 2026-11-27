import { describe, expect, it } from 'vitest'
// @ts-expect-error учебная биржа — обычный скрипт без описания типов
import { MOCK_SECRET, createMock } from '../scripts/mock-exchange-core.mjs'
import { bybit } from '../extension/src/exchanges/bybit'
import { importSecret, signerOf, type Ctx } from '../extension/src/exchanges/http'
import type { ExchangeClient } from '../extension/src/exchanges/types'
import { createHistory, type HistoryStore } from '../extension/src/history'
import { changedDocs, fingerprint, publishChanged } from '../extension/src/publish'
import { accountDocs, packTrade, unpackTrade, weekOf } from '../journal/src/core/pack'
import { buildTrades } from '../journal/src/core/positions'
import type { Account, Fill, Trade } from '../journal/src/core/types'
import { deriveKeys, docOf, newSyncCode, unseal, type NostrEvent } from '../src/lib/nostr'

const DAY = 86_400_000
const START = Date.UTC(2026, 10, 27, 12)

/** Хранилище в памяти — вместо базы расширения */
function memoryStore(): HistoryStore & { kv: Map<string, unknown> } {
  const rows = { fills: new Map<string, any>(), funding: new Map<string, any>() }
  const kv = new Map<string, unknown>()
  return {
    kv,
    async putRows(kind, acct, list) {
      for (const r of list) rows[kind].set(acct + '|' + r.id, { ...r, a: acct })
    },
    async getRows(kind, acct) {
      return [...rows[kind].values()].filter((r) => r.a === acct).map(({ a: _a, ...rest }) => rest)
    },
    async clearRows(acct) {
      for (const kind of ['fills', 'funding'] as const) for (const [k, r] of rows[kind]) if (r.a === acct) rows[kind].delete(k)
    },
    get: async <T>(key: string) => structuredClone(kv.get(key)) as T | undefined,
    async set(key, value) {
      kv.set(key, structuredClone(value))
    },
    async del(key) {
      kv.delete(key)
    },
  }
}

async function setup() {
  let clock = START
  const mock = createMock({ now: () => clock })
  const ctx: Ctx = { apiKey: 'mock-bybit-read', sign: signerOf(await importSecret(MOCK_SECRET)), fetch: mock.fetch, now: () => clock, sleep: async () => {} }
  const store = memoryStore()
  const api = bybit(['http://m/bybit'], { page: 20 })
  return { mock, ctx, store, api, tick: (ms: number) => (clock += ms), now: () => clock }
}

describe('фоновая загрузка истории в расширении', () => {
  it('загружает историю до конца, собирает сделки и запоминает, когда обновлялась', async () => {
    const { mock, ctx, store, api, now } = await setup()
    const history = createHistory({ store, client: () => api, contextOf: async () => ({ exchange: 'bybit', ctx }), now })
    await history.pull('acc', 120)
    const st = (await history.status(['acc'])).acc
    expect(st).toMatchObject({ busy: false, progress: 1, pulledAt: START, rev: 1 })
    expect(st.error).toBeUndefined()
    const data = await history.data('acc')
    const expected = buildTrades(
      'acc',
      mock.dataset('demo-bybit').rows.filter((f: Fill) => f.t >= START - 120 * DAY).map((f: Fill) => ({ ...f, id: 'e-' + f.id })),
      [],
    )
    expect(data.trades).toHaveLength(expected.length)
    expect(data.trades.length).toBeGreaterThan(50)
    expect(data.earliest).toBeGreaterThanOrEqual(START - 120 * DAY)
    expect(data.snapshot?.positions[0]).toMatchObject({ sym: 'SOLUSDT' })
  })

  it('повторная загрузка без новостей ничего не меняет, со свежей сделкой — поднимает версию', async () => {
    const { mock, ctx, store, api, now, tick } = await setup()
    const history = createHistory({ store, client: () => api, contextOf: async () => ({ exchange: 'bybit', ctx }), now })
    await history.pull('acc', 60)
    const before = await history.data('acc')
    tick(5 * 60_000)
    await history.pull('acc', 60)
    expect((await history.data('acc')).rev).toBe(before.rev)
    expect((await history.status(['acc'])).acc.pulledAt).toBe(START + 5 * 60_000)

    tick(5 * 60_000)
    mock.addTrade('demo-bybit')
    await history.pull('acc', 60)
    const after = await history.data('acc')
    expect(after.rev).toBe(before.rev + 1)
    expect(after.trades).toHaveLength(before.trades.length + 1)
  })

  it('прерванная загрузка продолжается с места остановки, а не с начала', async () => {
    const { ctx, store, api, now } = await setup()
    let calls = 0
    let failAt = 3
    const flaky: ExchangeClient = {
      ...api,
      pull: (c, since, cursor) => {
        if (++calls === failAt) throw new Error('фоновую часть остановили')
        return api.pull(c, since, cursor)
      },
    }
    const history = createHistory({ store, client: () => flaky, contextOf: async () => ({ exchange: 'bybit', ctx }), now })
    await history.pull('acc', 90)
    const st1 = (await history.status(['acc'])).acc
    expect(st1.error).toBe('exchange')
    expect(st1.pulledAt).toBe(0)
    expect(st1.progress).toBeGreaterThan(0)
    const saved = store.kv.get('st:acc') as { cursor: unknown; since: number }
    expect(saved.cursor).toBeTruthy()

    failAt = -1
    const resumeFrom = calls
    await history.pull('acc', 90)
    const st2 = (await history.status(['acc'])).acc
    expect(st2).toMatchObject({ busy: false, progress: 1, pulledAt: START, rev: 1 })
    // вторая попытка не начинала заново: порций вместе со сбойной ровно на одну больше, чем у загрузки без сбоя
    const clean = await setup()
    let cleanCalls = 0
    const counting: ExchangeClient = { ...clean.api, pull: (c, s, cur) => (cleanCalls++, clean.api.pull(c, s, cur)) }
    const ref = createHistory({ store: clean.store, client: () => counting, contextOf: async () => ({ exchange: 'bybit', ctx: clean.ctx }), now: clean.now })
    await ref.pull('acc', 90)
    expect(calls).toBe(cleanCalls + 1)
    expect(resumeFrom).toBe(3)
    expect((await history.data('acc')).trades).toEqual((await ref.data('acc')).trades)
  })

  it('два одновременных запроса — одна загрузка; удалённый ключ — ошибка, а не зависание', async () => {
    const { ctx, store, api, now } = await setup()
    let pulls = 0
    const counting: ExchangeClient = { ...api, pull: (c, s, cur) => (pulls++, api.pull(c, s, cur)) }
    const history = createHistory({ store, client: () => counting, contextOf: async (id) => (id === 'acc' ? { exchange: 'bybit', ctx } : null), now })
    const a = history.pull('acc', 30)
    const b = history.pull('acc', 30)
    expect(a).toBe(b)
    expect((await history.status(['acc'])).acc.busy).toBe(true)
    await a
    const once = pulls
    await history.pull('gone', 30)
    expect((await history.status(['gone'])).gone.error).toBe('no-account')
    expect(pulls).toBe(once)
  })

  it('после удаления ключа от счёта ничего не остаётся', async () => {
    const { ctx, store, api, now } = await setup()
    const history = createHistory({ store, client: () => api, contextOf: async () => ({ exchange: 'bybit', ctx }), now })
    await history.pull('acc', 30)
    await history.forget('acc')
    expect(await store.getRows('fills', 'acc')).toEqual([])
    expect([...store.kv.keys()].filter((k) => k.endsWith(':acc'))).toEqual([])
    expect(await history.data('acc')).toMatchObject({ trades: [], rev: 0, earliest: 0 })
  })
})

const trade = (id: string, open: number, extra: Partial<Trade> = {}): Trade => ({
  id: `acc:BTCUSDT:L:${id}`,
  acct: 'acc',
  sym: 'BTCUSDT',
  side: 1,
  open,
  close: open + 60_000,
  entry: 100.123456789012,
  exit: 101,
  qty: 1,
  vol: 201,
  gross: 0.876543210988,
  fee: 0.1,
  funding: 0,
  fills: 2,
  ...extra,
})
const account: Account = { id: 'acc', exchange: 'bybit', label: 'Bybit', hint: 'read', addedAt: 1 }

describe('документы синхронизации', () => {
  it('сделка упаковывается и распаковывается без потерь, кроме лишних знаков', () => {
    const t = trade('e-7', 5 * DAY, { partial: true, side: -1, id: 'acc:BTCUSDT:S:e-7' })
    const back = unpackTrade('acc', JSON.parse(JSON.stringify(packTrade(t))))!
    expect(back).toMatchObject({ id: t.id, acct: 'acc', sym: 'BTCUSDT', side: -1, open: t.open, close: t.close, partial: true, fills: 2 })
    expect(back.entry).toBeCloseTo(t.entry, 6)
    expect(unpackTrade('acc', ['x', 'bad symbol!', 1])).toBeNull()
    expect(unpackTrade('acc', 'мусор')).toBeNull()
  })

  it('счёт раскладывается на документы: счёт, состояние и сделки по неделям', () => {
    const a = trade('1', 3 * DAY)
    const b = trade('2', 3 * DAY + 1000)
    const c = trade('3', 12 * DAY)
    const docs = accountDocs(account, [c, b, a], { at: 1, equity: 10, wallet: 10, upnl: 0, positions: [] })
    expect([...docs.keys()].sort()).toEqual(['a:acc', 's:acc', `t:acc:${weekOf(3 * DAY)}`, `t:acc:${weekOf(12 * DAY)}`].sort())
    expect(docs.get('a:acc')).toEqual({ id: 'acc', exchange: 'bybit', label: 'Bybit', hint: 'read', addedAt: 1 })
    // порядок внутри недели не зависит от порядка на входе — документ у журнала и у моста одинаковый
    expect((docs.get(`t:acc:${weekOf(3 * DAY)}`) as unknown[][]).map((x) => x[0])).toEqual(['1', '2'])
    expect(JSON.stringify([...accountDocs(account, [a, b, c])])).toBe(JSON.stringify([...accountDocs(account, [c, a, b])]))
  })

  it('отправляются только изменившиеся документы', () => {
    const docs = new Map<string, unknown>([
      ['a:acc', { x: 1 }],
      ['t:acc:1', [[1]]],
    ])
    const first = changedDocs(docs, {})
    expect(first.map((d) => d.id)).toEqual(['a:acc', 't:acc:1'])
    const sent = Object.fromEntries(first.map((d) => [d.id, [d.mark, 100] as [string, number]]))
    expect(changedDocs(docs, sent)).toEqual([])
    docs.set('t:acc:1', [[1], [2]])
    expect(changedDocs(docs, sent).map((d) => d.id)).toEqual(['t:acc:1'])
    expect(fingerprint('abc')).toBe(fingerprint('abc'))
    expect(fingerprint('abc')).not.toBe(fingerprint('abd'))
  })
})

/** Ретранслятор в памяти: принимает события и подтверждает их (или отказывает) */
function fakeRelays(opts: { accept?: (ev: NostrEvent) => boolean; down?: string[] } = {}) {
  const events: NostrEvent[] = []
  const socket = (url: string) => {
    const ws: any = { url, onopen: null, onmessage: null, onerror: null, onclose: null, close() {} }
    ws.send = (text: string) => {
      const [, ev] = JSON.parse(text)
      const ok = opts.accept ? opts.accept(ev) : true
      if (ok) events.push(ev)
      queueMicrotask(() => ws.onmessage?.({ data: JSON.stringify(['OK', ev.id, ok, ok ? '' : 'rate-limited']) }))
    }
    queueMicrotask(() => (opts.down?.includes(url) ? ws.onerror?.({}) : ws.onopen?.({})))
    return ws as WebSocket
  }
  return { events, socket }
}

describe('фоновая выгрузка для других устройств', () => {
  const deps = (store: HistoryStore, socket: (url: string) => WebSocket) => ({ store, now: () => START, sleep: async () => {}, socket })

  it('публикует документы в зашифрованном виде, а повторно — только изменившиеся', async () => {
    const store = memoryStore()
    const relays = fakeRelays()
    const code = newSyncCode()
    const target = { code, relays: ['wss://one', 'wss://two'] }
    const docs = accountDocs(account, [trade('1', 3 * DAY)])
    expect(await publishChanged(target, docs, deps(store, relays.socket))).toBe(2)
    // каждое событие ушло на оба ретранслятора
    expect(relays.events).toHaveLength(4)
    const keys = await deriveKeys(code + '/journal')
    const ev = relays.events.find((e) => docOf(e) === 'tvxj:a:acc')!
    expect(ev.pubkey).toBe(keys.pk)
    expect(ev.content).not.toContain('Bybit')
    expect(JSON.parse(await unseal(keys.aes, ev.content))).toEqual({ ts: START, v: docs.get('a:acc') })
    // ключи журнала отдельные от ключей tvx
    expect(keys.pk).not.toBe((await deriveKeys(code)).pk)

    relays.events.length = 0
    expect(await publishChanged(target, docs, deps(store, relays.socket))).toBe(0)
    expect(relays.events).toHaveLength(0)

    const more = accountDocs(account, [trade('1', 3 * DAY), trade('2', 3 * DAY + 5)])
    expect(await publishChanged(target, more, deps(store, relays.socket))).toBe(1)
    const again = relays.events.find((e) => docOf(e)?.startsWith('tvxj:t:acc:'))!
    // у заменяемого события время создания обязано расти, даже если часы стоят
    expect(again.created_at).toBeGreaterThan(Math.floor(START / 1000))
  })

  it('документ, который ретранслятор не принял, уходит при следующей попытке', async () => {
    const store = memoryStore()
    let refuse = true
    const relays = fakeRelays({ accept: (ev) => !(refuse && docOf(ev) === 'tvxj:a:acc') })
    const target = { code: newSyncCode(), relays: ['wss://one'] }
    const docs = accountDocs(account, [trade('1', 3 * DAY)])
    expect(await publishChanged(target, docs, deps(store, relays.socket))).toBe(1)
    refuse = false
    expect(await publishChanged(target, docs, deps(store, relays.socket))).toBe(1)
    expect(relays.events.map((e) => docOf(e)).sort()).toEqual(['tvxj:a:acc', `tvxj:t:acc:${weekOf(3 * DAY)}`].sort())
  })

  it('без связи и с неверным кодом ничего не отправляется и не считается отправленным', async () => {
    const store = memoryStore()
    const relays = fakeRelays({ down: ['wss://one'] })
    const docs = accountDocs(account, [trade('1', 3 * DAY)])
    const code = newSyncCode()
    expect(await publishChanged({ code, relays: ['wss://one'] }, docs, deps(store, relays.socket))).toBe(0)
    expect(await publishChanged({ code: 'не код', relays: ['wss://two'] }, docs, deps(store, relays.socket))).toBe(0)
    expect(relays.events).toHaveLength(0)
    // связь появилась — уходит всё
    expect(await publishChanged({ code, relays: ['wss://two'] }, docs, deps(store, relays.socket))).toBe(2)
  })
})
