/* portal/sw.js — service worker خاص ببوابة الزبون (مستقل عن التطبيق الرئيسي).
   كاش-أولاً لقشرة البوابة (تعمل أوفلاين + قابلة للتثبيت)، والبيانات الحيّة تمرّ مباشرة.
   اسم الكاش يبدأ بـ "portal@" فلا يحذف كاش التطبيق الرئيسي ("goldpro@..."). */
const CACHE = 'portal@goldpro-v2';
const ASSETS = [
  './', './index.html', './manifest.json',
  './icon-192.png', './icon-512.png', './icon-180.png',
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-database-compat.js',
  'https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800;900&display=swap'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.allSettled(ASSETS.map(u => c.add(u)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(
    ks.filter(k => k.startsWith('portal@') && k !== CACHE).map(k => caches.delete(k))
  )).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  /* قاعدة البيانات الحيّة + المصادقة: لا تُعترض — تمرّ مباشرة للشبكة */
  if (url.hostname.includes('firebaseio') || url.hostname.includes('firebasedatabase') ||
      url.hostname.includes('googleapis.com') || url.hostname.includes('identitytoolkit')) return;
  const same = url.origin === self.location.origin;
  const gstatic = url.origin === 'https://www.gstatic.com';
  const gfonts = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (!same && !gstatic && !gfonts) return;
  e.respondWith(caches.open(CACHE).then(c => c.match(e.request).then(cached => {
    const net = fetch(e.request).then(r => { if (r && r.ok) c.put(e.request, r.clone()); return r; }).catch(() => cached);
    if (cached) return cached;
    return net.catch(() => null).then(r => {
      if (r) return r;
      if (e.request.mode === 'navigate') return c.match('./index.html');
      return undefined;
    });
  })));
});
