/* 旅行手帳 Service Worker — 讓頁面在沒有網路時也能開啟
   放在與 index.html 同一個資料夾。改版時不需要動這個檔案：
   有網路時一律先抓最新的 index.html，抓不到才用手機裡的備份。 */
const VER = 'tw-shell-v1';
const INDEX = new URL('./index.html', self.registration.scope).href;
const CDN = 'https://cdn.jsdelivr.net/';
const SUPABASE_JS = CDN + 'npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js';

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(VER);
    await Promise.allSettled([
      fetch(INDEX, { cache: 'reload' }).then(r => r.ok && c.put(INDEX, r)),
      fetch(SUPABASE_JS).then(r => r.ok && c.put(SUPABASE_JS, r))
    ]);
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VER) await caches.delete(k);
    await self.clients.claim();
  })());
});

// 先連網（最多等 4 秒，訊號差時不要卡住），失敗或逾時就用備份
async function pageFirstNetwork(req) {
  const c = await caches.open(VER);
  try {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 4000);
    const r = await fetch(req, { signal: ctl.signal });
    clearTimeout(t);
    if (r.ok) { c.put(INDEX, r.clone()); return r; }   // ?trip=xxx 都是同一支 index.html，只存一份
  } catch (e) {}
  return (await c.match(INDEX)) || Response.error();
}

// 外部程式庫：有備份就直接用，沒有才下載並存起來
async function libCacheFirst(req) {
  const c = await caches.open(VER);
  const hit = await c.match(req.url);
  if (hit) return hit;
  const r = await fetch(req);
  if (r.ok) c.put(req.url, r.clone());
  return r;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (req.mode === 'navigate' && url.origin === location.origin) return e.respondWith(pageFirstNetwork(req));
  if (url.href.startsWith(CDN)) return e.respondWith(libCacheFirst(req));
});
