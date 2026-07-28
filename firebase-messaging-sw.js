/* firebase-messaging-sw.js — إشعارات الخلفية (data-only، موثوق على أندرويد) */
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey:"AIzaSyDevHwoNCKXGm-G8GJc_Z5eZwcSPuQS9wI",
  authDomain:"rafinag-157d2.firebaseapp.com",
  databaseURL:"https://rafinag-157d2-default-rtdb.europe-west1.firebasedatabase.app",
  projectId:"rafinag-157d2",
  storageBucket:"rafinag-157d2.firebasestorage.app",
  messagingSenderId:"335646681403",
  appId:"1:335646681403:web:0b58e844426e0055b86f1e"
});

const messaging=firebase.messaging();

/* الحمولة data-only → نعرض الإشعار يدوياً من data */
messaging.onBackgroundMessage(payload=>{
  const d=(payload&&payload.data)||{};
  self.registration.showNotification(d.title||'GoldPro',{
    body:d.body||'',
    icon:'./icon-192.png',
    badge:'./icon-192.png',
    dir:'rtl',
    lang:'ar',
    tag:'goldpro-'+Date.now(),
    renotify:true,
    requireInteraction:false,
    data:{url:d.url||'./'}
  });
});

self.addEventListener('notificationclick',e=>{
  e.notification.close();
  const url=(e.notification.data&&e.notification.data.url)||'./';
  e.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{
    for(const c of list){ if('focus' in c) return c.focus(); }
    return clients.openWindow(url);
  }));
});
