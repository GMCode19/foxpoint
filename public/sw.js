// Fox Point - service worker
// 1) notifiche: le mostra e, al tocco, apre l'app nella sezione giusta
// 2) apertura senza rete: tiene una copia dell'app (la pagina si aggiorna sempre dalla rete quando c'è)
const CACHE = 'fx-app-v1'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k)
  await self.clients.claim()
})()))

self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url)
  if (r.method !== 'GET' || u.origin !== location.origin) return
  if (r.mode === 'navigate') {   // pagina: prima la rete, se manca la copia salvata
    e.respondWith(fetch(r).then(res => {
      if (res.ok) { const c = res.clone(); caches.open(CACHE).then(x => x.put('./', c)) }
      return res
    }).catch(() => caches.match('./')))
    return
  }
  if (u.pathname.includes('/assets/') || /\.(png|webmanifest)$/.test(u.pathname)) {   // file con nome univoco: prima la copia
    e.respondWith(caches.match(r).then(m => m || fetch(r).then(res => {
      if (res.ok) { const c = res.clone(); caches.open(CACHE).then(x => x.put(r, c)) }
      return res
    })))
  }
})

self.addEventListener('push', e => {
  let d = {}
  try { d = e.data ? e.data.json() : {} } catch { d = { body: e.data?.text() } }
  e.waitUntil(self.registration.showNotification(d.title || 'Fox Point', {
    body: d.body || '', icon: 'icon-192.png', badge: 'icon-192.png', tag: d.tag || undefined, data: { url: d.url || '' },
  }))
})

self.addEventListener('notificationclick', e => {
  e.notification.close()
  const target = new URL(e.notification.data?.url || '', self.registration.scope).href
  e.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const c of list) {
      if (c.url.startsWith(self.registration.scope)) {
        await c.focus()
        try { await c.navigate(target) } catch { c.postMessage({ type: 'open', url: target }) }
        return
      }
    }
    await self.clients.openWindow(target)
  })())
})
