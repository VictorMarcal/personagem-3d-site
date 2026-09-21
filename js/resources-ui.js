// Painel de recursos e Fortaleza (2026-09-07, secção 21 - a Fortaleza
// chamava-se "Armazém" ate 2026-09-09; as funcoes/ids em js/resources.js
// mantem o nome `warehouse`). Separado de js/resources.js de proposito:
// ali vive a economia (o que e verdade), aqui vive a apresentacao (como se
// mostra). Trocar a UI nao mexe nas regras.
//
// v6: emoji e pontos de cor deram lugar ao set de icones (js/icons.js), e o
// botao da Fortaleza diz "Melhorar" com o custo numa linha por baixo. O
// botao nunca explica se da ou nao da: o ESTADO dele e que diz. Laranja =
// ha recursos, cinza desativado = nao ha.

// Ordem em que os recursos aparecem na linha de custo da Fortaleza -
// progressao da construcao, nao a ordem de RESOURCES (que comeca no ferro).
const WAREHOUSE_COST_ORDER = ["madeira", "pele", "pedra", "barro", "ferro"];

// Notificação de depósito cheio (2026-09-16, a pedido - "jogador deve
// receber notificação quando um dos depósitos está cheio"). O aviso
// "Fortaleza cheia" já existia dentro do painel (só visível com a Economia
// aberta) - isto acrescenta um toast, uma vez por "enchimento" (não a cada
// segundo enquanto ficar cheio, o painel é redesenhado 1x/s pelo ticker).
// Volta a poder avisar depois de descer abaixo do teto (gasto/melhoria).
// Só em memória - não precisa de sobreviver a um reload para ser útil.
let recursosCheiosAvisados = new Set();

function avisarRecursosCheios(stock, tecto) {
  let notas;
  try {
    notas = JSON.parse(localStorage.getItem(STORAGE_KEY_RECURSOS_CHEIOS_EM) || "{}");
  } catch (e) {
    notas = {};
  }
  let notasMudaram = false;

  RESOURCE_IDS.forEach((id) => {
    const cheio = stock[id] >= tecto - 0.5;
    if (cheio && !recursosCheiosAvisados.has(id)) {
      recursosCheiosAvisados.add(id);
      if (typeof showGameToast === "function" && typeof RESOURCE_BY_ID !== "undefined") {
        showGameToast(`${RESOURCE_BY_ID[id].nome} cheio na Fortaleza — produção parada.`, "aviso");
      }
    } else if (!cheio && recursosCheiosAvisados.has(id)) {
      recursosCheiosAvisados.delete(id);
    }

    // Badge de notificação (secção 15.1, 2026-09-18, a pedido - "Depósitos
    // cheios"), persistente ao contrário de recursosCheiosAvisados acima
    // (só em memória) - guarda o momento em que cada recurso TRANSITOU
    // para cheio, e apaga-o quando deixa de estar, para um novo
    // enchimento voltar a contar como notificação nova.
    if (cheio && notas[id] === undefined) {
      notas[id] = Date.now();
      notasMudaram = true;
    } else if (!cheio && notas[id] !== undefined) {
      delete notas[id];
      notasMudaram = true;
    }
  });

  if (notasMudaram) {
    localStorage.setItem(STORAGE_KEY_RECURSOS_CHEIOS_EM, JSON.stringify(notas));
    if (typeof renderNavBadges === "function") renderNavBadges();
  }
}

