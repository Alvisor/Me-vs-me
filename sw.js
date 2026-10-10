// Funciona sin conexión en el gimnasio.
const CACHE = 'mevsme-v7';
const CORE = ['./', 'index.html', 'styles.css', 'js/app.js', 'js/data.js', 'js/logic.js', 'manifest.webmanifest', 'icon.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Stale-while-revalidate: responde desde caché y actualiza en segundo plano.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(async (c) => {
    const hit = await c.match(e.request);
    const net = fetch(e.request).then((res) => {
      if (res.ok) c.put(e.request, res.clone());
      return res;
    }).catch(() => hit);
    return hit || net;
  }));
});
