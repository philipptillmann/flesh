// Only public shell assets are cached. Never cache API traffic or health data.
const CACHE = 'flesh-shell-observations-v1';
const ASSETS = ['/', '/index.html', '/style.css', '/app.js', '/crypto.js', '/observations.js', '/icon-192.png', '/icon-192.png?v=muscle-1', '/icon-512.png?v=muscle-1', '/apple-touch-icon.png?v=muscle-1', '/favicon.png?v=muscle-1', '/manifest.webmanifest'];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS))));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch', e => {
  if(e.request.method !== 'GET' || new URL(e.request.url).origin !== self.location.origin || new URL(e.request.url).pathname.startsWith('/api/')) return;
  e.respondWith(fetch(e.request).catch(()=>caches.match(e.request)));
});
