// Botao "Instalar a app" da pagina de entrada (2026-09-21, PWA).
// Chrome/Android: guarda o pedido de instalacao do navegador e abre-o ao clicar.
// iPhone (sem esse pedido) e Android sem pedido disponivel: mostra o caminho manual.
(function () {
  const btn = document.getElementById("btn-install-app");
  const hint = document.getElementById("install-app-hint");
  if (!btn || !hint) return;

  const jaInstalada =
    window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  if (jaInstalada) return;

  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua);
  const android = /Android/.test(ua);
  let pedido = null;

  function mostrar() { btn.hidden = false; }
  function esconder() { btn.hidden = true; hint.hidden = true; }

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    pedido = e;
    mostrar();
  });
  window.addEventListener("appinstalled", () => {
    pedido = null;
    esconder();
  });

  // Sem o pedido do navegador so se mostra em telemoveis, onde a instalacao existe.
  if (ios || android) mostrar();

  btn.addEventListener("click", async () => {
    if (pedido) {
      const p = pedido;
      pedido = null;
      p.prompt();
      await p.userChoice.catch(() => null);
      return;
    }
    hint.textContent = ios
      ? "No Safari: toca em Partilhar e depois em Adicionar ao ecrã principal."
      : "No Chrome: abre o menu (⋮) e escolhe Instalar app (ou Adicionar ao ecrã inicial).";
    hint.hidden = false;
  });
})();
