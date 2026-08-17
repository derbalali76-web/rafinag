/* sw.js — Network-First مع Cache offline */
/* عزل الكاش لكل تطبيق على نفس النطاق (كان يحذف كاش التطبيقات الأخرى) */
const NS = (() => { try {
  const seg = self.location.pathname.replace(/\/[^/]*$/,'').split('/').filter(Boolean).pop() || 'root';
  return String(seg).toLowerCase().replace(/[^a-z0-9_-]/g,'');
} catch(e){ return 'root'; } })();
const CACHE_PREFIX = 'goldpro@' + NS + '-';
const CACHE = CACHE_PREFIX + 'v342';
const ASSETS = [
  './','./index.html',
  './firebase.js?v=342','./app.js?v=342','./assistant.js?v=342',
  './inventory.js?v=342','./invoice.js?v=342','./raffinage.js?v=342',
  './workshops.js?v=342','./auth.js?v=342',
  './manifest.json','./icon-192.png','./icon-512.png',
  './icon-512-maskable.png','./icon-180.png',
];
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => Promise.allSettled(ASSETS.map(u => c.add(u)))).then(() => self.skipWaiting())
  );
});
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k.startsWith(CACHE_PREFIX) && k !== CACHE).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;
  /* لا تعترض ملفات/نطاق الإشعارات — يجب أن تصل طازجة دائماً */
  if (url.pathname.includes('firebase-messaging-sw') ||
      url.pathname.includes('firebase-cloud-messaging-push-scope') ||
      url.pathname.endsWith('/sw.js') || url.pathname.endsWith('sw.js')) return;
  e.respondWith(
    fetch(e.request).then(res => {
      if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.open(CACHE).then(c => c.match(e.request)))
  );
});
