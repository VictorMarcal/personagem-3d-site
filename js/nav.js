/* ==========================================================================
   js/nav.js — v6: três separadores (Treinar · Reino · Eu)
   Substitui a versão de 4 separadores + sub-abas do "Mundo".

   Porque mudou: o ciclo estava cortado ao meio. Andar gera XP (que vivia em
   Personagem) e recursos (que viviam em Mundo › Missões), mas os recursos só
   servem para melhorar equipamento, que estava outra vez em Personagem — em
   pastilhas sobre o modelo 3D. E o cartão "Territórios descobertos" fazia
   três trabalhos ao mesmo tempo: exploração, produção e construção do
   armazém.

   Estrutura:
     Treinar   — um ecrã, uma ação. Sem sub-abas.
     Reino     — Mapa · Economia · Masmorra   (tudo o que é "lá fora")
     Eu        — Personagem · Troféus · Números   (tudo o que é "meu")

   Regra dura: as sub-abas são sempre TRÊS e nunca mudam de ordem. Foi a
   ordem variável (Campo, Masmorra oculta, Arena oculta, Missões) que tornou
   o "Mundo" ilegível.

   Como antes, NÃO substitui a navegação antiga: continua a clicar nos botões
   #btn-nav-jogo / #btn-nav-perfil (invisíveis) para que js/profile.js e
   js/battle.js funcionem exatamente como funcionavam — incluindo o bloqueio
   da navegação durante uma luta.
   Carregar DEPOIS de todos os outros scripts.
   ========================================================================== */

