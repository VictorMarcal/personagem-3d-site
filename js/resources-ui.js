// Painel de recursos e armazem (2026-09-07, secção 21). Separado de
// js/resources.js de proposito: ali vive a economia (o que e verdade), aqui
// vive a apresentacao (como se mostra). Trocar a UI nao mexe nas regras.

function renderResourcesPanel() {
  const painel = document.getElementById("resources-panel");
  const armazem = document.getElementById("warehouse-panel");
  if (!painel || typeof acumularProducao !== "function") return;

  // stockAgora() e nao acumularProducao(): so se le. Fixar o valor a cada
  // desenho gravava no localStorage uma vez por segundo sem necessidade.
  const stock = stockAgora();
  const porHora = producaoPorHora();
  const nivel = getWarehouseLevel();
  const tecto = warehouseCap(nivel);

  painel.innerHTML =
    '<p class="resources-title">Recursos</p>' +
    '<p class="mines-found">Minas encontradas: <strong>' + minasEncontradasCount() + '</strong> de ' + todasAsMinas().length + '</p>' +
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


// --- contador ao vivo -------------------------------------------------------
//
// A produçao e continua: 24/h sao 0,4/min, ou seja um ponto de dois em dois
// minutos e meio. Redesenhar de segundo a segundo faz o numero subir a vista
// em vez de so mudar quando se reabre a aba.
//
// So corre com a sub-aba Missoes VISIVEL - correr sempre seria gastar bateria
// a atualizar um painel que ninguem esta a ver, o mesmo erro que a cena 3D
// tinha (secção 4.8).
const RESOURCES_TICK_MS = 1000;
let resourcesTickerId = null;

function startResourcesTicker() {
  if (resourcesTickerId !== null) return;
  renderResourcesPanel();
  resourcesTickerId = setInterval(() => {
    const painel = document.getElementById("resources-panel");
    // offsetParent a null significa que o painel esta escondido (outra aba).
    if (!painel || !painel.offsetParent) {
      stopResourcesTicker();
      return;
    }
    renderResourcesPanel();
  }, RESOURCES_TICK_MS);
}

function stopResourcesTicker() {
  if (resourcesTickerId === null) return;
  clearInterval(resourcesTickerId);
  resourcesTickerId = null;
}

// Com a pagina escondida o browser ja estrangula os temporizadores, mas
// parar explicitamente evita voltar a desenhar dezenas de vezes de rajada
// quando ela volta.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") stopResourcesTicker();
});
