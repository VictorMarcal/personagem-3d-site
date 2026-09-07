// Painel de recursos e armazem (2026-09-07, secção 21). Separado de
// js/resources.js de proposito: ali vive a economia (o que e verdade), aqui
// vive a apresentacao (como se mostra). Trocar a UI nao mexe nas regras.

function renderResourcesPanel() {
  const painel = document.getElementById("resources-panel");
  const armazem = document.getElementById("warehouse-panel");
  if (!painel || typeof acumularProducao !== "function") return;

  // Acumula ANTES de desenhar: o que se ve tem de ser o que se tem, e nao o
  // que se tinha da ultima vez que a app esteve aberta.
  const stock = acumularProducao();
  const porHora = producaoPorHora();
  const nivel = getWarehouseLevel();
  const tecto = warehouseCap(nivel);

  painel.innerHTML =
    '<p class="resources-title">Recursos</p>' +
    '<dl class="resources-grid">' +
    RESOURCES.map((r) => {
      const quantidade = stock[r.id];
      const cheio = quantidade >= tecto - 0.5;
      return (
        '<dt><span class="resource-dot" style="background:' + r.cor + '"></span>' + r.nome + "</dt>" +
        '<dd class="' + (cheio ? "resource-full" : "") + '">' +
        formatRecurso(quantidade) + " / " + formatRecurso(tecto) +
        '<span class="resource-rate">+' + porHora[r.id].toFixed(1) + "/h</span>" +
        "</dd>"
      );
    }).join("") +
    "</dl>" +
    // Um armazem cheio deixou de produzir - e a unica informacao aqui que
    // exige accao do jogador, por isso e a unica que aparece em destaque.
    (RESOURCE_IDS.some((id) => stock[id] >= tecto - 0.5)
      ? '<p class="resources-warning">Armazém cheio — a produção parou. Evolui o armazém ou gasta recursos.</p>'
      : "");

  if (!armazem) return;

  const custo = warehouseUpgradeCost(nivel);
  if (!custo) {
    armazem.innerHTML =
      '<p class="resources-title">Armazém</p>' +
      '<p class="warehouse-line">Nível ' + nivel + " (máximo) — guarda " + formatRecurso(tecto) + " de cada recurso.</p>";
    return;
  }

  const podeSubir = podePagar(custo);
  armazem.innerHTML =
    '<p class="resources-title">Armazém</p>' +
    '<p class="warehouse-line">Nível ' + nivel + " — guarda " + formatRecurso(tecto) +
    " de cada recurso. Nível " + (nivel + 1) + " guarda " + formatRecurso(warehouseCap(nivel + 1)) + ".</p>" +
    '<p class="warehouse-cost">Custa ' + formatRecurso(custo.pedra) + " pedra + " + formatRecurso(custo.barro) + " barro</p>" +
    '<button id="btn-warehouse-upgrade" class="btn-secondary" ' + (podeSubir ? "" : "disabled") + ">" +
    (podeSubir ? "Evoluir armazém" : "Materiais insuficientes") +
    "</button>";

  const botao = document.getElementById("btn-warehouse-upgrade");
  if (botao) {
    botao.addEventListener("click", () => {
      if (!upgradeWarehouse()) return;
      if (typeof showGameToast === "function") {
        showGameToast("Armazém no nível " + getWarehouseLevel() + "!", "medalha");
      }
      renderResourcesPanel();
    });
  }
}
