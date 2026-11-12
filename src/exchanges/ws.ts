import { ref } from 'vue'

type Handler = (msg: any) => void

export interface StreamConfig {
  /** Адреса по приоритету; при неудачном подключении берётся следующий */
  urls: string[]
  encodeSub(topics: string[], id: number): unknown
  encodeUnsub(topics: string[], id: number): unknown
  /** Тема, к которой относится входящее сообщение */
  topicOf(msg: any): string | undefined
  /** Если сообщение — отказ в подписке, возвращает id отклонённого запроса */
  failedId(msg: any): number | undefined
  /** Прикладной ping: по ответу на него проверяем, что соединение живо */
  ping(id: number): unknown
  pingMs: number
  maxTopicsPerMsg: number
  /** Минимальный интервал между исходящими сообщениями (лимиты бирж) */
  sendGapMs: number
}

export type SocketStatus = 'idle' | 'connecting' | 'open' | 'closed'

const IDLE_CLOSE_MS = 10_000
const MAX_BACKOFF_MS = 15_000

/**
 * Одно WebSocket-соединение на биржу/рынок с подсчётом подписчиков по темам,
 * автопереподключением и восстановлением подписок.
 */
export class StreamSocket {
  readonly status = ref<SocketStatus>('idle')

  private ws: WebSocket | null = null
  private handlers = new Map<string, Set<Handler>>()
  /** Темы, подписка на которые уже отправлена в текущем соединении */
  private sent = new Set<string>()
  /** Темы запросов на подписку, ещё не подтверждённых сервером: id запроса -> темы */
  private pending = new Map<number, string[]>()
  /** Темы, которые биржа не принимает (например, инструмента не существует) */
  private bad = new Set<string>()
  private outbox: string[] = []
  private sendTimer = 0
  private syncTimer = 0
  private reconnectTimer = 0
  private pingTimer = 0
  private idleTimer = 0
  private probeTimer = 0
  private retry = 0
  private urlIdx = 0
  private lastMsg = 0
  private everOpened = false
  private nextId = 1
  private reconnectCbs = new Set<() => void>()

