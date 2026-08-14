/* ==========================================================================
   js/nav.js — barra de separadores inferior (4 separadores)
   Adicionado com o tema "Campo Aberto". NÃO substitui a navegação antiga:
   limita-se a clicar nos botões #btn-nav-jogo / #btn-nav-perfil que já
   existiam (agora invisíveis), para que js/profile.js e js/battle.js
   continuem a funcionar exatamente como antes — incluindo o bloqueio da
   navegação para o Perfil durante uma luta.
   Carregar DEPOIS de todos os outros scripts.
   ========================================================================== */

(function () {
  const tabBar = document.getElementById("tab-bar");
  const viewJogo = document.getElementById("view-jogo");
  const btnNavJogo = document.getElementById("btn-nav-jogo");
  const btnNavPerfil = document.getElementById("btn-nav-perfil");
  if (!tabBar || !viewJogo || !btnNavJogo || !btnNavPerfil) return;

  const tabButtons = [...tabBar.querySelectorAll(".tab-btn")];
  const panes = [...viewJogo.querySelectorAll(".pane")];

  // O separador ativo sobrevive a um refresh (mesmo espírito das outras
  // preferências locais: por dispositivo, nunca sincronizado).
  const STORAGE_KEY = "ui.separadorAtivo";

  function showTab(tab) {
    // O Perfil continua a ser um "view" à parte: delega no botão antigo,
    // que é quem sabe pausar o render 3D e re-renderizar a aba.
    if (tab === "perfil") {
      if (btnNavPerfil.disabled) return; // luta a decorrer
      btnNavPerfil.click();
    } else {
      btnNavJogo.click();
      viewJogo.dataset.pane = tab;
      panes.forEach((pane) => {
        pane.classList.toggle("active", pane.dataset.paneName === tab);
      });
      // O #viewer só tem dimensões quando está visível — sem isto o canvas
      // ficava com o tamanho que tinha ao ser escondido. Visível em
      // Personagem E Mundo (2026-08-10 - Mundo passou a mostrar a
      // personagem 3D tambem, ver css/style.css #viewer-stage).
      if ((tab === "personagem" || tab === "mundo") && typeof onResize === "function") {
        requestAnimationFrame(() => onResize());
      }
    }

    tabButtons.forEach((btn) => btn.classList.toggle("active", btn.dataset.tab === tab));

    try {
      localStorage.setItem(STORAGE_KEY, tab);
    } catch (err) {
      /* modo privado: seguir sem persistir */
    }
  }

  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => showTab(btn.dataset.tab));
  });

  // Enquanto uma luta decorre, js/battle.js desativa #btn-nav-perfil — a
  // barra inferior acompanha, para o separador não parecer clicável.
  const battleObserver = new MutationObserver(() => {
    const locked = btnNavPerfil.disabled;
    const perfilTab = tabButtons.find((btn) => btn.dataset.tab === "perfil");
    if (perfilTab) perfilTab.disabled = locked;
  });
  battleObserver.observe(btnNavPerfil, { attributes: true, attributeFilter: ["disabled"] });

  // Ao entrar numa luta a partir de qualquer separador, o #viewer passa a
  // fullscreen (js/battle.js) — garante-se que fica visível e à medida.
  const viewer = document.getElementById("viewer");
  if (viewer) {
    const viewerObserver = new MutationObserver(() => {
      if (viewer.classList.contains("battle-fullscreen") && typeof onResize === "function") {
        requestAnimationFrame(() => onResize());
      }
    });
    viewerObserver.observe(viewer, { attributes: true, attributeFilter: ["class"] });
  }

  let initial = "mundo";
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && tabButtons.some((btn) => btn.dataset.tab === saved)) initial = saved;
  } catch (err) {
    /* ignorar */
  }
  showTab(initial);
})();

/* ==========================================================================
   Sub-navegação dentro do separador "Mundo" (2026-08-10) — mesmo padrão das
   abas do Leaderboard (js/leaderboard.js): Campo (era o separador "Treino"),
   Masmorra (PvE, era "Arena"/"Batalhas"), Arena (PvP) e Missões — estas duas
   últimas já visíveis mas "Em breve" (sem conteúdo ainda). Sempre reinicia
   em "Campo" ao recarregar, sem persistência — mesmo espírito das abas do
   leaderboard, que também não guardam a última aba escolhida.
   ========================================================================== */
(function () {
  const subButtons = {
    campo: document.getElementById("btn-mundo-campo"),
    masmorra: document.getElementById("btn-mundo-masmorra"),
    arena: document.getElementById("btn-mundo-arena"),
    missoes: document.getElementById("btn-mundo-missoes"),
  };
  const subPanes = {
    campo: document.getElementById("mundo-subpane-campo"),
    masmorra: document.getElementById("mundo-subpane-masmorra"),
    arena: document.getElementById("mundo-subpane-arena"),
    missoes: document.getElementById("mundo-subpane-missoes"),
  };
  if (Object.values(subButtons).some((btn) => !btn) || Object.values(subPanes).some((pane) => !pane)) return;

  function showMundoSubtab(subtab) {
    Object.entries(subButtons).forEach(([key, btn]) => btn.classList.toggle("active", key === subtab));
    Object.entries(subPanes).forEach(([key, pane]) => pane.classList.toggle("active", key === subtab));

    // O Leaflet calcula o tamanho do mapa a partir do contentor - se este
    // estava escondido (display:none) quando o mapa foi criado, fica com
    // dimensao 0 e so aparece um canto cinzento. Recalcular ao abrir a aba
    // resolve, e desenhar aqui evita descarregar tiles a quem nunca la vai.
    if (subtab === "missoes") {
      if (typeof renderHexMap === "function") renderHexMap();
      if (typeof refreshHexMapSize === "function") refreshHexMapSize();
    }
  }

  Object.entries(subButtons).forEach(([key, btn]) => {
    btn.addEventListener("click", () => showMundoSubtab(key));
  });
})();
