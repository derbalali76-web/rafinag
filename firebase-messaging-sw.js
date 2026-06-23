/* firebase-messaging-sw.js — يعرض الإشعار والتطبيق مغلق */
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyDevHwoNCKXGm-G8GJc_Z5eZwcSPuQS9wI",
  authDomain: "rafinag-157d2.firebaseapp.com",
  projectId: "rafinag-157d2",
  storageBucket: "rafinag-157d2.firebasestorage.app",
  messagingSenderId: "335646681403",
  appId: "1:335646681403:web:0b58e844426e0055b86f1e"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const d = (payload && payload.data) || {};
  const title = d.title || 'فاتورة جديدة';
  const body  = d.body  || 'تم تسجيل فاتورة جديدة في حسابك';
  self.registration.showNotification(title, {
    body,
    icon: './icon-192.png',
    badge: './icon-192.png',
    dir: 'rtl',
    lang: 'ar',
    data: { url: './' }
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.matchAll({ type: 'window' }).then((list) => {
    for (const c of list) { if ('focus' in c) return c.focus(); }
    if (clients.openWindow) return clients.openWindow('./');
  }));
});