  constructor(private cfg: StreamConfig) {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') this.onResume()
      })
      window.addEventListener('online', () => this.onResume())
    }
  }

  subscribe(topic: string, handler: Handler): () => void {
    let set = this.handlers.get(topic)
    if (!set) this.handlers.set(topic, (set = new Set()))
    set.add(handler)
    clearTimeout(this.idleTimer)
    this.idleTimer = 0
    if (!this.ws) this.connect()
    else this.scheduleSync()
    let done = false
    return () => {
      if (done) return
      done = true
      const s = this.handlers.get(topic)
      if (!s) return
      s.delete(handler)
      if (s.size === 0) {
        this.handlers.delete(topic)
        this.scheduleSync()
      }
    }
  }

  /** Вызывается после восстановления оборванного соединения — повод дозагрузить пропущенные данные */
  onReconnect(cb: () => void): () => void {
    this.reconnectCbs.add(cb)
    return () => this.reconnectCbs.delete(cb)
  }

  private connect() {
    if (this.ws) return
    clearTimeout(this.reconnectTimer)
    this.reconnectTimer = 0
    this.status.value = 'connecting'
    const url = this.cfg.urls[this.urlIdx % this.cfg.urls.length]
    let ws: WebSocket
    try {
      ws = new WebSocket(url)
    } catch {
      this.scheduleReconnect(true)
      return
    }
    this.ws = ws
    let opened = false
    ws.onopen = () => {
      if (this.ws !== ws) return
      opened = true
      this.retry = 0
      this.lastMsg = Date.now()
      this.sent.clear()
      this.outbox.length = 0
      this.status.value = 'open'
      this.sync()
      clearInterval(this.pingTimer)
      this.pingTimer = window.setInterval(() => this.heartbeat(), this.cfg.pingMs)
      if (this.everOpened) this.reconnectCbs.forEach((cb) => cb())
      this.everOpened = true
    }
    ws.onmessage = (ev) => {
      this.lastMsg = Date.now()
      let msg: any
      try {
        msg = JSON.parse(ev.data as string)
      } catch {
        return
      }
      const topic = this.cfg.topicOf(msg)
      if (topic === undefined) {
        if (this.pending.size) this.onRejected(this.cfg.failedId(msg))
        return
      }
      const set = this.handlers.get(topic)
      if (set) for (const h of set) h(msg)
    }
    ws.onclose = () => {
      if (this.ws !== ws) return
      this.teardown()
      if (this.handlers.size > 0) this.scheduleReconnect(!opened)
      else this.status.value = 'idle'
    }
    ws.onerror = () => {
      /* за ошибкой всегда следует close */
    }
  }

  private teardown() {
    const ws = this.ws
    this.ws = null
    if (ws) {
      ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null
      try {
        ws.close()
      } catch {
        /* уже закрыт */
      }
    }
    clearInterval(this.pingTimer)
    clearTimeout(this.sendTimer)
    clearTimeout(this.probeTimer)
    this.pingTimer = this.sendTimer = this.probeTimer = 0
    this.sent.clear()
    this.pending.clear()
    this.outbox.length = 0
    this.status.value = 'closed'
  }

  private scheduleReconnect(rotateUrl: boolean) {
    if (rotateUrl) this.urlIdx++
    if (this.reconnectTimer) return
    const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** this.retry++)
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = 0
      if (this.handlers.size > 0) this.connect()
      else this.status.value = 'idle'
    }, delay)
  }

  private forceReconnect() {
    this.teardown()
    this.retry = 0
    clearTimeout(this.reconnectTimer)
    this.reconnectTimer = 0
    if (this.handlers.size > 0) this.connect()
    else this.status.value = 'idle'
  }

  private heartbeat() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return
    if (Date.now() - this.lastMsg > this.cfg.pingMs * 2 + 5000) {
      this.forceReconnect()
      return
    }
    this.enqueue(this.cfg.ping(this.nextId++))
  }

  private onResume() {
    if (this.handlers.size === 0) return
    if (!this.ws || this.ws.readyState > WebSocket.OPEN) {
      this.forceReconnect()
      return
    }
    if (this.ws.readyState !== WebSocket.OPEN || Date.now() - this.lastMsg < 5000) return
    // Вкладка была в фоне: соединение могло «зависнуть». Проверяем его ping-ом.
    const seen = this.lastMsg
    this.enqueue(this.cfg.ping(this.nextId++))
    clearTimeout(this.probeTimer)
    this.probeTimer = window.setTimeout(() => {
      if (this.lastMsg === seen) this.forceReconnect()
    }, 4000)
  }

  private scheduleSync() {
    if (this.syncTimer) return
    this.syncTimer = window.setTimeout(() => {
      this.syncTimer = 0
      this.sync()
    }, 20)
  }

  /** Приводит подписки на сервере к текущему набору тем */
  private sync() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return
    const add: string[] = []
    const del: string[] = []
    for (const t of this.bad) if (!this.handlers.has(t)) this.bad.delete(t)
    for (const t of this.handlers.keys()) if (!this.sent.has(t) && !this.bad.has(t)) add.push(t)
    for (const t of this.sent) if (!this.handlers.has(t)) del.push(t)
    const n = this.cfg.maxTopicsPerMsg
    for (let i = 0; i < del.length; i += n) {
      const chunk = del.slice(i, i + n)
      chunk.forEach((t) => this.sent.delete(t))
      this.enqueue(this.cfg.encodeUnsub(chunk, this.nextId++))
    }
    for (let i = 0; i < add.length; i += n) {
      this.sendSub(add.slice(i, i + n))
    }
    if (this.handlers.size === 0 && !this.idleTimer) {
      // Никто не слушает — держим соединение недолго на случай быстрой переподписки
      this.idleTimer = window.setTimeout(() => {
        this.idleTimer = 0
        if (this.handlers.size === 0) {
          this.teardown()
          this.status.value = 'idle'
        }
      }, IDLE_CLOSE_MS)
    }
  }

  private sendSub(topics: string[]) {
    const id = this.nextId++
    topics.forEach((t) => this.sent.add(t))
    this.pending.set(id, topics)
    if (this.pending.size > 64) this.pending.delete(this.pending.keys().next().value!)
    this.enqueue(this.cfg.encodeSub(topics, id))
  }

  /**
   * Биржа отклоняет запрос целиком, если в нём есть хоть одна неверная тема.
   * Повторяем темы по одной: рабочие подпишутся, неверная будет помечена и больше не запрашивается.
   */
  private onRejected(id: number | undefined) {
    if (id === undefined) return
    const topics = this.pending.get(id)
    if (!topics) return
    this.pending.delete(id)
    topics.forEach((t) => this.sent.delete(t))
    if (topics.length === 1) {
      this.bad.add(topics[0])
      return
    }
    for (const t of topics) if (this.handlers.has(t)) this.sendSub([t])
  }

  private enqueue(msg: unknown) {
    this.outbox.push(JSON.stringify(msg))
    if (!this.sendTimer) this.pump()
  }

  private pump = () => {
    this.sendTimer = 0
    const ws = this.ws
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    const next = this.outbox.shift()
    if (next === undefined) return
    ws.send(next)
    // Таймер держится и при пустой очереди: следующее сообщение не уйдёт раньше паузы
    this.sendTimer = window.setTimeout(this.pump, this.cfg.sendGapMs)
  }
}