(function () {
  const tabBar = document.getElementById("tab-bar");
  const viewJogo = document.getElementById("view-jogo");
  const euSubtabs = document.getElementById("eu-subtabs");
  const btnNavJogo = document.getElementById("btn-nav-jogo");
  const btnNavPerfil = document.getElementById("btn-nav-perfil");
  if (!tabBar || !viewJogo || !btnNavJogo || !btnNavPerfil) return;

  const tabButtons = [...tabBar.querySelectorAll(".tab-btn")];
  const panes = [...viewJogo.querySelectorAll(".pane")];

  // O separador ativo sobrevive a um refresh (mesmo espírito das outras
  // preferências locais: por dispositivo, nunca sincronizado).
  const STORAGE_KEY = "ui.separadorAtivo";
  const SUBTAB_KEY = "ui.subAbaAtiva";

  /* ---- sub-abas --------------------------------------------------------- */

  // A sub-aba escolhida em cada separador é lembrada enquanto a app estiver
  // aberta: voltar a "Reino" volta ao Mapa se nunca se mexeu, senão à última
  // vista. Sem isto, cada ida ao separador recomeça do zero e o jogador
  // reaprende o caminho todas as vezes.
  const subAtiva = { reino: "mapa", eu: "personagem" };
  try {
    const guardado = JSON.parse(localStorage.getItem(SUBTAB_KEY) || "{}");
    if (guardado.reino) subAtiva.reino = guardado.reino;
    if (guardado.eu) subAtiva.eu = guardado.eu;
  } catch (err) {
    /* ignorar */
  }

  function showSubtab(tab, sub) {
    const grupo = document.querySelector('[data-subtabs="' + tab + '"]');
    const pane = panes.find((p) => p.dataset.paneName === tab);
    if (!grupo || !pane) return;

    // "Números" é o antigo Perfil, que continua a ser um view à parte:
    // delega no botão antigo, que é quem sabe pausar o render 3D e
    // re-renderizar a aba.
    if (tab === "eu" && sub === "numeros") {
      if (btnNavPerfil.disabled) return; // luta a decorrer
      btnNavPerfil.click();
    } else {
      btnNavJogo.click();
    }

    grupo.querySelectorAll(".nav-tab").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.subtab === sub);
    });
    pane.querySelectorAll(".subpane").forEach((el) => {
      el.classList.toggle("active", el.dataset.subpaneName === sub);
    });

    subAtiva[tab] = sub;
    try {
      localStorage.setItem(SUBTAB_KEY, JSON.stringify(subAtiva));
    } catch (err) {
      /* modo privado: seguir sem persistir */
    }

    // O Leaflet calcula o tamanho do mapa a partir do contentor — se este
    // estava escondido (display:none) quando o mapa foi criado, fica com
    // dimensão 0 e só aparece um canto cinzento. Recalcular ao abrir a aba
    // resolve, e desenhar aqui evita descarregar tiles a quem nunca lá vai.
    if (sub === "mapa") {
      if (typeof renderHexMap === "function") renderHexMap();
      if (typeof refreshHexMapSize === "function") refreshHexMapSize();
    }

    // O contador de recursos só corre com a Economia à vista (ver o comentário
    // em js/resources-ui.js).
    if (sub === "economia") {
      if (typeof startResourcesTicker === "function") startResourcesTicker();
    } else if (typeof stopResourcesTicker === "function") {
      stopResourcesTicker();
    }

    // O #viewer só tem dimensões quando está visível — sem isto o canvas
    // ficava com o tamanho que tinha ao ser escondido. O palco 3D agora vive
    // só em Eu › Personagem (deixou de estar duplicado no Campo).
    if (tab === "eu" && sub === "personagem" && typeof onResize === "function") {
      requestAnimationFrame(() => onResize());
    }

    // A carteira de recursos aparece em cima do equipamento: é o que liga
    // "andar rende" a "melhorar custa".
    if (tab === "eu" && sub === "personagem" && typeof renderWallet === "function") {
      renderWallet();
    }
  }

  document.querySelectorAll("[data-subtabs]").forEach((grupo) => {
    const tab = grupo.dataset.subtabs;
    grupo.querySelectorAll(".nav-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (btn.disabled) return; // Masmorra: à vista, mas travada
        showSubtab(tab, btn.dataset.subtab);
      });
    });
  });

  /* ---- separadores ------------------------------------------------------ */

  function showTab(tab) {
    if (tab === "eu" && subAtiva.eu === "numeros") {
      if (btnNavPerfil.disabled) return;
      btnNavPerfil.click();
    } else {
      btnNavJogo.click();
    }

    viewJogo.dataset.pane = tab;
    panes.forEach((pane) => pane.classList.toggle("active", pane.dataset.paneName === tab));
    tabButtons.forEach((btn) => btn.classList.toggle("active", btn.dataset.tab === tab));

    // A barra de sub-abas do "Eu" vive fora do #view-jogo (ver index.html):
    // fica à vista sempre que o separador "Eu" está ativo, mesmo em Números
    // (onde o #view-jogo está escondido) — é o caminho de volta.
    if (euSubtabs) euSubtabs.classList.toggle("hidden", tab !== "eu");

    // Reentrar num separador reabre a última sub-aba que lá se viu.
    if (subAtiva[tab]) showSubtab(tab, subAtiva[tab]);
    else if (typeof stopResourcesTicker === "function") stopResourcesTicker();

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
    const euTab = tabButtons.find((btn) => btn.dataset.tab === "eu");
    const numeros = document.querySelector('[data-subtab="numeros"]');
    if (euTab && subAtiva.eu === "numeros") euTab.disabled = locked;
    if (numeros) numeros.disabled = locked;
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

  let initial = "treinar";
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && tabButtons.some((btn) => btn.dataset.tab === saved)) initial = saved;
  } catch (err) {
    /* ignorar */
  }
  showTab(initial);
})();

/* ==========================================================================
   Detalhe da sessão de treino
   O readout tinha 8 blocos de texto cinzento a 11-13px, todos centrados, e
   só a distância com hierarquia. Agora: uma métrica herói, três apoios
   grandes, e a grelha de 6 campos + diagnóstico GPS atrás de um toque — que
   é o que se lê a andar, de relance.
   ========================================================================== */
(function () {
  const botao = document.getElementById("btn-training-detail");
  const detalhe = document.getElementById("training-detail");
  if (!botao || !detalhe) return;

  botao.addEventListener("click", () => {
    const aberto = !detalhe.hidden;
    detalhe.hidden = aberto;
    botao.textContent = aberto ? "Ver detalhe da sessão" : "Esconder detalhe";
    botao.setAttribute("aria-expanded", String(!aberto));
  });
})();
