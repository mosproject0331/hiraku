/**
 * HIRAKU のサービスワーカー。
 *
 * 現地（電波の弱いところ）で開けることが目的なので、
 * 一度見たページと部品は端末に残し、次からは通信が無くても立ち上がるようにする。
 * 置き場所（basePath）は自分の登録位置から拾うので、公開先が変わっても直さなくていい。
 */

const VERSION = 'hiraku-2026-08-22-1';
const SHELL = `${VERSION}-shell`;
const ASSETS = `${VERSION}-assets`;
const PAGES = `${VERSION}-pages`;
const SCOPE = new URL(self.registration.scope);

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(SHELL).then((c) =>
      // 入口だけは先に持っておく。ここが開ければ、あとは中で完結する
      c.addAll([SCOPE.pathname, `${SCOPE.pathname}app/`]).catch(() => undefined),
    ),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

/** 中身の入れ替わらない部品（ハッシュ付き）は、まず手元から出す */
function isImmutable(url) {
  return url.pathname.includes('/_next/static/');
}

function isAsset(url) {
  return /\.(?:js|css|woff2?|png|jpg|jpeg|svg|webp|ico|json)$/.test(url.pathname);
}

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res && res.ok) cache.put(req, res.clone());
  return res;
}

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  const fresh = fetch(req)
    .then((res) => {
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    })
    .catch(() => undefined);
  return hit || (await fresh) || new Response('', { status: 504 });
}

async function pageFirst(req) {
  const cache = await caches.open(PAGES);
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const hit = (await cache.match(req)) || (await caches.match(req, { ignoreSearch: true }));
    if (hit) return hit;
    const shell = await caches.open(SHELL);
    return (
      (await shell.match(`${SCOPE.pathname}app/`)) ||
      (await shell.match(SCOPE.pathname)) ||
      new Response('オフラインです。一度ひらいたページなら見られます。', {
        status: 503,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      })
    );
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // 外部（Google など）は素通し
  if (!url.pathname.startsWith(SCOPE.pathname)) return;
  if (url.pathname.includes('/api/')) return;

  if (req.mode === 'navigate') {
    event.respondWith(pageFirst(req));
    return;
  }
  if (isImmutable(url)) {
    event.respondWith(cacheFirst(req, ASSETS));
    return;
  }
  if (isAsset(url)) {
    event.respondWith(staleWhileRevalidate(req, ASSETS));
  }
});
