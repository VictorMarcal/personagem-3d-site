// Economia de recursos do mapa (2026-09-07, secção 21).
//
// Substitui as moedas por quilometro. Existem 10 MINAS de cada recurso em
// cada concelho e so elas produzem; os restantes hexagonos contam para o
// territorio mas nao rendem nada. Cada mina produz por hora, multiplicado por
// um fator que sobe quando se volta a passar por la e desce quando se deixa
// de ir.
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

// --- ajudantes deterministas ------------------------------------------------
// Usados para colocar as minas sempre nos mesmos sitios sem gravar nada.
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
//
// TODOS os hexagonos descobertos produzem (2026-09-09, a pedido):
//   - hex sem mina        -> HEX_BASE_PER_HOUR de CADA recurso
//   - hex com mina encontrada -> MINE_HEX_PER_HOUR do recurso dessa mina
// O multiplicador do hexagono (revisitas, 1,0-2,0) aplica-se aos dois.
const HEX_BASE_PER_HOUR = 0.1;
const MINE_HEX_PER_HOUR = 0.5;

function producaoPorHora() {
  const total = {};
  RESOURCE_IDS.forEach((id) => { total[id] = 0; });

  const descobertos = typeof getDiscoveredHexIds === "function" ? getDiscoveredHexIds() : new Set();
  if (descobertos.size === 0) return total;

  // hexId -> recurso, para os hexes descobertos que tenham uma mina JA
  // encontrada. Depende de unlockedConcelhos (hexes.js); se ainda nao
  // estiver carregado, esses hexes rendem so a taxa base ate estar.
  const recursoDaMinaNoHex = {};
  if (typeof todasAsMinas === "function") {
    const encontradas = getMinasEncontradas();
    todasAsMinas().forEach((mina) => {
      if (encontradas.has(mina.id)) recursoDaMinaNoHex[mina.hexId] = mina.recurso;
    });
  }

  const visitas = getHexVisits();
  descobertos.forEach((hexId) => {
    const mult = multiplicadorDoHex(hexId, visitas);
    const recurso = recursoDaMinaNoHex[hexId];
    if (recurso) {
      total[recurso] += MINE_HEX_PER_HOUR * mult;
    } else {
      RESOURCE_IDS.forEach((id) => { total[id] += HEX_BASE_PER_HOUR * mult; });
    }
  });

  RESOURCE_IDS.forEach((id) => { total[id] = Math.round(total[id] * 100) / 100; });
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
  let desde = Number(localStorage.getItem(STORAGE_KEY_RESOURCES_SINCE));
  if (!Number.isFinite(desde) || desde <= 0) {
    // Primeira leitura de sempre: arranca o relogio AGORA. Sem isto a
    // producao nunca acumulava - RESOURCES_SINCE so era escrito em
    // acumularProducao(), que so corre ao pagar/evoluir algo. (Escrever
    // um timestamp de arranque uma vez nao e o mesmo que gravar o stock a
    // cada segundo, que e o que a nota abaixo evita.)
    desde = Date.now();
    localStorage.setItem(STORAGE_KEY_RESOURCES_SINCE, String(desde));
    return stock;
  }

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

// --- minas ------------------------------------------------------------------
//
// Existem 10 MINAS de cada recurso em cada concelho - 50 ao todo. Desde
// 2026-09-09 TODOS os hexagonos descobertos rendem (ver producaoPorHora);
// uma mina encontrada so faz o hexagono dela render mais e de um recurso
// especifico em vez da taxa base de todos.
//
// NAO ESTAO VISIVEIS ate serem encontradas. Ha um aviso sonoro a 500 m.
const MINES_PER_RESOURCE = 10;
const MINE_ALERT_RADIUS_M = 500;

const minesByConcelho = new Map();

// Deterministas a partir do osm_id do concelho: as mesmas minas em qualquer
// telemovel, sem nada gravado. So se guarda QUAIS ja foram encontradas.
function buildMinesFor(concelho) {
  const gj = concelho.geojson;
  const polys = gj.type === "Polygon" ? [gj.coordinates] : gj.coordinates;
  let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
  polys.forEach((poly) =>
    poly[0].forEach(([lng, lat]) => {
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
    })
  );

  const rand = mulberry32(hashString("minas:" + concelho.osmId));
  const alvo = RESOURCES.length * MINES_PER_RESOURCE;

  // Uma saca com 10 de cada, baralhada: garante o numero exato por recurso
  // (nao um sorteio que podia dar 3 de ferro e 17 de pedra) e, como os
  // pontos saem em ordem aleatoria, cada recurso fica espalhado pelo
  // concelho em vez de agrupado num canto.
  const saca = [];
  RESOURCES.forEach((r) => {
    for (let i = 0; i < MINES_PER_RESOURCE; i += 1) saca.push(r.id);
  });
  for (let i = saca.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const troca = saca[i];
    saca[i] = saca[j];
    saca[j] = troca;
  }

  const minas = [];
  const hexesUsados = new Set();
  const maxTentativas = alvo * 400;

  for (let t = 0; minas.length < alvo && t < maxTentativas; t += 1) {
    const lat = minLat + rand() * (maxLat - minLat);
    const lng = minLng + rand() * (maxLng - minLng);
    if (!pointInGeoJson(lat, lng, gj)) continue;

    let hexId = null;
    try {
      hexId = h3.latLngToCell(lat, lng, getHexResolution());
    } catch (e) {
      continue;
    }
    // Duas minas no mesmo hexagono seriam apanhadas de uma vez e uma delas
    // ficaria invisivel por baixo da outra.
    if (hexesUsados.has(hexId)) continue;
    hexesUsados.add(hexId);

    const [hLat, hLng] = h3.cellToLatLng(hexId);
    minas.push({
      id: concelho.osmId + ":" + minas.length,
      hexId,
      lat: hLat,
      lng: hLng,
      recurso: saca[minas.length],
      concelho: concelho.name,
    });
  }
  return minas;
}

function todasAsMinas() {
  const todas = [];
  (typeof unlockedConcelhos !== "undefined" ? unlockedConcelhos : []).forEach((c) => {
    if (!minesByConcelho.has(c.osmId)) minesByConcelho.set(c.osmId, buildMinesFor(c));
    minesByConcelho.get(c.osmId).forEach((m) => todas.push(m));
  });
  return todas;
}

function getMinasEncontradas() {
  try {
    const bruto = JSON.parse(localStorage.getItem(STORAGE_KEY_MINES) || "[]");
    return new Set(Array.isArray(bruto) ? bruto : []);
  } catch (e) {
    return new Set();
  }
}

function saveMinasEncontradas(set) {
  localStorage.setItem(STORAGE_KEY_MINES, JSON.stringify([...set]));
  if (typeof queueProgressSync === "function") queueProgressSync();
}

function minasEncontradasCount() {
  return getMinasEncontradas().size;
}

// Uma mina e reclamada ao entrar NO HEXAGONO dela - a mesma regra que
// descobre territorio, por isso nao ha duas nocoes diferentes de "cheguei
// la". O aviso sonoro a 500 m e so aviso: nao apanha nada.
function verificarMinas(latitude, longitude) {
  const minas = todasAsMinas();
  if (minas.length === 0) return;
  if (typeof haversineDistance !== "function") return;

  const encontradas = getMinasEncontradas();
  let hexAtual = null;
  try {
    hexAtual = h3.latLngToCell(latitude, longitude, getHexResolution());
  } catch (e) {
    return;
  }

  let achouAlguma = false;
  let avisou = false;

  minas.forEach((mina) => {
    if (encontradas.has(mina.id)) return;

    if (mina.hexId === hexAtual) {
      encontradas.add(mina.id);
      minasAvisadas.delete(mina.id);
      achouAlguma = true;
      if (typeof showGameToast === "function") {
        showGameToast("Mina de " + RESOURCE_BY_ID[mina.recurso].nome.toLowerCase() + " encontrada!", "medalha");
      }
      return;
    }

    const metros = haversineDistance(latitude, longitude, mina.lat, mina.lng);
    if (metros <= MINE_ALERT_RADIUS_M) {
      // O conjunto das ja avisadas evita apitar de leitura em leitura
      // enquanto se anda perto sem la chegar. So volta a avisar depois de
      // sair do raio.
      if (!minasAvisadas.has(mina.id)) {
        minasAvisadas.add(mina.id);
        avisou = true;
      }
    } else {
      minasAvisadas.delete(mina.id);
    }
  });

  if (achouAlguma) {
    saveMinasEncontradas(encontradas);
    playMineFound();
    if (typeof renderResourcesPanel === "function") renderResourcesPanel();
    if (typeof redrawHexMap === "function") redrawHexMap();
  } else if (avisou) {
    playMineNearby();
  }
}

const minasAvisadas = new Set();

// --- som --------------------------------------------------------------------
// Web Audio em vez de um ficheiro: sao dois bips, nao vale um asset no
// repositorio. O contexto tem de ser criado a partir de um gesto do
// utilizador - no iOS um AudioContext criado fora de um toque fica suspenso e
// nunca toca - por isso unlockMineAudio() e chamada no botao de iniciar
// treino.
let mineAudioCtx = null;

function unlockMineAudio() {
  try {
    if (!mineAudioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      mineAudioCtx = new Ctx();
    }
    if (mineAudioCtx.state === "suspended") mineAudioCtx.resume();
  } catch (e) {
    // sem audio a mecanica continua a funcionar, so nao avisa
  }
}

function tocarNotas(notas) {
  if (!mineAudioCtx || mineAudioCtx.state !== "running") return;
  const agora = mineAudioCtx.currentTime;
  notas.forEach((n) => {
    const osc = mineAudioCtx.createOscillator();
    const ganho = mineAudioCtx.createGain();
    osc.type = "sine";
    osc.frequency.value = n.hz;
    // Envelope: sem isto ouve-se um estalido no inicio e no fim de cada nota.
    ganho.gain.setValueAtTime(0, agora + n.inicio);
    ganho.gain.linearRampToValueAtTime(0.25, agora + n.inicio + 0.01);
    ganho.gain.linearRampToValueAtTime(0, agora + n.inicio + n.duracao);
    osc.connect(ganho);
    ganho.connect(mineAudioCtx.destination);
    osc.start(agora + n.inicio);
    osc.stop(agora + n.inicio + n.duracao + 0.02);
  });
}

// Aviso a 500 m: dois bips iguais, discretos.
function playMineNearby() {
  tocarNotas([
    { hz: 660, inicio: 0, duracao: 0.09 },
    { hz: 660, inicio: 0.16, duracao: 0.09 },
  ]);
}

// Encontrada: arpejo a subir, para nao se confundir com o aviso.
function playMineFound() {
  tocarNotas([
    { hz: 784, inicio: 0, duracao: 0.1 },
    { hz: 988, inicio: 0.1, duracao: 0.1 },
    { hz: 1319, inicio: 0.2, duracao: 0.2 },
  ]);
}
