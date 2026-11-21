// Funciona sin conexión en el gimnasio, pero siempre intenta cargar la última versión.
const CACHE = 'mevsme-v9';
const CORE = ['./', 'index.html', 'styles.css', 'js/app.js', 'js/data.js', 'js/logic.js', 'manifest.webmanifest', 'icon.svg'];

self.addEventListener('install', (e) => {
  // cache: 'reload' evita que el navegador sirva copias viejas de su propia caché HTTP.
  e.waitUntil(caches.open(CACHE)
    .then((c) => c.addAll(CORE.map((u) => new Request(u, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Código (HTML, JS, CSS): primero la red, con 3 s de margen; si no hay conexión, la caché.
// Imágenes: primero la caché, porque no cambian.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  const isImage = /\.(jpe?g|png|svg|webp)$/i.test(url.pathname);
  e.respondWith(caches.open(CACHE).then(async (c) => {
    const hit = await c.match(e.request);
    const net = fetch(e.request, { cache: 'no-cache' }).then((res) => {
      if (res.ok) c.put(e.request, res.clone());
      return res;
    });
    if (isImage) return hit || net;
    const timeout = new Promise((resolve) => setTimeout(() => resolve(null), 3000));
    try {
      return (await Promise.race([net, timeout])) || hit || await net;
    } catch {
      return hit || Response.error();
    }
  }));
});
