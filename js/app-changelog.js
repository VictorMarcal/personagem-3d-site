// Changelog da APP Android/Unity (2026-10-07, a pedido - "quero um changelog
// no site mas com os updates que vamos dando à app"), em linguagem simples
// para os jogadores. Substitui o changelog da versão web (removido no mesmo
// dia, secção 28 do DOCUMENTACAO.md) - o foco passou para a app nativa.
// Cada entrada corresponde a uma versão distribuída via Firebase App
// Distribution (`firebase appdistribution:distribute ... --release-notes`,
// ver DOCUMENTACAO.md) - o texto aqui e o das release notes devem contar a
// mesma história, só não precisam de ser palavra por palavra iguais.
// `screenshots` é opcional: [{ src, alt }], tirados por adb (`adb exec-out
// screencap`) a pedido, nunca inventados.
const APP_CHANGELOG = [
  {
    version: "v0.1.9",
    title: "Medalhas de corrida",
    changes: [
      "Novo: medalhas de corrida no Perfil - 1 milha abaixo dos 9/8/7 min, 5km abaixo dos 30 min, 10km abaixo dos 50 min, meia maratona e maratona.",
      "Novo: o leaderboard mostra agora a tua posição (#1, #2...) e o teu nível em cada linha.",
      "Corrigido: as calorias/XP ganhos durante um treino podiam parar de contar se bloqueasses o ecrã - agora continuam a somar-se corretamente mesmo com o telemóvel em segundo plano.",
      "Melhorado: ícones de recursos no mapa ainda maiores.",
    ],
    screenshots: [],
  },
  {
    version: "v0.1.8",
    title: "Missões em tempo real",
    changes: [
      "Novo: o progresso das missões (quilómetros, hexágonos) atualiza-se agora ao vivo durante o treino, sem precisares de esperar até ao fim.",
      "Melhorado: gráfico de evolução do peso mais claro e mais bonito.",
      "Novo: o botão de registar peso mostra quanto tempo falta até poderes voltar a registar.",
      "Corrigido: o recorde de \"melhor corrida\" podia aparecer igual ao de \"melhor caminhada\" por um erro no cálculo - agora reflete mesmo a tua melhor corrida.",
    ],
    screenshots: [],
  },
  {
    version: "v0.1.6",
    title: "O apontador segue-te a sério",
    changes: [
      "Novo: o teu ícone de posição no mapa segue agora a direção real do movimento enquanto corres/andas, não só a orientação do telemóvel.",
      "Corrigido: alguns recordes de velocidade pessoal podiam aparecer com valores impossíveis depois de treinar com o ecrã bloqueado.",
      "Melhorado: ícones de recursos no mapa maiores e mais fáceis de ver.",
      "Melhorado: texto das missões mais limpo (já não repete a unidade duas vezes).",
    ],
    screenshots: [],
  },
  {
    version: "v0.1.5",
    title: "Mapa mais estável, missões mais claras",
    changes: [
      "Melhorado: o mapa do Território ficou mais estável a arrastar e a fazer zoom, com o teu ícone de posição agora sempre visível.",
      "Novo: missões concluídas no mês deixam de desaparecer da lista — ficam no fim, marcadas como \"Concluída\".",
      "Novo: quando já tens 3 missões ativas escolhidas, as outras ficam claramente marcadas como \"Bloqueada\".",
      "Pequenos ajustes visuais nas missões (recompensa e unidade de progresso mais claras).",
    ],
    screenshots: [],
  },
  {
    version: "v0.1.4",
    title: "Novo painel Perfil",
    changes: [
      "Novo: painel \"Perfil\" (4ª aba, em baixo) com o teu histórico completo de treinos (distância, tempo e número de sessões, por corrida e caminhada) e os teus recordes pessoais.",
      "Novo: leaderboard geral dentro do Perfil, com os melhores jogadores por XP.",
    ],
    screenshots: [],
  },
  {
    version: "v0.1.3",
    title: "Os teus treinos de hoje, num relance",
    changes: [
      "Novo: painel \"Treinos de Hoje\" no ecrã de Treino — vê todos os treinos que já fizeste hoje (modo, distância, ritmo médio, calorias e XP), sempre atualizado sozinho.",
      "Corrigido: depois de uma atualização da app, por vezes entrava sem pedir login mas com o nome/nível em branco e sem conseguir guardar o treino. Agora pede sempre para entrares de novo depois de uma atualização.",
    ],
    screenshots: [],
  },
  {
    version: "v0.1.2",
    title: "Nunca mais perder um treino",
    changes: [
      "Corrigido: se o treino não conseguisse guardar (ex: sessão expirada), ficava perdido para sempre. Agora fica guardado no telemóvel e envia-se sozinho assim que voltares a entrar.",
    ],
    screenshots: [],
  },
  {
    version: "v0.1.1",
    title: "O teu nível, sempre visível",
    changes: [
      "Novo: o teu nível aparece agora no topo da app, junto ao teu nome.",
      "O menu de Definições (ícone de engrenagem) já funciona a sério, com a opção de Sair.",
      "Mais ajustes visuais nos ecrãs de Entrar, Criar Conta e Recuperar Palavra-passe.",
      "Continua o trabalho no ecrã de Treino — mais novidades em breve.",
    ],
    screenshots: [],
  },
  {
    version: "v0.1.0",
    title: "Menu de Definições e nome na barra de navegação",
    changes: [
      "Novo menu de Definições (ícone de engrenagem) com a opção de Sair.",
      "O teu nome passa a aparecer na barra de navegação principal.",
      "O ecrã de treino ficou mais simples: o detalhe da sessão fica sempre visível, sem precisar de abrir/fechar.",
      "Pequenos ajustes visuais nos ecrãs de Entrar, Criar Conta e Recuperar Palavra-passe.",
      "Corrigido: o tempo em pausa durante o treino aparecia a oscilar sem sentido no ecrã.",
      "A app começa a reconhecer os territórios que vais descobrindo durante o treino (ainda sem mapa visível).",
    ],
    screenshots: [],
  },
];

function renderAppChangelogInto(listEl, entries) {
  listEl.innerHTML = "";
  entries.forEach((entry) => {
    const item = document.createElement("div");
    item.className = "changelog-entry";

    const title = document.createElement("p");
    title.className = "changelog-entry-title";
    title.innerHTML = `"${entry.title}" <span class="changelog-entry-version">${entry.version}</span>`;
    item.appendChild(title);

    const changesEl = document.createElement("ul");
    changesEl.className = "changelog-entry-changes";
    entry.changes.forEach((change) => {
      const li = document.createElement("li");
      li.textContent = change;
      changesEl.appendChild(li);
    });
    item.appendChild(changesEl);

    if (entry.screenshots && entry.screenshots.length > 0) {
      const screenshotsEl = document.createElement("div");
      screenshotsEl.className = "changelog-entry-screenshots";
      entry.screenshots.forEach((shot) => {
        const img = document.createElement("img");
        img.src = shot.src;
        img.alt = shot.alt;
        img.loading = "lazy";
        img.className = "landing-screenshot";
        screenshotsEl.appendChild(img);
      });
      item.appendChild(screenshotsEl);
    }

    listEl.appendChild(item);
  });
}

function renderAppChangelog() {
  const landingListEl = document.getElementById("landing-changelog-list");
  if (landingListEl) renderAppChangelogInto(landingListEl, APP_CHANGELOG);
}
renderAppChangelog();
