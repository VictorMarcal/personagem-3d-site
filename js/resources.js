// Economia de recursos do mapa (2026-09-07, secção 21).
//
// Substitui as moedas por quilometro. Cada hexagono descoberto tem um recurso
// e produz +1/hora desse recurso, multiplicado por um fator que sobe quando
// se volta a passar por la e desce quando se deixa de ir.
//
// NUMEROS ASSUMIDOS COMO PROVISORIOS. Foram derivados do ritmo real dos dois
// jogadores no primeiro mes (30-40 hexagonos/semana), que e a fase em que
// tudo a volta de casa e novo - a longo prazo cai muito. Como o proprio
// jogador observou: "nunca sabemos quais hexagonos alguem vai desbloquear nem
// que distancias vai percorrer". Por isso TUDO aqui e calculado ao vivo e
// nada e gravado ja resolvido: mudar qualquer constante deste ficheiro
// reavalia a economia inteira sem migracao, tal como aconteceu com LEVEL_BASE.

// --- recursos ---------------------------------------------------------------
// Equipamento a 22% (cada um e pedido por DUAS pecas), construcao a 17% (so
// pelo armazem). Nada abaixo de ~15%: simulamos, e com menos do que isso um
// jogador com poucos hexagonos podia ficar sem NENHUM de um tipo e travado
// sem perceber porque.
const RESOURCES = [
  { id: "ferro", nome: "Ferro", cor: "#C3C2CE", peso: 22, familia: "equipamento" , icone: "⚒️" },
  { id: "madeira", nome: "Madeira", cor: "#C0A386", peso: 22, familia: "equipamento" , icone: "🪵" },
  { id: "pele", nome: "Pele", cor: "#E2B5AC", peso: 22, familia: "equipamento" , icone: "🐾" },
  { id: "pedra", nome: "Pedra", cor: "#BFC9B9", peso: 17, familia: "construcao" , icone: "🪨" },
  { id: "barro", nome: "Barro", cor: "#E3C89A", peso: 17, familia: "construcao" , icone: "🏺" },
];

const RESOURCE_IDS = RESOURCES.map((r) => r.id);
const RESOURCE_BY_ID = {};
RESOURCES.forEach((r) => { RESOURCE_BY_ID[r.id] = r; });
const COR_POR_DESCOBRIR = "#D8D3CA";

// --- que recurso tem cada hexagono ------------------------------------------
//
// EQUILIBRADO POR VIZINHANCA, nao sorteado hexagono a hexagono. Um sorteio
// puro deixava buracos reais: simulado com 30 hexagonos descobertos, o pior
// caso em 2000 tentativas dava ZERO de alguns recursos.
//
// A vizinhanca e a celula H3 de resolucao 7 (~3 km, 49 filhos na resolucao 9)
// - a escala de um treino normal. Dentro dela distribuem-se os cinco tipos
// nas proporcoes exatas e baralham-se de forma determinista a partir do id da
// propria celula. Resultado: o percurso do costume atravessa os cinco.
const RESOURCE_NEIGHBOURHOOD_RES = 7;

function hashString(texto) {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i += 1) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const neighbourhoodBags = new Map();

function bagForNeighbourhood(parentId, tamanho) {
  if (neighbourhoodBags.has(parentId)) return neighbourhoodBags.get(parentId);

  const bag = [];
  RESOURCES.forEach((r) => {
    const quantos = Math.round((tamanho * r.peso) / 100);
    for (let i = 0; i < quantos; i += 1) bag.push(r.id);
  });
  // Arredondamentos podem deixar a saca curta ou comprida - acerta-se pelo
  // primeiro recurso, que e dos mais comuns e menos sofre com uma unidade.
  while (bag.length < tamanho) bag.push(RESOURCES[0].id);
  bag.length = tamanho;

  const rand = mulberry32(hashString(parentId));
  for (let i = bag.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const troca = bag[i];
    bag[i] = bag[j];
    bag[j] = troca;
  }
  neighbourhoodBags.set(parentId, bag);
  return bag;
}

// Determinista: o mesmo hexagono da sempre o mesmo recurso, em qualquer
// telemovel, sem nada gravado.
function resourceForHex(hexId) {
  if (typeof h3 === "undefined") return RESOURCES[0].id;
  try {
    const parent = h3.cellToParent(hexId, RESOURCE_NEIGHBOURHOOD_RES);
    const filhos = h3.cellToChildren(parent, getHexResolution());
    const bag = bagForNeighbourhood(parent, filhos.length);
    const indice = filhos.indexOf(hexId);
    return indice >= 0 ? bag[indice] : bag[hashString(hexId) % bag.length];
  } catch (e) {
    return RESOURCES[hashString(hexId) % RESOURCES.length].id;
  }
}

