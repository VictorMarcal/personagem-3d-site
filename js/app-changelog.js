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
