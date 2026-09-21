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
