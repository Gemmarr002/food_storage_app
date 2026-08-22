// 食光 PWA Service Worker：静态资源缓存优先，页面导航网络优先、离线回退
const CACHE = 'shiguang-v1.4-20260821'
const APP_SHELL = ['/', '/chat', '/manifest.webmanifest', '/food-icon.svg', '/icon-192.png', '/icon-512.png']

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(APP_SHELL)).then(() => self.skipWaiting()).catch(() => {})
  )
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', e => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== location.origin) return

  // 带哈希的构建产物与图片：缓存优先
  if (url.pathname.startsWith('/_next/static') || url.pathname.startsWith('/icon') || url.pathname.startsWith('/food-icon') || /\.(png|svg|jpg|jpeg|webp|woff2?)$/.test(url.pathname)) {
    e.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => {
        const cp = res.clone()
        caches.open(CACHE).then(c => c.put(req, cp))
        return res
      }))
    )
    return
  }

  // 页面导航：网络优先，离线回退到已缓存首页
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(res => {
        const cp = res.clone()
        caches.open(CACHE).then(c => c.put('/', cp))
        return res
      }).catch(() => caches.match('/'))
    )
  }
})
