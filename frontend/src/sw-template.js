/* App shell only. External media and user files never enter Cache Storage. */
const CACHE = 'vibeload-shell-__CACHE_VERSION__'
const FILES = __PRECACHE_FILES__
const PATHS = new Set(FILES)
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)))
})
self.addEventListener('activate', event => {
  event.waitUntil(Promise.all([
    caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('vibeload-shell-') && key !== CACHE).map(key => caches.delete(key)))),
    self.clients.claim(),
  ]))
})
self.addEventListener('message', event => {
  if (event.data === 'ACTIVATE_UPDATE') self.skipWaiting()
})
self.addEventListener('fetch', event => {
  const { request } = event
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.search) return
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () => (await caches.open(CACHE)).match('/index.html')))
    return
  }
  if (PATHS.has(url.pathname)) {
    event.respondWith(caches.open(CACHE).then(async cache => (await cache.match(url.pathname)) || fetch(request)))
  }
})
