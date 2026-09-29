// Service worker minimo (2026-09-21, PWA): existe so para a app poder ser
// INSTALADA no ecra inicial. Nao guarda nada em cache de proposito - o jogo
// atualiza-se varias vezes por dia (as versoes vao em ?v= nos ficheiros) e um
// cache aqui podia prender um jogador numa versao antiga. Tambem nao ha modo
// offline: o jogo precisa do Supabase de qualquer forma.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (event) => {
  // Pedidos que so o cache do navegador pode responder nao passam pelo fetch().
  if (event.request.cache === "only-if-cached" && event.request.mode !== "same-origin") return;
  event.respondWith(fetch(event.request));
});

// Notificacoes push (2026-09-29, a pedido - "sistema de notificacoes"): a
// subscricao em si vive em js/settings.js; aqui so se mostra a notificacao
// que chega (enviada pela funcao send-push, Supabase) e trata-se o toque
// nela. O payload e sempre { title, body, url }.
self.addEventListener("push", (event) => {
  let dados = { title: "Bootlands", body: "" };
  try {
    if (event.data) dados = { ...dados, ...event.data.json() };
  } catch {
    dados.body = event.data ? event.data.text() : "";
  }
  event.waitUntil(
    self.registration.showNotification(dados.title, {
      body: dados.body,
      icon: "assets/Icons/app/icon-192.png?v=20260924a",
      badge: "assets/Icons/app/icon-192.png?v=20260924a",
      data: { url: dados.url || "./" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "./";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) return client.focus();
      }
      return self.clients.openWindow(url);
    })
  );
});
