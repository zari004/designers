// EXON PWA Service Worker
// Versiyani o'zgartirish → eski kesh o'chib yangilanadi
const CACHE_VER  = 'exon-v45';
const SHELL_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.svg',
  '/icons/icon.svg',
  '/icons/icon-maskable.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable.png',
  '/css/style.css',
  '/js/firebase.js',
  '/js/data.js',
  '/js/auth.js',
  '/js/ui.js',
  '/js/editor.js',
  '/js/notion.js',
  '/js/sheets.js',
  '/js/ai.js',
  '/js/app.js',
];

// ── O'RNATISH: barcha asosiy fayllarni keshga yozish ──
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_VER)
      .then(c => c.addAll(SHELL_URLS))
      .then(() => self.skipWaiting())
  );
});

// ── FAOLLASHTIRISH: eski versiyalarni o'chirish ──
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_VER).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ── FETCH: so'rovlarni ushlab kesh orqali xizmat qilish ──
self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);

  // Faqat GET so'rovlarini keshlaymiz
  if (req.method !== 'GET') return;

  // GitHub API va boshqa tashqi API'larni o'tkazib yuborish (hech qachon keshlamaymiz)
  if (url.hostname === 'api.github.com' || url.pathname.includes('notion-proxy')) return;

  // Google Fonts va CDN uchun: keshda bor → keshdan, yo'q → tarmoqdan, muvaffaqiyatli bo'lsa keshla
  if (url.hostname.includes('fonts.') || url.hostname.includes('flaticon') || url.hostname.includes('cdn-uicons')) {
    e.respondWith(
      caches.match(req).then(cached => {
        if (cached) return cached;
        return fetch(req).then(res => {
          if (!res || res.status !== 200) return res;
          const clone = res.clone();
          caches.open(CACHE_VER).then(c => c.put(req, clone));
          return res;
        }).catch(() => cached);
      })
    );
    return;
  }

  // HTML sahifalar: tarmoq birinchi, oflayn bo'lsa → keshdan
  if (req.headers.get('accept')?.includes('text/html')) {
    e.respondWith(
      fetch(req).then(res => {
        const clone = res.clone();
        caches.open(CACHE_VER).then(c => c.put(req, clone));
        return res;
      }).catch(() => caches.match('/index.html'))
    );
    return;
  }

  // JS / CSS: tarmoq birinchi (har doim eng yangi kod), oflayn bo'lsa → keshdan
  // Shu tufayli foydalanuvchi hech qachon eski versiyada qolib ketmaydi
  if (/\.(js|css)(\?|$)/i.test(url.pathname) || url.pathname === '/manifest.json') {
    e.respondWith(
      fetch(req).then(res => {
        if (res && res.status === 200 && res.type !== 'opaque') {
          const clone = res.clone();
          caches.open(CACHE_VER).then(c => c.put(req, clone));
        }
        return res;
      }).catch(() => caches.match(req))
    );
    return;
  }

  // Rasmlar va boshqalar: kesh birinchi, yo'q bo'lsa tarmoqdan tortib keshlaymiz
  e.respondWith(
    caches.match(req).then(cached => {
      const network = fetch(req).then(res => {
        if (!res || res.status !== 200 || res.type === 'opaque') return res;
        const clone = res.clone();
        caches.open(CACHE_VER).then(c => c.put(req, clone));
        return res;
      });
      return cached || network;
    })
  );
});

// ── PUSH BILDIRISHNOMALAR ──
self.addEventListener('push', e => {
  let data = { title: 'EXON', body: 'Yangi xabar bor', icon: '/icons/icon.svg' };
  try { data = { ...data, ...e.data.json() }; } catch {}
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon || '/icons/icon.svg',
      badge: '/icons/icon.svg',
      vibrate: [200, 100, 200],
      data: { url: data.url || '/' },
    })
  );
});

// Bildirishnomaga bosilganda tegishli sahifani ochish
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const target = e.notification.data?.url || '/';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const existing = list.find(c => c.url.includes(self.location.origin));
      if (existing) return existing.focus().then(c => c.navigate(target));
      return clients.openWindow(target);
    })
  );
});
