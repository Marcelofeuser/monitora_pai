const CACHE_NAME = 'amparo-shell-v4';
const APP_SHELL = ['./', './index.html', './manifest.webmanifest', './favicon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
    ),
  );
  self.clients.claim();
});

// Antes: cache-first pra TUDO (caches.match(req) || fetch(req)). Isso significava
// que, depois da primeira visita, o app inteiro (index.html incluído) ficava
// preso na versão baixada naquele momento pra sempre — nenhum deploy novo
// chegava até quem já tinha aberto o app, a não ser com um refresh forçado
// (Cmd+Shift+R). Foi a causa direta de pelo menos dois bugs "fantasmas" que
// pareciam resolvidos no código mas continuavam acontecendo pra quem já
// tinha usado o app antes (fetch_children_failed_500 e o not_authenticated
// no pareamento voltando mesmo depois do fix).
//
// Agora: network-first pra navegação e pro shell (HTML, manifest) — sempre
// busca a versão mais nova primeiro, só cai pro cache se estiver offline.
// Os arquivos dentro de /assets/ (JS/CSS gerados pelo Vite com hash no nome,
// ex: index-Cz5hQMyn.js) continuam cache-first, porque esses são imutáveis:
// o mesmo hash nunca muda de conteúdo, e o index.html sempre aponta pro
// hash certo assim que ele mesmo vem fresco da rede.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.pathname.endsWith('/sw.js')) return;

  const isHashedAsset = url.pathname.includes('/assets/');

  if (isHashedAsset) {
    event.respondWith(
      caches.match(event.request).then(
        (cached) =>
          cached ||
          fetch(event.request).then((response) => {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
            return response;
          }),
      ),
    );
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match('./index.html'))),
  );
});

// Notificações push (item 10 do pedido): o backend manda um payload JSON
// {title, body, url} sempre que o Responsável precisa ser avisado de
// atividade no chat — ver lib/notify.ts no api-server. O clique abre (ou
// foca) a aba do app já na tela de conversas.
self.addEventListener('push', (event) => {
  let data = { title: 'Amparo', body: 'Você tem uma atualização.', url: './' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    // payload não era JSON — mantém o texto padrão em vez de quebrar.
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: './favicon.svg',
      data: { url: data.url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url ?? './';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.navigate?.(targetUrl);
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    }),
  );
});
