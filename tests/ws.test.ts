import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StreamSocket, type StreamConfig } from '../src/exchanges/ws'

class FakeSocket {
  static all: FakeSocket[] = []
  static OPEN = 1
  readyState = 0
  sent: any[] = []
  onopen: (() => void) | null = null
  onmessage: ((e: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  constructor(public url: string) {
    FakeSocket.all.push(this)
  }
  send(data: string) {
    this.sent.push(JSON.parse(data))
  }
  close() {
    this.readyState = 3
  }
  // --- управление из теста ---
  open() {
    this.readyState = 1
    this.onopen?.()
  }
  receive(msg: unknown) {
    this.onmessage?.({ data: JSON.stringify(msg) })
  }
  drop() {
    this.readyState = 3
    this.onclose?.()
  }
}

const cfg: StreamConfig = {
  urls: ['wss://a.test', 'wss://b.test'],
  encodeSub: (args, id) => ({ op: 'sub', args, id }),
  encodeUnsub: (args, id) => ({ op: 'unsub', args, id }),
  topicOf: (m) => m.topic,
  failedId: (m) => (m.ok === false ? m.id : undefined),
  ping: (id) => ({ op: 'ping', id }),
  pingMs: 20_000,
  maxTopicsPerMsg: 10,
  sendGapMs: 100,
}

const last = () => FakeSocket.all[FakeSocket.all.length - 1]

beforeEach(() => {
  vi.useFakeTimers()
  FakeSocket.all = []
  vi.stubGlobal('window', globalThis)
  vi.stubGlobal('WebSocket', FakeSocket)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('StreamSocket', () => {
  it('подключается по первой подписке и шлёт темы одним сообщением', () => {
    const s = new StreamSocket(cfg)
    s.subscribe('a', () => {})
    s.subscribe('b', () => {})
    expect(FakeSocket.all).toHaveLength(1)
    last().open()
    expect(last().sent).toEqual([{ op: 'sub', args: ['a', 'b'], id: 1 }])
    expect(s.status.value).toBe('open')
  })

  it('доставляет сообщения подписчикам темы', () => {
    const s = new StreamSocket(cfg)
    const a = vi.fn()
    const b = vi.fn()
    s.subscribe('a', a)
    s.subscribe('b', b)
    last().open()
    last().receive({ topic: 'a', v: 1 })
    expect(a).toHaveBeenCalledWith({ topic: 'a', v: 1 })
    expect(b).not.toHaveBeenCalled()
  })

  it('считает подписчиков: отписка уходит на биржу только с последним', () => {
    const s = new StreamSocket(cfg)
    const off1 = s.subscribe('a', () => {})
    const off2 = s.subscribe('a', () => {})
    last().open()
    expect(last().sent).toHaveLength(1)
    off1()
    vi.advanceTimersByTime(500)
    expect(last().sent).toHaveLength(1)
    off2()
    off2() // повторный вызов безвреден
    vi.advanceTimersByTime(500)
    expect(last().sent[1]).toEqual({ op: 'unsub', args: ['a'], id: 2 })
  })

  it('соблюдает паузу между исходящими сообщениями', () => {
    const s = new StreamSocket(cfg)
    s.subscribe('a', () => {})
    last().open()
    s.subscribe('b', () => {})
    vi.advanceTimersByTime(30) // сработала синхронизация, но пауза ещё не прошла
    expect(last().sent).toHaveLength(1)
    vi.advanceTimersByTime(100)
    expect(last().sent).toHaveLength(2)
  })

  it('отклонённую пачку переподписывает по одной теме и больше не шлёт неверную', () => {
    const s = new StreamSocket(cfg)
    const good = vi.fn()
    s.subscribe('good', good)
    s.subscribe('bad', () => {})
    last().open()
    last().receive({ ok: false, id: 1 })
    vi.advanceTimersByTime(500)
    expect(last().sent.slice(1)).toEqual([
      { op: 'sub', args: ['good'], id: 2 },
      { op: 'sub', args: ['bad'], id: 3 },
    ])
    last().receive({ ok: false, id: 3 })
    last().receive({ topic: 'good' })
    expect(good).toHaveBeenCalledTimes(1)
    // новая подписка не тянет за собой отвергнутую тему
    s.subscribe('other', () => {})
    vi.advanceTimersByTime(500)
    expect(last().sent[3]).toEqual({ op: 'sub', args: ['other'], id: 4 })
  })

  it('после обрыва переподключается, восстанавливает подписки и сообщает об этом', () => {
    const s = new StreamSocket(cfg)
    const onReconnect = vi.fn()
    s.onReconnect(onReconnect)
    s.subscribe('a', () => {})
    last().open()
    expect(onReconnect).not.toHaveBeenCalled()
    last().drop()
    expect(s.status.value).toBe('closed')
    vi.advanceTimersByTime(1000)
    expect(FakeSocket.all).toHaveLength(2)
    expect(last().url).toBe('wss://a.test') // соединение работало — адрес не меняем
    last().open()
    expect(last().sent[0]).toMatchObject({ op: 'sub', args: ['a'] })
    expect(onReconnect).toHaveBeenCalledTimes(1)
  })

  it('если адрес не отвечает, пробует следующий', () => {
    const s = new StreamSocket(cfg)
    s.subscribe('a', () => {})
    last().drop() // закрылось, не успев открыться
    vi.advanceTimersByTime(1000)
    expect(last().url).toBe('wss://b.test')
  })

  it('закрывает соединение, когда подписчиков не осталось', () => {
    const s = new StreamSocket(cfg)
    const off = s.subscribe('a', () => {})
    last().open()
    off()
    vi.advanceTimersByTime(11_000)
    expect(last().readyState).toBe(3)
    expect(s.status.value).toBe('idle')
  })

  it('молчащее соединение считается мёртвым и пересоздаётся', () => {
    const s = new StreamSocket(cfg)
    s.subscribe('a', () => {})
    last().open()
    vi.advanceTimersByTime(20_000) // первый ping
    expect(last().sent.some((m) => m.op === 'ping')).toBe(true)
    vi.advanceTimersByTime(40_000) // ответа так и нет
    expect(FakeSocket.all.length).toBeGreaterThan(1)
  })

  it('зависшее подключение бросает и пробует следующий адрес', () => {
    const s = new StreamSocket(cfg)
    s.subscribe('a', () => {})
    expect(last().url).toBe('wss://a.test')
    // соединение не открылось и не закрылось: ни одного события
    vi.advanceTimersByTime(10_000)
    expect(s.status.value).toBe('closed')
    vi.advanceTimersByTime(1000)
    expect(FakeSocket.all).toHaveLength(2)
    expect(last().url).toBe('wss://b.test')
    last().open()
    expect(last().sent).toEqual([{ op: 'sub', args: ['a'], id: 1 }])
  })

  it('после возвращения приложения давно молчащее соединение пересоздаётся сразу', () => {
    const s = new StreamSocket(cfg)
    const again = vi.fn()
    s.onReconnect(again)
    s.subscribe('a', () => {})
    last().open()
    // приложение было заморожено: таймеры стояли, а время шло
    vi.setSystemTime(Date.now() + 10 * 60_000)
    s.resume()
    expect(FakeSocket.all).toHaveLength(2)
    last().open()
    expect(last().sent).toEqual([{ op: 'sub', args: ['a'], id: 2 }])
    expect(again).toHaveBeenCalledTimes(1)
  })

  it('после короткого отсутствия соединение проверяется ping-ом и остаётся, если отвечает', () => {
    const s = new StreamSocket(cfg)
    s.subscribe('a', () => {})
    last().open()
    vi.advanceTimersByTime(8000)
    s.resume()
    vi.advanceTimersByTime(200)
    expect(last().sent.some((m) => m.op === 'ping')).toBe(true)
    last().receive({ pong: true })
    vi.advanceTimersByTime(5000)
    expect(FakeSocket.all).toHaveLength(1)
  })

  it('после короткого отсутствия молчащее на проверку соединение пересоздаётся', () => {
    const s = new StreamSocket(cfg)
    s.subscribe('a', () => {})
    last().open()
    vi.setSystemTime(Date.now() + 8000)
    s.resume()
    vi.advanceTimersByTime(3500)
    expect(FakeSocket.all).toHaveLength(2)
  })

  it('подключение, повисшее до возвращения приложения, заменяется новым', () => {
    const s = new StreamSocket(cfg)
    s.subscribe('a', () => {})
    vi.setSystemTime(Date.now() + 60_000)
    s.resume()
    expect(FakeSocket.all).toHaveLength(2)
    expect(FakeSocket.all[0].readyState).toBe(3)
  })
})
