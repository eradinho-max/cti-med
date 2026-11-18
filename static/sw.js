/* CTi – Service Worker privado
   Segurança > offline: NÃO armazena HTML autenticado, questões, gabaritos ou respostas de IA.
   Apenas ativos públicos (ícones, fontes, imagens) ficam em cache. */
const VERSAO = 'cti-v34-pwa-install';
const SHELL = `${VERSAO}-public`;
const ARQUIVOS = [
  '/static/offline.html', '/static/manifest.json', '/static/fonts/inter-latin.woff2',
  '/static/img/logo-mark.svg', '/static/img/icon.svg', '/static/img/favicon-32.png',
  '/static/img/icon-192.png', '/static/img/icon-512.png', '/static/img/icon-maskable-512.png',
  '/static/img/apple-touch-icon.png', '/static/img/hero_m.jpg', '/static/img/essencia_m.jpg'
];
self.addEventListener('install', e => {
  e.waitUntil((async()=>{
    const cache=await caches.open(SHELL);
    // A missing optional asset must not abort registration.
    await Promise.allSettled(ARQUIVOS.map(url=>cache.add(new Request(url,{cache:'reload'}))));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('cti-') && k !== SHELL) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener('message', e => {
  if (e.data?.type === 'CLEAR_PRIVATE') {
    e.waitUntil((async () => {
      for (const k of await caches.keys()) if (k.startsWith('cti-') && k !== SHELL) await caches.delete(k);
    })());
  }
});
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req, {cache:'no-store'}).catch(async()=> (await caches.match('/static/offline.html')) || new Response('CTI: conexão indisponível. Seus dados locais foram preservados.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}})));
    return;
  }
  if (url.pathname.startsWith('/api/') || url.pathname === '/sw.js') return;
  // Só recursos explicitamente públicos entram no cache. Código autenticado (app.js/app.css) nunca fica no SW.
  if (req.method === 'GET' && ARQUIVOS.includes(url.pathname)) {
    e.respondWith(caches.open(SHELL).then(async c => {
      const hit = await c.match(req);
      if (hit) return hit;
      try { const r = await fetch(req); if (r.ok) c.put(req, r.clone()); return r; }
      catch { return hit || Response.error(); }
    }));
  }
});