function contarDepositosCheiosNaoVistos() {
  const seenAt = typeof getReinoEconomiaSeenAt === "function" ? getReinoEconomiaSeenAt() : 0;
  let notas;
  try {
    notas = JSON.parse(localStorage.getItem(STORAGE_KEY_RECURSOS_CHEIOS_EM) || "{}");
  } catch (e) {
    return 0;
  }
  return Object.values(notas).filter((ts) => Number(ts) > seenAt).length;
}

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
  const depositos = depositosEncontradosPorRecurso();

  avisarRecursosCheios(stock, tecto);

  painel.innerHTML =
    '<p class="resources-title">Produção por hora</p>' +
    '<p class="mines-found">Depósitos encontrados: <strong>' + minasEncontradasCount() + '</strong> de ' + todasAsMinas().length + '</p>' +
    '<p class="mines-found">Fortaleza: ' + EXPLORACOES.map((e) => e.nome).join(" · ") + ' — <strong>' + EXPLORACAO_POR_HORA + '/h</strong> cada</p>' +
    '<dl class="resources-grid">' +
    RESOURCES.map((r) => {
      const quantidade = stock[r.id];
      const cheio = quantidade >= tecto - 0.5;
      return (
        // icon(r.id) usa a cor da familia definida em js/icons.js — a mesma
        // que o r.cor de js/resources.js, mas em traco em vez de bola cheia
        // O numero ao lado do nome e o n de depositos ja encontrados desse
        // recurso (2026-09-21, a pedido) - o que faz subir o ganho por hora.
        "<dt>" + icon(r.id, 17) + '<span class="resource-name">' + r.nome + "</span>" +
        '<span class="resource-deposits" title="Depósitos encontrados de ' + r.nome.toLowerCase() + '">' +
        icon("mina", 12) + depositos[r.id] + "</span></dt>" +
        '<dd class="' + (cheio ? "resource-full" : "") + '">' +
        formatRecurso(quantidade) + " / " + formatRecurso(tecto) +
        '<span class="resource-rate">' + (cheio ? "parada" : "+" + porHora[r.id].toFixed(1) + "/h") + "</span>" +
        "</dd>"
      );
    }).join("") +
    "</dl>" +
    // Um armazem cheio deixou de produzir - e a unica informacao aqui que
    // exige accao do jogador, por isso e a unica que aparece em destaque.
    (RESOURCE_IDS.some((id) => stock[id] >= tecto - 0.5)
      ? '<p class="resources-warning">Fortaleza cheia — a produção parou. Melhora a Fortaleza ou gasta recursos.</p>'
      : "");

  if (!armazem) return;

  const custo = warehouseUpgradeCost(nivel);
  if (!custo) {
    armazem.innerHTML =
      '<p class="resources-title">' + icon("fortaleza", 18) + " Fortaleza · Nível " + nivel + " (máximo)</p>" +
      '<p class="warehouse-line">Limite: ' + formatRecurso(tecto) + " por recurso.</p>";
    return;
  }

  const podeSubir = podePagar(custo);
  armazem.innerHTML =
    '<p class="resources-title">' + icon("fortaleza", 18) + " Fortaleza · Nível " + nivel + "</p>" +
    '<p class="warehouse-line">Limite: ' + formatRecurso(tecto) +
    " → " + formatRecurso(warehouseCap(nivel + 1)) + " por recurso.</p>" +
    '<button id="btn-warehouse-upgrade" class="btn-primary"' +
    (podeSubir ? "" : ' disabled aria-disabled="true"') + ">Melhorar</button>" +
    // Custo por baixo do botao, sempre igual esteja ou nao ao alcance:
    // o jogador aprende o preco, o botao diz-lhe se ja da. Os recursos
    // ativos mudam com o nivel (madeira/pele -> pedra -> barro -> ferro),
    // por isso mostra-se so os que estao no `custo`, pela ordem de RESOURCES.
    '<p class="warehouse-cost">' +
    WAREHOUSE_COST_ORDER.filter((id) => custo[id])
      .map((id) => '<span class="warehouse-cost-item">' + icon(id, 14) + formatRecurso(custo[id]) + "</span>")
      .join("") +
    "</p>";

  const botao = document.getElementById("btn-warehouse-upgrade");
  if (botao && podeSubir) {
    botao.addEventListener("click", () => {
      if (!upgradeWarehouse()) return;
      if (typeof showGameToast === "function") {
        showGameToast("Fortaleza no nível " + getWarehouseLevel() + "!", "medalha");
      }
      renderResourcesPanel();
      if (typeof renderWallet === "function") renderWallet();
      // Subir a Fortaleza pode destrancar melhorias de equipamento que
      // estavam acima do teto - redesenha os cards.
      if (typeof renderEquipmentCards === "function") renderEquipmentCards();
      // Muda o modelo 3D da torre se este nivel entrar noutra faixa de 5
      // (js/main.js - só troca de facto quando o índice muda).
      if (typeof refreshTowerModel === "function") refreshTowerModel();
    });
  }
}


// --- carteira em Reino › Fortaleza ------------------------------------------
//
// O stock passa a aparecer TAMBEM onde e gasto, em cima do equipamento. Era
// o corte no ciclo: andar gera recursos (Reino), e os recursos so servem
// para melhorar equipamento - hoje no mesmo separador (Reino › Fortaleza,
// 2026-09-16 - antes era Eu › Personagem, um separador diferente sem se
// mencionarem).

function renderWallet() {
  const el = document.getElementById("equipment-wallet");
  if (!el || typeof stockAgora !== "function") return;
  const stock = stockAgora();
  el.innerHTML = RESOURCES.map(
    (r) =>
      '<span class="wallet-chip">' + icon(r.id, 15) + r.nome + " " + formatRecurso(stock[r.id]) + "</span>"
  ).join("");
}


// --- contador ao vivo -------------------------------------------------------
//
// A produçao e continua: 24/h sao 0,4/min, ou seja um ponto de dois em dois
// minutos e meio. Redesenhar de segundo a segundo faz o numero subir a vista
// em vez de so mudar quando se reabre a aba.
//
// So corre com a sub-aba Economia VISIVEL - correr sempre seria gastar
// bateria a atualizar um painel que ninguem esta a ver, o mesmo erro que a
// cena 3D tinha (secção 4.8).
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
