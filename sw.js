const CACHE = 'skylog-offline-v1';
const NAMES = ['SkyLog_Pietro', 'SkyLog_AmoreF', 'SkyLog_Marta'];

function canonicalKey(url) {
  const u = new URL(url);
  const seg = u.pathname.split('/').pop().replace(/\.html?$/i, '');
  if (!NAMES.includes(seg)) return null;
  return new URL(seg, self.registration.scope).href;
}

async function fetchFresh(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) return null;
  if (res.redirected) {
    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers: res.headers
    });
  }
  return res;
}

async function precacheAll() {
  const cache = await caches.open(CACHE);
  await Promise.all(NAMES.map(async name => {
    const key = new URL(name, self.registration.scope).href;
    for (const candidate of [name, `${name}.html`]) {
      try {
        const res = await fetchFresh(new URL(candidate, self.registration.scope).href);
        if (res) {
          await cache.put(key, res);
          return;
        }
      } catch (_) {}
    }
  }));
}

self.addEventListener('install', event => {
  event.waitUntil(precacheAll().then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('skylog-offline-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const reqUrl = new URL(event.request.url);
  if (reqUrl.origin !== self.location.origin) return;
  const key = canonicalKey(reqUrl.href);
  if (!key) return;

  event.respondWith((async () => {
    try {
      const res = await fetchFresh(reqUrl.href);
      if (res) {
        const copy = res.clone();
        event.waitUntil(caches.open(CACHE).then(c => c.put(key, copy)));
        return res;
      }
    } catch (_) {}
    const cached = await caches.match(key);
    if (cached) return cached;
    return fetch(event.request);
  })());
});