// --- multiplicador por hexagono ---------------------------------------------
//
// +0,1 por SESSAO de treino em que se passa la (nao por leitura de GPS: senao
// andava-se para tras e para a frente na fronteira e enchia-se numa tarde),
// ate ao dobro. Decai 0,05/dia, mas so depois de 2 DIAS DE TOLERANCIA.
//
// A tolerancia nao e generosidade, e correcao: simulado sem ela, quem treina
// 3x por semana ficava preso em 1,00 para sempre - os dias de descanso comiam
// tudo o que os treinos construiam. Dias de descanso fazem parte de treinar.
const MULT_MIN = 1.0;
const MULT_MAX = 2.0;
const MULT_POR_SESSAO = 0.1;
const MULT_DECAI_POR_DIA = 0.05;
const MULT_DIAS_TOLERANCIA = 2;

function hojeISO() {
  return new Date().toISOString().slice(0, 10);
}

function diasEntre(diaISO, ateISO) {
  const a = Date.parse(diaISO + "T00:00:00Z");
  const b = Date.parse(ateISO + "T00:00:00Z");
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86400000));
}

function getHexVisits() {
  try {
    const bruto = JSON.parse(localStorage.getItem(STORAGE_KEY_HEX_VISITS) || "{}");
    return bruto && typeof bruto === "object" ? bruto : {};
  } catch (e) {
    return {};
  }
}

function saveHexVisits(visitas) {
  localStorage.setItem(STORAGE_KEY_HEX_VISITS, JSON.stringify(visitas));
}

// Multiplicador AGORA, com o decaimento ja aplicado. O valor gravado e o do
// dia da ultima visita e o decaimento e sempre derivado - assim nao e preciso
// nenhum relogio a correr, e nada tem de acontecer com a app fechada.
function multiplicadorDoHex(hexId, visitas) {
  const registo = (visitas || getHexVisits())[hexId];
  if (!registo) return MULT_MIN;
  const dias = diasEntre(registo.d, hojeISO());
  const aDecair = Math.max(0, dias - MULT_DIAS_TOLERANCIA);
  return Math.max(MULT_MIN, (Number(registo.m) || MULT_MIN) - aDecair * MULT_DECAI_POR_DIA);
}

// Chamada UMA VEZ POR SESSAO, no fim do treino, com os hexagonos por onde se
// passou.
function registarVisitasDaSessao(hexIdsDaSessao) {
  if (!hexIdsDaSessao || hexIdsDaSessao.size === 0) return;
  const visitas = getHexVisits();
  const hoje = hojeISO();

  hexIdsDaSessao.forEach((hexId) => {
    // Aplica primeiro o decaimento acumulado e so depois soma a visita: pela
    // ordem inversa, uma pausa longa era apagada pela visita de regresso.
    const atual = multiplicadorDoHex(hexId, visitas);
    visitas[hexId] = { m: Math.min(MULT_MAX, atual + MULT_POR_SESSAO), d: hoje };
  });

  saveHexVisits(visitas);
  if (typeof queueProgressSync === "function") queueProgressSync();
}

// --- producao ---------------------------------------------------------------

function producaoPorHora() {
  const total = {};
  RESOURCE_IDS.forEach((id) => { total[id] = 0; });
  if (typeof getDiscoveredHexIds !== "function") return total;

  const visitas = getHexVisits();
  getDiscoveredHexIds().forEach((hexId) => {
    const recurso = resourceForHex(hexId);
    total[recurso] += multiplicadorDoHex(hexId, visitas);
  });
  RESOURCE_IDS.forEach((id) => { total[id] = Math.round(total[id] * 10) / 10; });
  return total;
}

// --- armazem ----------------------------------------------------------------
//
// O tecto e o que destranca o equipamento: nao se compra um upgrade de 8000
// se so se conseguem guardar 2000. E a primeira escolha a serio do sistema -
// gastar ja em equipamento ou investir em capacidade.
//
// O custo de cada nivel e uma FRACAO DO TECTO ANTERIOR, e nao uma curva
// propria. Nao e estetica: a primeira versao tinha uma curva independente e
// criava um bloqueio circular - o nivel 1 guardava 200 e o nivel 2 custava
// 386, ou seja, nunca se conseguia pagar. Assim e impossivel por construcao.
const WAREHOUSE_MAX_LEVEL = 10;
const WAREHOUSE_CAP_BASE = 200;
const WAREHOUSE_CAP_EXP = 1.7;
const WAREHOUSE_COST_FRACTION = 0.55;

