// Economia de recursos do mapa (2026-09-07, secção 21).
//
// Substitui as moedas por quilometro. Cada concelho tem DEPOSITOS (antes
// chamados minas) de cada recurso - quantos depende da area do concelho - e
// so eles produzem; os restantes hexagonos contam para o territorio mas nao
// rendem nada. Cada deposito tem um nivel fixo 1-3 (0,3/0,6/0,9 por hora),
// sem multiplicadores (2026-09-19; ate ai havia um multiplicador de revisita
// por hexagono e todos os hexagonos descobertos rendiam uma taxa base).
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
// `icone` so e usado no mapa (js/hexes.js, mina encontrada) - la, o icone faz
// as vezes de "terreno" do hexagono (secção 18, mapa estilizado 2026-09, a
// pedido: "arvores indicam madeira, montanhas indicam pedra"). Ferro e pedra
// sao os dois "montanha", por isso o icone do ferro e deliberadamente um tipo
// de montanha diferente (vulcao, mais escuro) em vez de reaproveitar o da
// pedra - sem isso ficavam visualmente iguais no mapa.
const RESOURCES = [
  { id: "ferro", nome: "Ferro", cor: "#C3C2CE", peso: 22, familia: "equipamento" , icone: "🌋" },
  { id: "madeira", nome: "Madeira", cor: "#C0A386", peso: 22, familia: "equipamento" , icone: "🌲" },
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

// --- producao ---------------------------------------------------------------
//
// Formula (2026-09-21, a pedido - "ganho = 10 + ((0,1 x n) x (10 + n))", com
// a ressalva de que o 10 e uma VARIAVEL a poder ser ajustada):
//
//   producao/h de um recurso = G + (B x n) x (G + n)
//   G = EXPLORACAO_POR_HORA (ganho inicial, hoje 10)
//   B = DEPOSITO_BONUS_FRACAO (0,1)
//   n = depositos JA ENCONTRADOS desse recurso
//
// A curva acelera (cada deposito novo vale mais que o anterior): com G = 10,
// n = 0 -> 10/h, 5 -> 17,5, 10 -> 30, 20 -> 70. Os depositos NAO tem nivel (o
// nivel 1-3 de 2026-09-19 saiu, e o numero no icone do mapa tambem). Um
// hexagono sem deposito continua a render 0, e nao ha multiplicadores de
// revisita. Antes: exploracoes a 1/h + depositos a 0,3/0,6/0,9 por hora
// conforme o nivel.
const DEPOSITO_BONUS_FRACAO = 0.1;

// Ganho por hora de UM recurso com n depositos encontrados. Isolada (e sem
// tocar em nada do jogo) para se poder afinar/testar a formula.
function ganhoPorHora(ganhoInicial, n) {
  return ganhoInicial + DEPOSITO_BONUS_FRACAO * n * (ganhoInicial + n);
}

// Exploracoes da Fortaleza (2026-09-19, a pedido - "a nossa fortaleza vai ter
// as 5 exploracoes"). Uma por recurso, sempre ativas, independentes dos
// depositos do mapa: somam-se a eles. Ainda sem evolucao. Producao inicial
// 1 -> 10 por hora em 2026-09-21 (a pedido - "ganho inicial = 10 por hora").
// Na vista 3D da Fortaleza vao aparecer como edificios (serraria, pedreira,
// gruta de ferro, fazenda, poca de barro) - ainda nao modelados.
const EXPLORACAO_POR_HORA = 10;
const EXPLORACOES = [
  { recurso: "madeira", nome: "Serraria" },
  { recurso: "pedra", nome: "Pedreira" },
  { recurso: "ferro", nome: "Gruta de ferro" },
  { recurso: "pele", nome: "Fazenda" },
  { recurso: "barro", nome: "Poça de barro" },
];

function producaoPorHora() {
  const total = {};
  RESOURCE_IDS.forEach((id) => { total[id] = 0; });
  EXPLORACOES.forEach((e) => { total[e.recurso] += EXPLORACAO_POR_HORA; });

  // Depende de unlockedConcelhos (js/hexes.js) para saber onde estao os
  // depositos - se ainda nao estiver carregado (ex: dispositivo novo, cache
  // de regioes vazia) a producao fica a 0 ate estar; ver depositosPorResolver().
  if (typeof todasAsMinas !== "function") return total;
  const encontradas = getMinasEncontradas();
  const depositosPorRecurso = {};
  todasAsMinas().forEach((mina) => {
    if (encontradas.has(mina.id)) depositosPorRecurso[mina.recurso] = (depositosPorRecurso[mina.recurso] || 0) + 1;
  });
  RESOURCE_IDS.forEach((id) => {
    total[id] = ganhoPorHora(total[id], depositosPorRecurso[id] || 0);
  });

  RESOURCE_IDS.forEach((id) => { total[id] = Math.round(total[id] * 100) / 100; });
  return total;
}

// Quantos depositos ja encontrados ainda nao foi possivel resolver a um
// concelho carregado (dispositivo novo: a lista de ids vem do Supabase mas a
// geometria dos concelhos so chega quando o mapa os identifica). Enquanto for
// > 0, producaoPorHora() esta a subestimar - quem fixa um checkpoint nessa
// altura (acumularProducao) perderia producao.
function depositosPorResolver() {
  if (typeof todasAsMinas !== "function") return 0;
  const encontradas = getMinasEncontradas();
  if (encontradas.size === 0) return 0;
  const resolvidos = new Set(todasAsMinas().map((m) => m.id));
  let emFalta = 0;
  encontradas.forEach((id) => { if (!resolvidos.has(id)) emFalta += 1; });
  return emFalta;
}

// --- Fortaleza (armazem) --------------------------------------------------
//
// O tecto e o que destranca o equipamento: nao se compra um upgrade de 8000
// se so se conseguem guardar 2000. E a primeira escolha a serio do sistema -
// gastar ja em equipamento ou investir em capacidade.
//
// 100 niveis (2026-09-11, a pedido - antes eram 10). O tecto de armazenamento
// continua a curva `BASE * nivel^EXP`; o custo de MELHORIA passou a ter uma
// curva propria por recurso (WAREHOUSE_COST_CURVES abaixo).
const WAREHOUSE_MAX_LEVEL = 100;
const WAREHOUSE_CAP_BASE = 200;
const WAREHOUSE_CAP_EXP = 1.7;

function warehouseCap(level) {
  const n = Math.max(1, Math.min(WAREHOUSE_MAX_LEVEL, level));
  return Math.round(WAREHOUSE_CAP_BASE * Math.pow(n, WAREHOUSE_CAP_EXP));
}

function getWarehouseLevel() {
  const n = Number(localStorage.getItem(STORAGE_KEY_WAREHOUSE_LEVEL));
  return Number.isFinite(n) && n >= 1 ? Math.min(WAREHOUSE_MAX_LEVEL, n) : 1;
}

// Custo de melhoria da Fortaleza (2026-09-11, a pedido). Cada recurso e a sua
// propria curva `base * fator ^ (nivel - entrada)` dentro de uma janela de
// niveis - a Fortaleza comeca de madeira/pele, passa a pedra, depois barro,
// depois ferro, e a necessidade de cada um SOBE sempre dentro da sua janela.
// A pedra tem DOIS trocos: da um degrau ao Nv 50, quando a madeira sai, para
// assumir a carga estrutural sem quebra no total. Regra do design: a pedra e
// sempre a maior necessidade a partir do momento em que entra.
//
// O custo esta sempre MUITO abaixo do tecto do nivel (`warehouseCap`), por
// isso nao ha bloqueio circular (nao se consegue guardar o que se precisa) -
// verificado em toda a gama 1..100.
const WAREHOUSE_COST_CURVES = [
  { recurso: "madeira", de: 1,  ate: 49, base: 100,  fator: 1.05 },
  { recurso: "pele",    de: 1,  ate: 29, base: 22,   fator: 1.075 },
  { recurso: "pedra",   de: 30, ate: 49, base: 200,  fator: 1.075 },
  { recurso: "pedra",   de: 50, ate: 99, base: 1200, fator: 1.075 }, // degrau ao Nv 50
  { recurso: "barro",   de: 50, ate: 99, base: 700,  fator: 1.075 },
  { recurso: "ferro",   de: 75, ate: 99, base: 5800, fator: 1.075 },
];

// undefined quando ja esta no maximo. Devolve um objeto { recurso: quantia }
// so com os recursos ativos nesse nivel.
function warehouseUpgradeCost(level) {
  if (level >= WAREHOUSE_MAX_LEVEL) return undefined;
  const custo = {};
  WAREHOUSE_COST_CURVES.forEach((c) => {
    if (level < c.de || level > c.ate) return;
    custo[c.recurso] = (custo[c.recurso] || 0) + Math.round(c.base * Math.pow(c.fator, level - c.de));
  });
  return custo;
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
// O numero de minas de cada recurso, por concelho, cresce com a AREA do
// concelho (2026-09-18, a pedido - "quero uma formula que tenha como minas
// minimas 10 de cada, mas dependendo do tamanho do concelho, esse numero
// aumenta"). Antes era um numero fixo (10 de cada, 50 ao todo) em qualquer
// concelho - um jogador num concelho minusculo como Sao Joao da Madeira
// (7.9 km2) tinha a mesma quantidade de minas que alguem em Odemira
// (1720.6 km2, o maior do pais), 218x maior em area.
//
// Formula (minasPorRecursoParaConcelho abaixo), logaritmica na area,
// ancorada no MENOR concelho do pais (que fica exatamente no minimo):
//   minas = max(MINES_PER_RESOURCE_MIN,
//               round(MINES_PER_RESOURCE_MIN * (1 + log10(area / MINA_AREA_REFERENCIA_KM2))))
// Testado com os extremos reais: Sao Joao da Madeira -> 10 (ancora, pela
// definicao da formula), Braga (183.2 km2) -> 24, Odemira (1720.6 km2) ->
// 33 - cresce so ~3.3x do menor ao maior concelho do pais. Descartada a
// raiz quadrada (chegava a 14.5x, ~145 minas em Odemira - "é muito", a
// pedido) e a escala linear com a area (>170x, insustentavel).
//
// Cada DEPOSITO (as antigas minas) encontrado aumenta o ganho do recurso dele
// (ver ganhoPorHora/producaoPorHora); sem niveis desde 2026-09-21.
//
// NAO ESTAO VISIVEIS ate serem encontradas. Ha um radar de 1 km (2026-09-18 -
// substitui os dois raios antigos, 500 m + 2,5 km, por um so): som "tim tim
// tim", vibracao pulsante (Android/Chrome so - Vibration API nunca existiu
// no iOS/Safari) e popup "Existe um depósito no raio de 1km".
const MINES_PER_RESOURCE_MIN = 10;
const MINE_RADAR_RADIUS_M = 1000;

const minesByConcelho = new Map();

// Remove acentos e baixa para minusculas - para casar o "name" que vem do
// Nominatim (resolveRegionAt, js/hexes.js) com as chaves de
// CONCELHO_AREA_KM2 (js/concelho-areas.js), sem depender de acentuacao
// exatamente igual.
function normalizeConcelhoName(nome) {
  return String(nome || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

// Nome sem correspondencia na tabela (concelho novo/renomeado, ou um dos 2
// nomes duplicados a nivel nacional que ficaram de fora - ver nota em
// js/concelho-areas.js) cai no minimo - nunca menos minas que isso, so
// deixa de crescer com a area.
function minasPorRecursoParaConcelho(concelho) {
  const area = CONCELHO_AREA_KM2[normalizeConcelhoName(concelho.name)];
  if (!area || area <= 0) return MINES_PER_RESOURCE_MIN;
  const fator = 1 + Math.log10(area / MINA_AREA_REFERENCIA_KM2);
  return Math.max(MINES_PER_RESOURCE_MIN, Math.round(MINES_PER_RESOURCE_MIN * fator));
}

// Gera UM LOTE de "quantidadePorRecurso" minas de cada recurso e acrescenta-o
// a `minas` (ids continuam a partir do fim da lista), consumindo `rand` e
// `hexesUsados` PARTILHADOS entre lotes - nunca reinicia o gerador nem
// esquece os hexagonos ja ocupados por um lote anterior.
function gerarLoteDeMinas(minas, hexesUsados, rand, gj, bbox, concelhoNome, osmId, quantidadePorRecurso) {
  const { minLat, maxLat, minLng, maxLng } = bbox;
  const alvo = RESOURCES.length * quantidadePorRecurso;

  // Uma saca com N de cada, baralhada: garante o numero exato por recurso
  // (nao um sorteio que podia dar 3 de ferro e 17 de pedra) e, como os
  // pontos saem em ordem aleatoria, cada recurso fica espalhado pelo
  // concelho em vez de agrupado num canto.
  const saca = [];
  RESOURCES.forEach((r) => {
    for (let i = 0; i < quantidadePorRecurso; i += 1) saca.push(r.id);
  });
  for (let i = saca.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const troca = saca[i];
    saca[i] = saca[j];
    saca[j] = troca;
  }

  const maxTentativas = alvo * 400;
  let colocadas = 0;
  for (let t = 0; colocadas < alvo && t < maxTentativas; t += 1) {
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
    const id = osmId + ":" + minas.length;
    minas.push({
      id,
      hexId,
      lat: hLat,
      lng: hLng,
      recurso: saca[colocadas],
      concelho: concelhoNome,
    });
    colocadas += 1;
  }
}

// Deterministas a partir do osm_id do concelho: as mesmas minas em qualquer
// telemovel, sem nada gravado. So se guarda QUAIS ja foram encontradas.
//
// GERADO EM DOIS LOTES (2026-09-18, bug corrigido no mesmo dia da mudanca
// que o introduziu): o 1o lote gera sempre exatamente
// MINES_PER_RESOURCE_MIN (10) de cada recurso, com a MESMA sequencia de
// rand() que ja existia antes da area entrar na formula - preserva ao byte
// as posicoes/recursos/ids de TODAS as minas ja gravadas como "encontradas"
// nas contas dos jogadores. So depois, num 2o lote que CONTINUA a mesma
// sequencia de rand() (nunca a reinicia) e o mesmo hexesUsados (nunca
// repete um hexagono ja ocupado pelo 1o lote), e que entram as minas extra
// dos concelhos maiores, com ids a seguir ao fim do 1o lote (50+).
// Bug real: gerar tudo num so lote de tamanho variavel (o saca ficava maior,
// o shuffle consumia um numero diferente de rand() antes de comecar a
// amostrar pontos) desalinhava a sequencia inteira - toda a colocacao
// (nao so a extra) mudava sempre que a area de um concelho alterava
// minasPorRecursoParaConcelho(), incluindo minas ja marcadas como
// encontradas antes do deploy, que passavam a apontar para um sitio
// diferente (por vezes fora do territorio ja descoberto do jogador).
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
  const bbox = { minLat, maxLat, minLng, maxLng };

  const rand = mulberry32(hashString("minas:" + concelho.osmId));
  const minas = [];
  const hexesUsados = new Set();

  gerarLoteDeMinas(minas, hexesUsados, rand, gj, bbox, concelho.name, concelho.osmId, MINES_PER_RESOURCE_MIN);

  const extra = minasPorRecursoParaConcelho(concelho) - MINES_PER_RESOURCE_MIN;
  if (extra > 0) {
    gerarLoteDeMinas(minas, hexesUsados, rand, gj, bbox, concelho.name, concelho.osmId, extra);
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

// Badge de notificação (secção 15.1, 2026-09-18, a pedido - "Minas
// encontradas"). getMinasEncontradas() (acima) so guarda OS IDS, ja
// sincronizados com o Supabase (player_progress.minas_encontradas) - sem
// data de quando cada uma foi encontrada. Isto guarda essa data à parte,
// só localmente (STORAGE_KEY_MINAS_NOTADAS_EM), preenchida uma única vez
// por mina no momento em que verificarMinas() a encontra.
function notarMinaEncontrada(minaId) {
  let notas;
  try {
    notas = JSON.parse(localStorage.getItem(STORAGE_KEY_MINAS_NOTADAS_EM) || "{}");
  } catch (e) {
    notas = {};
  }
  if (notas[minaId] === undefined) {
    notas[minaId] = Date.now();
    localStorage.setItem(STORAGE_KEY_MINAS_NOTADAS_EM, JSON.stringify(notas));
  }
}

// Partilhado com contarDepositosCheiosNaoVistos() (js/resources-ui.js) -
// minas e depositos aparecem ambos no painel de Economia, marcados como
// vistos juntos (marcarEconomiaComoVista(), chamada uma so vez por
// js/nav.js ao entrar em Reino > Economia).
function getReinoEconomiaSeenAt() {
  return Number(localStorage.getItem(STORAGE_KEY_REINO_ECONOMIA_SEEN_AT)) || 0;
}

function marcarEconomiaComoVista() {
  localStorage.setItem(STORAGE_KEY_REINO_ECONOMIA_SEEN_AT, String(Date.now()));
}

function contarMinasNaoVistas() {
  const seenAt = getReinoEconomiaSeenAt();
  let notas;
  try {
    notas = JSON.parse(localStorage.getItem(STORAGE_KEY_MINAS_NOTADAS_EM) || "{}");
  } catch (e) {
    return 0;
  }
  return Object.values(notas).filter((ts) => Number(ts) > seenAt).length;
}

// Uma mina e reclamada ao entrar NO HEXAGONO dela - a mesma regra que
// descobre territorio, por isso nao ha duas nocoes diferentes de "cheguei
// la". Os avisos sonoros a 500 m e a 2,5 km sao so aviso: nao apanham nada -
// so o segundo (mais proximo) toca se os dois calharem na mesma leitura de
// GPS, para nao sobrepor sons.
function verificarMinas(latitude, longitude) {
  const minas = todasAsMinas();
  if (minas.length === 0) return;
  if (typeof haversineDistance !== "function") return;

  // O AudioContext pode ser suspenso pelo proprio browser a meio do treino
  // (ecra bloqueado, aba em segundo plano - o normal num treino ao ar livre
  // longo) e so era desbloqueado UMA VEZ, no gesto de "Iniciar Treino"
  // (unlockMineAudio). Uma vez suspenso, tocarNotas() ficava calado pelo
  // resto da sessao inteira, sem erro nenhum visivel - bug reportado
  // (2026-09-18, "ja estive perto de muitas [minas] e nunca ouvi o radar a
  // tocar"), tinha treino sempre ativo, so o som e que morria a meio.
  // Tenta resumir em TODA leitura de GPS (varias vezes por minuto): resume()
  // e assincrono, pode nao estar pronto a tempo do proprio aviso desta
  // leitura, mas normalmente ja esta pronto a tempo do seguinte.
  if (mineAudioCtx && mineAudioCtx.state === "suspended") mineAudioCtx.resume().catch(() => {});

  const encontradas = getMinasEncontradas();
  let hexAtual = null;
  try {
    hexAtual = h3.latLngToCell(latitude, longitude, getHexResolution());
  } catch (e) {
    return;
  }

  let achouAlguma = false;
  let avisouRadar = false;

  minas.forEach((mina) => {
    if (encontradas.has(mina.id)) return;

    if (mina.hexId === hexAtual) {
      encontradas.add(mina.id);
      minasRadarAvisadas.delete(mina.id);
      achouAlguma = true;
      notarMinaEncontrada(mina.id);
      if (typeof showGameToast === "function") {
        showGameToast("Depósito de " + RESOURCE_BY_ID[mina.recurso].nome.toLowerCase() + " encontrado! O ganho deste recurso sobe.", "medalha");
      }
      return;
    }

    const metros = haversineDistance(latitude, longitude, mina.lat, mina.lng);
    if (metros <= MINE_RADAR_RADIUS_M) {
      // O conjunto das ja avisadas evita repetir o aviso a cada leitura
      // enquanto se anda dentro do raio sem chegar la. So volta a avisar
      // depois de sair do raio e voltar a entrar.
      if (!minasRadarAvisadas.has(mina.id)) {
        minasRadarAvisadas.add(mina.id);
        avisouRadar = true;
      }
    } else {
      minasRadarAvisadas.delete(mina.id);
    }
  });

  if (achouAlguma) {
    saveMinasEncontradas(encontradas);
    playMineFound();
    if (typeof renderResourcesPanel === "function") renderResourcesPanel();
    if (typeof redrawHexMap === "function") redrawHexMap();
    if (typeof renderNavBadges === "function") renderNavBadges();
  } else if (avisouRadar) {
    playMineRadar();
    vibrarRadar();
    if (typeof showGameToast === "function") {
      showGameToast("Existe um depósito no raio de 1km", "aviso");
    }
  }
}

const minasRadarAvisadas = new Set();

// Vibracao pulsante ao entrar no raio do radar (2026-09-18, a pedido) - so
// funciona em Android/Chrome: a Vibration API nunca foi implementada no
// iOS/Safari, chamar isto la e um no-op silencioso, sem erro nenhum.
function vibrarRadar() {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  try {
    // Pulsante (vibra-pausa-vibra-pausa-vibra), nao um zumbido continuo.
    navigator.vibrate([120, 80, 120, 80, 120]);
  } catch (e) {
    // sem vibracao a mecanica continua a funcionar, so nao avisa por ai
  }
}

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

// Radar a 1 km (2026-09-18 - unico raio, substitui os antigos 500 m + 2,5
// km): "tim tim tim" - 3 tiques curtos e agudos, distintos do arpejo de
// "encontrada". Acompanhado de vibracao (vibrarRadar()) e popup.
function playMineRadar() {
  tocarNotas([
    { hz: 1046, inicio: 0, duracao: 0.05 },
    { hz: 1046, inicio: 0.14, duracao: 0.05 },
    { hz: 1046, inicio: 0.28, duracao: 0.05 },
  ]);
}

// Encontrada: fanfarra de vitoria (2026-09-16, a pedido - "deve soar algo
// mais a vitoria/conquista"). Antes era só um arpejo a subir (3 notas, sem
// acorde final) - discreto demais para um achado raro. Agora: 4 notas a
// subir (dó-mi-sol-dó, um acorde maior classico) seguidas de um acorde final
// sustentado (dó+mi tocados ao mesmo tempo, ver os dois "inicio" iguais) -
// o mesmo desenho de um "ta-da!" de jogo.
function playMineFound() {
  tocarNotas([
    { hz: 523.25, inicio: 0, duracao: 0.09 }, // Dó5
    { hz: 659.25, inicio: 0.09, duracao: 0.09 }, // Mi5
    { hz: 783.99, inicio: 0.18, duracao: 0.09 }, // Sol5
    { hz: 1046.5, inicio: 0.27, duracao: 0.3 }, // Dó6
    { hz: 1318.51, inicio: 0.27, duracao: 0.3 }, // Mi6 - acorde com a nota anterior
  ]);
}
