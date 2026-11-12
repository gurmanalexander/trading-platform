// Кэш оболочки приложения. Запросы к биржам (другие домены) сюда не попадают — данные всегда живые.
const CACHE = 'svecha-v1'
// Статика не зависит от заголовков запроса, а сервер может слать Vary: Origin — из-за него кэш «не находит» файл
const MATCH = { ignoreVary: true }

// При установке сразу кладём в кэш страницу и её файлы — приложение открывается и без сети
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE)
      const res = await fetch('./', { cache: 'no-cache' })
      if (!res.ok) return
      await cache.put('./', res.clone())
      const html = await res.text()
      const assets = [...html.matchAll(/(?:src|href)="(\.\/assets\/[^"]+)"/g)].map((m) => m[1])
      await cache.addAll(assets)
      // файлы прошлых версий больше не нужны
      const keep = new Set(assets.map((a) => new URL(a, self.registration.scope).href))
      for (const req of await cache.keys()) {
        if (req.url.includes('/assets/') && !keep.has(req.url)) await cache.delete(req)
      }
    })()
      .catch(() => {})
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  // Файлы сборки имеют хэш в имени и не меняются — отдаём из кэша
  if (url.pathname.includes('/assets/')) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const hit = await cache.match(req, MATCH)
        if (hit) return hit
        const res = await fetch(req)
        if (res.ok) cache.put(req, res.clone())
        return res
      }),
    )
    return
  }

  // Страница и остальное: сначала сеть (чтобы обновления приходили сразу), без сети — кэш
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone()
          caches.open(CACHE).then((cache) => cache.put(req, copy))
        }
        return res
      })
      .catch(async () => {
        const hit = (await caches.match(req, MATCH)) || (req.mode === 'navigate' ? await caches.match('./', MATCH) : undefined)
        return hit || Response.error()
      }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) if ('focus' in c) return c.focus()
      return self.clients.openWindow('./')
    }),
  )
})