function warehouseCap(level) {
  const n = Math.max(1, Math.min(WAREHOUSE_MAX_LEVEL, level));
  return Math.round(WAREHOUSE_CAP_BASE * Math.pow(n, WAREHOUSE_CAP_EXP));
}

function getWarehouseLevel() {
  const n = Number(localStorage.getItem(STORAGE_KEY_WAREHOUSE_LEVEL));
  return Number.isFinite(n) && n >= 1 ? Math.min(WAREHOUSE_MAX_LEVEL, n) : 1;
}

// undefined quando ja esta no maximo.
function warehouseUpgradeCost(level) {
  if (level >= WAREHOUSE_MAX_LEVEL) return undefined;
  const custo = Math.round(WAREHOUSE_COST_FRACTION * warehouseCap(level));
  return { pedra: custo, barro: custo };
}

// --- stock ------------------------------------------------------------------

function getResources() {
  let guardado = {};
  try {
    guardado = JSON.parse(localStorage.getItem(STORAGE_KEY_RESOURCES) || "{}") || {};
  } catch (e) {
    guardado = {};
  }
  const stock = {};
  RESOURCE_IDS.forEach((id) => { stock[id] = Math.max(0, Number(guardado[id]) || 0); });
  return stock;
}

function saveResources(stock) {
  localStorage.setItem(STORAGE_KEY_RESOURCES, JSON.stringify(stock));
  if (typeof queueProgressSync === "function") queueProgressSync();
}

// Ha duas perguntas diferentes, e misturá-las era o erro:
//
//   stockAgora()       - "quanto tenho NESTE instante?" Nao grava nada.
//   acumularProducao() - "fixa o que produzi ate agora." Grava.
//
// O painel atualiza-se a cada segundo para o numero subir a vista - a 24/h
// sao 0,4/min, ou seja um ponto de dois em dois minutos e meio. Se cada
// atualizacao gravasse, seriam 3600 escritas em localStorage por hora com o
// ecra aberto, sem nada de novo para guardar.
//
// A producao e sempre DERIVADA do tempo decorrido, nunca somada por um
// temporizador: a app passa a maior parte do tempo fechada e o tempo conta na
// mesma.
function stockAgora() {
  const stock = getResources();
  const desde = Number(localStorage.getItem(STORAGE_KEY_RESOURCES_SINCE));
  if (!Number.isFinite(desde) || desde <= 0) return stock;

  const horas = (Date.now() - desde) / 3600000;
  if (horas <= 0) return stock;

  const porHora = producaoPorHora();
  const tecto = warehouseCap(getWarehouseLevel());
  RESOURCE_IDS.forEach((id) => {
    stock[id] = Math.min(tecto, stock[id] + porHora[id] * horas);
  });
  return stock;
}

function acumularProducao() {
  const stock = stockAgora();
  localStorage.setItem(STORAGE_KEY_RESOURCES_SINCE, String(Date.now()));
  saveResources(stock);
  return stock;
}

// So le - e chamada a cada desenho do painel, uma vez por segundo. Se
// acumulasse, estaria a gravar no localStorage so para desenhar um botao.
function podePagar(custo) {
  const stock = stockAgora();
  return Object.keys(custo).every((id) => stock[id] >= custo[id]);
}

function pagar(custo) {
  const stock = acumularProducao();
  if (!Object.keys(custo).every((id) => stock[id] >= custo[id])) return false;
  Object.keys(custo).forEach((id) => { stock[id] -= custo[id]; });
  saveResources(stock);
  return true;
}

function upgradeWarehouse() {
  const nivel = getWarehouseLevel();
  const custo = warehouseUpgradeCost(nivel);
  if (!custo || !pagar(custo)) return false;
  localStorage.setItem(STORAGE_KEY_WAREHOUSE_LEVEL, String(nivel + 1));
  if (typeof queueProgressSync === "function") queueProgressSync();
  return true;
}

function formatRecurso(valor) {
  return Math.floor(valor).toLocaleString("pt-PT");
}
