/* sw.js — Cache-First للأصول (يعمل أوفلاين تماماً) + شبكة حيّة للبيانات */
/* عزل الكاش لكل تطبيق على نفس النطاق (كان يحذف كاش التطبيقات الأخرى) */
const NS = (() => { try {
  const seg = self.location.pathname.replace(/\/[^/]*$/,'').split('/').filter(Boolean).pop() || 'root';
  return String(seg).toLowerCase().replace(/[^a-z0-9_-]/g,'');
} catch(e){ return 'root'; } })();
const CACHE_PREFIX = 'goldpro@' + NS + '-';
const CACHE = CACHE_PREFIX + 'v384';
const ASSETS = [
  './','./index.html',
  './style.css?v=384',
  './firebase.js?v=384','./app.js?v=384','./assistant.js?v=384',
  './inventory.js?v=384','./invoice.js?v=384','./raffinage.js?v=384',
  './workshops.js?v=384','./auth.js?v=384',
  './manifest.json',
  './icons/icon-192.png','./icons/icon-512.png',
  './icons/icon-512-maskable.png','./icons/icon-180.png',
  /* مكتبات Firebase الخارجية — بدونها لا يقلع التطبيق أوفلاين */
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-database-compat.js',
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js',
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-storage-compat.js',
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
  /* لا تعترض ملفات/نطاق الإشعارات — يجب أن تصل طازجة دائماً */
  if (url.pathname.includes('firebase-messaging-sw') ||
      url.pathname.includes('firebase-cloud-messaging-push-scope') ||
      url.pathname.endsWith('/sw.js') || url.pathname.endsWith('sw.js')) return;

  /* مكتبات Firebase من gstatic: cache-first (تُخزَّن مرة، تُقرأ أوفلاين) */
  const _isGstatic = url.origin === 'https://www.gstatic.com';
  const _sameOrigin = url.origin === self.location.origin;
  if (!_sameOrigin && !_isGstatic) return;   /* لا تعترض RTDB/APIs — تحتاج شبكة حيّة */

  /* استعلامات قاعدة البيانات الحيّة (google/firebaseio) لا تُخزَّن — تمرّ مباشرة */
  if (url.hostname.includes('firebaseio.com') ||
      url.hostname.includes('googleapis.com') ||
      url.hostname.includes('identitytoolkit')) return;

  /* الأصول (HTML/JS/CSS/أيقونات/مكتبات): cache-first — سريع ويعمل أوفلاين تماماً.
     نقرأ من الكاش فوراً، ونحدّث الكاش في الخلفية إن توفّرت الشبكة. */
  e.respondWith(
    caches.open(CACHE).then(c =>
      c.match(e.request).then(cached => {
        const net = fetch(e.request).then(res => {
          if (res && res.ok) c.put(e.request, res.clone());
          return res;
        }).catch(() => cached);
        /* إن وُجد في الكاش: أعده فوراً (أوفلاين/سريع)، والشبكة تحدّث بصمت */
        if (cached) return cached;
        /* لا نسخة مطابقة: للتنقّل (فتح التطبيق) اخدم index.html من الكاش —
           يضمن إقلاع التطبيق أوفلاين مهما اختلف شكل الرابط (معاملات، مسار). */
        return net.catch(() => null).then(r => {
          if (r) return r;
          if (e.request.mode === 'navigate' || (e.request.headers.get('accept')||'').includes('text/html')) {
            return c.match('./index.html') || c.match('./');
          }
          return undefined;
        });
      })
    )
  );
});
