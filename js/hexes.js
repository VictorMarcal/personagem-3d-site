// Descoberta de territorio por hexagonos (2026-08-14, secção 18 da
// documentação) - base das missoes por localizacao, a pedido.
//
// O mundo e dividido em hexagonos pelo H3 (indexacao hexagonal hierarquica
// da Uber, via h3-js). Cada hexagono onde o jogador nunca esteve conta como
// "descoberto". Escolhido em vez de uma grelha quadrada a pedido, e o H3 em
// vez de matematica propria porque grelhas hexagonais na esfera sao
// exatamente o tipo de coisa que corre mal quando se improvisa.
//
// PRIVACIDADE: guarda-se o ID da celula H3, nunca coordenadas. Na resolucao
// 9 cada celula tem ~427m de diametro, por isso o registo diz "esteve nesta
// zona", nunca "esteve nesta rua, a esta hora". Ate aqui a app nunca tinha
// guardado nada sobre ONDE se treina - so distancia/duracao/calorias.

// Cache local do conjunto ja descoberto (fonte de verdade e o Supabase,
// isto e so para nao ter de perguntar a rede a cada leitura de GPS).
function getDiscoveredHexIds() {
  const raw = localStorage.getItem(STORAGE_KEY_DISCOVERED_HEXES);
  try {
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch (e) {
    return new Set();
  }
}

function saveDiscoveredHexIds(set) {
  localStorage.setItem(STORAGE_KEY_DISCOVERED_HEXES, JSON.stringify([...set]));
}

function getDiscoveredHexCount() {
  return getDiscoveredHexIds().size;
}

// Fila de descobertas por enviar. Mesmo raciocinio de training_sessions
// (js/training.js): cada descoberta e um EVENTO discreto - se a rede falhar
// no momento, nao ha snapshot posterior que a reponha, tem de ficar em
// seguranca ate ser confirmada.
function getHexQueue() {
  const raw = localStorage.getItem(STORAGE_KEY_DISCOVERED_HEXES_QUEUE);
  try {
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function saveHexQueue(queue) {
  localStorage.setItem(STORAGE_KEY_DISCOVERED_HEXES_QUEUE, JSON.stringify(queue));
}

// Chamada a cada leitura de GPS aceite (js/training.js). Devolve o id da
// celula e se e nova, para quem chama poder festejar a descoberta.
// Silenciosa se o h3-js ainda nao tiver carregado (CDN lento/offline): a
// leitura perde-se para efeitos de descoberta, mas o treino em si nunca e
// afetado.
function recordPositionHex(latitude, longitude) {
  if (typeof h3 === "undefined") return { hexId: null, isNew: false };

  const resolution = getHexResolution();
  const hexId = h3.latLngToCell(latitude, longitude, resolution);

  const discovered = getDiscoveredHexIds();
  if (discovered.has(hexId)) return { hexId, isNew: false };

  discovered.add(hexId);
  saveDiscoveredHexIds(discovered);

  const queue = getHexQueue();
  queue.push({ hex_id: hexId, resolution, first_seen_at: new Date().toISOString() });
  saveHexQueue(queue);
  flushHexQueue();

  return { hexId, isNew: true };
}

// So depois de haver sessao autenticada (mesmas globais de js/auth.js que
// guardam queueProgressSync/flushTrainingSessionQueue).
async function flushHexQueue() {
  if (!currentUserId || !readyForSync) return;

  const queue = getHexQueue();
  if (queue.length === 0) return;

  const rows = queue.map((h) => ({ user_id: currentUserId, ...h }));
  // ignoreDuplicates: a chave primaria e (user_id, hex_id) - reenviar uma
  // celula ja gravada nao e erro, e um no-op.
  const { error } = await supabaseClient
    .from("discovered_hexes")
    .upsert(rows, { onConflict: "user_id,hex_id", ignoreDuplicates: true });

  if (error) {
    console.warn("Falha ao enviar hexagonos descobertos, tenta de novo mais tarde.", error);
    return;
  }

  saveHexQueue([]);
}

window.addEventListener("online", () => {
  flushHexQueue();
});

// Chamada no arranque pos-login: o Supabase e a fonte de verdade, por isso
// a cache local e substituida pelo que la esta (mais o que ainda estiver por
// enviar, para nao "desaparecerem" descobertas feitas offline).
async function hydrateHexesFromSupabase() {
  if (!currentUserId) return;

  const { data, error } = await supabaseClient
    .from("discovered_hexes")
    .select("hex_id")
    .eq("user_id", currentUserId)
    .eq("resolution", getHexResolution());

  if (error || !data) return;

  const set = new Set(data.map((r) => r.hex_id));
  getHexQueue().forEach((h) => set.add(h.hex_id));
  saveDiscoveredHexIds(set);

  // Regioes desbloqueadas calculadas ja aqui (nao so quando a aba Mapa
  // abre) - a economia precisa de `unlockedConcelhos` para saber onde
  // estao as minas, mesmo que o jogador nunca chegue a abrir o mapa.
  computeUnlockedRegions(loadRegionCache());

  flushHexQueue();
  renderHexMap();
}


// --- Mapa de territorio ----------------------------------------------------
//
// Foto de satelite real, desfocada e a preto-e-branco onde ainda nao se
// treinou, a cores onde ja se pos os pes (2026-09, desenhado num mockup a
// parte - mockup-mapa.html - passo a passo com o jogador antes de entrar
// aqui: mapa real -> desfoque -> so o limite da area desbloqueada, sem
// grelha por dentro -> area bloqueada a cinzento escuro).
//
// Dois niveis de conhecimento do mundo:
//   1. por explorar        - nevoeiro (cinzento escuro, desfocado)
//   2. hexagono descoberto  - a cores, desfocado na mesma
//
// SEM linhas de grelha hexagono-a-hexagono: so um traco na MARGEM da area
// desbloqueada (a uniao dos hexagonos, nao cada um) - a pedido, para nao
// poluir o mapa com uma teia de linhas por dentro do territorio.
//
// Nada disto tem uma regiao escrita no codigo: o distrito/concelho e
// identificado a partir dos proprios hexagonos (identifyRegions) e o
// enquadramento segue o jogador. Os CONTORNOS de concelho/distrito nao se
// desenham no mapa - o desbloqueio continua a valer para a economia
// (secção 21) e o texto "Concelhos: X" por baixo do mapa, so a linha e o
// nome nao aparecem em cima do mapa.
const MAP_TILE_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const MAP_MAX_ZOOM = 17;

// Entrada no mapa: vista geral e depois voo ate onde estas.
const MAP_OVERVIEW_ZOOM = 6;
const MAP_HOME_ZOOM = 14;
const MAP_FLY_DELAY_MS = 900;
const MAP_FLY_DURATION_S = 2.6;

// Um distrito so se revela depois de la se ter descoberto um pedaco - senao
// bastava passar de carro pela fronteira para ganhar o distrito inteiro.
const MIN_HEXES_FOR_REGION = 3;

const hexMapEl = document.getElementById("hex-map");
const hexCountEl = document.getElementById("hex-count");
const hexDistrictEl = document.getElementById("hex-district");
let hexMap = null;
let hexCanvas = null;
let playerMarker = null;
let playerLatLng = null;
// Ultima direcao conhecida, em graus a partir do norte. null enquanto nunca
// se soube - ai nao se mostra cone nenhum.
let playerHeading = null;
let unlockedConcelhos = [];
let territoryOutline = [];

function renderHexCount() {
  if (hexCountEl) hexCountEl.textContent = String(getDiscoveredHexCount());
}

// --- geometria -------------------------------------------------------------

function hexPathIn(cellId, project) {
  let d = "";
  h3.cellToBoundary(cellId).forEach(([lat, lng], i) => {
    const p = project([lat, lng]);
    d += (i ? "L" : "M") + p.x.toFixed(1) + " " + p.y.toFixed(1) + " ";
  });
  return d + "Z";
}

function pointInRing(lat, lng, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function pointInGeoJson(lat, lng, gj) {
  const polys = gj.type === "Polygon" ? [gj.coordinates] : gj.coordinates;
  return polys.some((poly) => pointInRing(lat, lng, poly[0]) && !poly.slice(1).some((hole) => pointInRing(lat, lng, hole)));
}

function countHexesInside(gj) {
  let n = 0;
  getDiscoveredHexIds().forEach((cell) => {
    const [lat, lng] = h3.cellToLatLng(cell);
    if (pointInGeoJson(lat, lng, gj)) n += 1;
  });
  return n;
}

// --- recorte -----------------------------------------------------------
//
// Em "layer points": a origem so muda no zoom, por isso o recorte acompanha
// o arrastar sem ser recalculado a cada frame de "move".
function updateClips() {
  if (!hexMap) return;
  const project = (ll) => hexMap.latLngToLayerPoint(ll);
  const parts = [];
  getDiscoveredHexIds().forEach((c) => parts.push(hexPathIn(c, project)));
  hexMap.getPane("hexclear").style.clipPath = parts.length ? `path("${parts.join(" ")}")` : `path("M0 0Z")`;
}

// Recalculado so quando ha descobertas novas, nao a cada frame.
function rebuildTerritoryOutline() {
  const ids = [...getDiscoveredHexIds()];
  territoryOutline = ids.length ? h3.cellsToMultiPolygon(ids).flat() : [];
}

// Icones das minas no mapa (2026-09-17, a pedido - "nao te esqueças de dar
// update ao icons no mapa") - as mesmas imagens ilustradas de js/icons.js
// (ICON_IMAGE_NAMES/ICON_IMAGE_BASE_PATH/ICON_IMAGE_V, carrega antes deste
// ficheiro), pre-carregadas UMA VEZ e reaproveitadas em cada desenho do
// canvas (drawHexGrid corre a cada pan/zoom do Leaflet) - ctx.drawImage()
// precisa de um Image() ja carregado, ao contrario do ctx.fillText() de um
// emoji, que nao precisa de mais nada. Atualizar um destes .png (o Victor
// so tem de substituir o ficheiro) aparece aqui automaticamente, sem tocar
// em código - e exatamente o que faltava antes desta mudança.
// Lado do icone desenhado no mapa, em px de ecra - antes disto era so o
// tamanho da fonte do emoji (19px); mantido parecido para o footprint no
// mapa nao mudar de repente.
const MINE_ICON_SIZE_PX = 22;
const mineIconImages = {};
if (typeof ICON_IMAGE_NAMES !== "undefined") {
  ICON_IMAGE_NAMES.forEach((id) => {
    const img = new Image();
    img.src = ICON_IMAGE_BASE_PATH + id + ".png?v=" + ICON_IMAGE_V;
    // So uma mina ja encontrada e visivel nesse momento beneficia de um
    // redesenho extra ao carregar - sem isto, a 1a mina ficava com o
    // emoji de recurso (fallback abaixo) ate ao proximo pan/zoom.
    img.onload = () => { if (typeof redrawHexMap === "function") redrawHexMap(); };
    mineIconImages[id] = img;
  });
}

function drawHexGrid() {
  if (!hexMap || !hexCanvas) return;
  const size = hexMap.getSize();
  if (size.x === 0 || size.y === 0) return;

  // Largura E altura: so a largura nao chega. No telemovel a barra de
  // endereco recolhe/aparece e muda so a altura do contentor - o canvas
  // ficava curto e a grelha acabava a meio, com uma costura horizontal a
  // atravessar o mapa.
  const ratio = window.devicePixelRatio || 1;
  const wantW = Math.round(size.x * ratio);
  const wantH = Math.round(size.y * ratio);
  if (hexCanvas.width !== wantW || hexCanvas.height !== wantH) {
    hexCanvas.width = wantW;
    hexCanvas.height = wantH;
    hexCanvas.style.width = `${size.x}px`;
    hexCanvas.style.height = `${size.y}px`;
  }
  // O canvas vive num pane arrastado pelo Leaflet - anula-se essa translacao
  // para poder desenhar em coordenadas de ecra.
  const origin = hexMap.containerPointToLayerPoint([0, 0]);
  hexCanvas.style.transform = `translate(${origin.x}px, ${origin.y}px)`;

  const ctx = hexCanvas.getContext("2d");
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, size.x, size.y);

  const bounds = hexMap.getBounds();
  const project = (ll) => hexMap.latLngToContainerPoint(ll);

  // Minas encontradas: icone do recurso por cima do hexagono dela. So as
  // ENCONTRADAS: as outras nao estao visiveis ate se la chegar, e o unico
  // sinal delas e o aviso sonoro a 500 m (secção 21).
  //
  // Ao contrario dos hexagonos acima, estes nao dependem da resolucao
  // desenhada - uma mina e um ponto, nao um hexagono, por isso faz sentido
  // em qualquer zoom.
  if (typeof todasAsMinas === "function") {
    const encontradas = getMinasEncontradas();
    const visitas = typeof getHexVisits === "function" ? getHexVisits() : {};
    // So usados no fallback ao emoji, ver dentro do forEach abaixo.
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "19px system-ui, -apple-system, sans-serif";

    todasAsMinas().forEach((mina) => {
      if (!encontradas.has(mina.id)) return;
      if (!bounds.contains([mina.lat, mina.lng])) return;
      const p = project([mina.lat, mina.lng]);

      // Anel a marcar o quanto a mina esta desenvolvida: e o multiplicador do
      // hexagono dela. Sem isto nao havia forma de ver no mapa quais das
      // minas ja renderem mais.
      const mult = typeof multiplicadorDoHex === "function" ? multiplicadorDoHex(mina.hexId, visitas) : 1;
      if (mult > 1.01) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 15, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ((mult - 1) / 1));
        ctx.lineWidth = 3;
        ctx.strokeStyle = RESOURCE_BY_ID[mina.recurso].cor;
        ctx.stroke();
      }

      // Icone ilustrado (mineIconImages, ver acima) se ja tiver carregado;
      // fallback ao emoji de RESOURCE_BY_ID[...].icone enquanto isso nao
      // acontece (so no 1o desenho do mapa numa sessao) ou se um dia faltar
      // algum ficheiro - nunca fica sem icone nenhum.
      //
      // Halo escuro em duas passagens e uma limpa por cima: o fundo
      // desfocado varia de escuro a claro e um icone sem contraste proprio
      // desaparece nos claros. Aplica-se aos dois casos (drawImage tambem
      // respeita shadowColor/shadowBlur, nao so fillText).
      const img = mineIconImages[mina.recurso];
      ctx.shadowColor = "rgba(0,0,0,0.9)";
      if (img && img.complete && img.naturalWidth > 0) {
        ctx.shadowBlur = 6;
        ctx.drawImage(img, p.x - MINE_ICON_SIZE_PX / 2, p.y - MINE_ICON_SIZE_PX / 2, MINE_ICON_SIZE_PX, MINE_ICON_SIZE_PX);
        ctx.shadowBlur = 0;
      } else {
        ctx.shadowBlur = 6;
        ctx.fillText(RESOURCE_BY_ID[mina.recurso].icone, p.x, p.y);
        ctx.fillText(RESOURCE_BY_ID[mina.recurso].icone, p.x, p.y);
        ctx.shadowBlur = 0;
        ctx.fillText(RESOURCE_BY_ID[mina.recurso].icone, p.x, p.y);
      }
    });
  }

  // Contorno da UNIAO do territorio, nao de cada hexagono - senao a fronteira
  // sai um emaranhado de linhas.
  if (territoryOutline.length) {
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(255,214,150,0.9)";
    ctx.shadowColor = "rgba(255,190,110,0.9)";
    ctx.shadowBlur = 8;
    territoryOutline.forEach((ring) => {
      ctx.beginPath();
      ring.forEach(([lat, lng], i) => {
        const p = project([lat, lng]);
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.closePath();
      ctx.stroke();
    });
    ctx.shadowBlur = 0;
  }

}

function redrawHexMap() {
  drawHexGrid();
}

// --- concelhos e distritos -------------------------------------------------
//
// Nao ha nenhuma regiao escrita no codigo: pergunta-se ao Nominatim (OSM) em
// que unidade administrativa cai cada zona descoberta e guarda-se a fronteira
// que vier.
//
// O que se DESBLOQUEIA e o CONCELHO, nao o distrito. Um distrito e grande
// demais para ser objetivo (Braga: 56 x 83 km) - desbloqueia-se uma vez e
// passam-se meses sem acontecer mais nada. Um concelho (Braga: 17 x 19 km)
// atravessa-se numa volta de bicicleta, e sao 308 em Portugal em vez de 18.
// O distrito fica como o nivel de cima, so na vista geral.
//
// Chegar ao concelho da trabalho: o `reverse` do Nominatim salta do distrito
// (nivel 6) direto para a freguesia (nivel 8) em todos os zooms - o concelho
// (nivel 7) nunca aparece. Por isso sao tres passos:
//   1. reverse   -> a freguesia do ponto
//   2. details   -> a hierarquia administrativa acima dela
//   3. lookup    -> as fronteiras do concelho E do distrito, num pedido so
// A fronteira do concelho vem 7x mais leve que a do distrito (1,9 KB contra
// 13,8 KB), por isso desenhar e recortar sai mais barato do que antes.
const NOMINATIM_GAP_MS = 1100;
const REGION_LOOKUPS_PER_OPEN = 2;
const REGION_CACHE_VERSION = 2;

// Nivel administrativo em Portugal: 7 = concelho/municipio, 6 = distrito.
const ADMIN_LEVEL_CONCELHO = 7;
const ADMIN_LEVEL_DISTRITO = 6;

function loadRegionCache() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY_DISTRICTS) || "{}");
    // Versao antiga guardava distritos: deita-se fora, e so cache.
    if (parsed.v !== REGION_CACHE_VERSION) return { v: REGION_CACHE_VERSION, concelhos: [], distritos: [] };
    return {
      v: REGION_CACHE_VERSION,
      concelhos: Array.isArray(parsed.concelhos) ? parsed.concelhos : [],
      distritos: Array.isArray(parsed.distritos) ? parsed.distritos : [],
    };
  } catch (e) {
    return { v: REGION_CACHE_VERSION, concelhos: [], distritos: [] };
  }
}

function saveRegionCache(cache) {
  localStorage.setItem(STORAGE_KEY_DISTRICTS, JSON.stringify(cache));
}

const sleepMs = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Um hexagono so vale a pena perguntar se ainda nao cai dentro de nenhum
// concelho conhecido - e isso testa-se aqui, de graca. Assim o custo e de
// ~3 pedidos por concelho NOVO e zero enquanto se anda pelos ja conhecidos,
// em vez de um pedido por zona grande do mapa.
function regionCandidates(cache, limit) {
  const known = cache.concelhos.map((c) => c.geojson);
  const seen = new Set();
  const out = [];
  for (const cell of getDiscoveredHexIds()) {
    const [lat, lng] = h3.cellToLatLng(cell);
    if (known.some((gj) => pointInGeoJson(lat, lng, gj))) continue;
    // Uma amostra por zona de ~8 km (resolucao 6) - mais fina que o concelho
    // mais pequeno, para nenhum passar despercebido.
    const coarse = h3.cellToParent(cell, 6);
    if (seen.has(coarse)) continue;
    seen.add(coarse);
    out.push([lat, lng]);
    if (out.length >= limit) break;
  }
  return out;
}

async function fetchJson(url) {
  const response = await fetch(url);
  return response.json();
}

// Devolve { concelho, distrito } com nome, id e fronteira, ou null.
async function resolveRegionAt(lat, lng) {
  const freguesia = await fetchJson(
    `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=jsonv2&zoom=11`
  );
  if (!freguesia || !freguesia.osm_id) return null;
  await sleepMs(NOMINATIM_GAP_MS);

  const osmType = String(freguesia.osm_type || "R")[0].toUpperCase();
  const details = await fetchJson(
    `https://nominatim.openstreetmap.org/details?osmtype=${osmType}&osmid=${freguesia.osm_id}&addressdetails=1&format=json`
  );
  const hierarquia = (details && details.address) || [];
  const concelho = hierarquia.find((a) => Number(a.admin_level) === ADMIN_LEVEL_CONCELHO && a.osm_id);
  const distrito = hierarquia.find((a) => Number(a.admin_level) === ADMIN_LEVEL_DISTRITO && a.osm_id);
  if (!concelho) return null;
  await sleepMs(NOMINATIM_GAP_MS);

  // As duas fronteiras num pedido so (o lookup aceita varios ids).
  const ids = [concelho, distrito].filter(Boolean).map((a) => `${String(a.osm_type)[0].toUpperCase()}${a.osm_id}`);
  const shapes = await fetchJson(
    `https://nominatim.openstreetmap.org/lookup?osm_ids=${ids.join(",")}&format=jsonv2&polygon_geojson=1&polygon_threshold=0.0008`
  );
  const byId = new Map((shapes || []).map((s) => [s.osm_id, s]));

  const shapeConcelho = byId.get(concelho.osm_id);
  if (!shapeConcelho || !shapeConcelho.geojson) return null;

  const shapeDistrito = distrito ? byId.get(distrito.osm_id) : null;
  return {
    concelho: {
      osmId: concelho.osm_id,
      name: concelho.localname || shapeConcelho.name,
      distritoOsmId: distrito ? distrito.osm_id : null,
      geojson: shapeConcelho.geojson,
    },
    distrito:
      shapeDistrito && shapeDistrito.geojson
        ? { osmId: distrito.osm_id, name: distrito.localname, geojson: shapeDistrito.geojson }
        : null,
  };
}

async function identifyRegions() {
  const cache = loadRegionCache();
  const candidates = regionCandidates(cache, REGION_LOOKUPS_PER_OPEN);
  if (candidates.length === 0) return;

  let changed = false;
  for (const [lat, lng] of candidates) {
    try {
      const found = await resolveRegionAt(lat, lng);
      if (found) {
        if (!cache.concelhos.some((c) => c.osmId === found.concelho.osmId)) {
          cache.concelhos.push(found.concelho);
          changed = true;
        }
        if (found.distrito && !cache.distritos.some((d) => d.osmId === found.distrito.osmId)) {
          cache.distritos.push(found.distrito);
          changed = true;
        }
      }
    } catch (e) {
      // Sem rede ou servico em baixo: fica por identificar e tenta-se noutra
      // abertura do mapa. O resto do mapa nunca e afetado.
    }
    await sleepMs(NOMINATIM_GAP_MS);
  }

  if (changed) {
    saveRegionCache(cache);
    applyRegions(cache);
  }
}

// So a parte de DADOS de applyRegions: que concelhos/distritos estao
// desbloqueados. Nao precisa do mapa (so de h3 + do conjunto de hexes
// descobertos), por isso pode correr no arranque - a economia (js/resources.js
// todasAsMinas/producaoPorHora) precisa disto mesmo sem a aba Mapa aberta.
function computeUnlockedRegions(cache) {
  if (typeof h3 === "undefined" || !cache || !cache.concelhos) return;
  unlockedConcelhos = cache.concelhos.filter((c) => countHexesInside(c.geojson) >= MIN_HEXES_FOR_REGION);
}

// Concelho/distrito deixaram de se desenhar no mapa (a pedido) - fica so o
// texto "Concelhos: X" (fora do mapa). `cache.distritos` continua a ser
// guardado por identifyRegions/resolveRegionAt (vem de borla no mesmo pedido
// do concelho), mesmo sem consumidor agora - fica disponivel se um dia se
// quiser voltar a mostrar o distrito nalgum sitio.
function applyRegions(cache) {
  computeUnlockedRegions(cache);

  if (hexDistrictEl) {
    hexDistrictEl.textContent = unlockedConcelhos.length
      ? unlockedConcelhos.map((c) => c.name).join(", ")
      : "nenhum ainda";
  }

  if (hexMap) {
    updateClips();
    redrawHexMap();
  }

  // Um concelho novo desbloqueado pode concluir uma missao mensal (secção 22).
  if (typeof verificarMissaoAtiva === "function") verificarMissaoAtiva();
}
// --- onde estas ------------------------------------------------------------
//
// Chamada tambem por js/training.js a cada leitura de GPS, para o ponto
// acompanhar quem esta a treinar com o mapa aberto.
// heading: graus no sentido dos ponteiros a partir do norte, como vem do GPS
// (coords.heading). Vem null parado ou em aparelhos que nao o dao - nesse caso
// mantem-se a ultima direcao conhecida em vez de fazer o cone saltar para
// norte, que seria uma informacao FALSA e nao "sem informacao".
function setMapPlayerPosition(latitude, longitude, heading) {
  playerLatLng = [latitude, longitude];
  if (Number.isFinite(heading)) playerHeading = heading;

  if (playerMarker) {
    playerMarker.setLatLng(playerLatLng);
    playerMarker.setOpacity(1);
    aplicarDirecaoDoJogador();
  }
}

// A rotacao vai num elemento INTERIOR e nao no proprio marcador: o Leaflet
// escreve um transform de posicao no contentor do marcador a cada movimento
// do mapa, e rodar la seria sobrescrito no frame seguinte.
function aplicarDirecaoDoJogador() {
  const el = playerMarker && playerMarker.getElement();
  if (!el) return;
  const cone = el.querySelector(".hex-player-rot");
  if (!cone) return;
  const temDirecao = Number.isFinite(playerHeading);
  cone.style.display = temDirecao ? "block" : "none";
  if (temDirecao) cone.style.transform = "rotate(" + playerHeading + "deg)";
}

// Uma leitura so, a abrir o mapa - nao um watchPosition permanente, que
// gastaria bateria a olhar para um ecra parado.
function locatePlayer() {
  if (!navigator.geolocation) return Promise.resolve(playerLatLng);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setMapPlayerPosition(pos.coords.latitude, pos.coords.longitude, pos.coords.heading);
        resolve(playerLatLng);
      },
      () => resolve(playerLatLng),
      { timeout: 6000, maximumAge: 60000 }
    );
  });
}

// Botao "recentrar": volta a apanhar a posicao e voa ate la. Sem GPS
// (negado, ou ainda sem resposta) cai para o centro do territorio ja
// descoberto, para o botao nunca ficar sem fazer nada.
async function recenterOnPlayer(ev) {
  if (ev) L.DomEvent.stop(ev);
  const btn = hexMapEl.querySelector(".hex-recenter-btn");
  if (btn) btn.classList.add("locating");

  const target = (await locatePlayer()) || territoryCenter();
  if (btn) btn.classList.remove("locating");
  if (!target) return;

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    hexMap.setView(target, MAP_HOME_ZOOM, { animate: false });
    return;
  }
  hexMap.flyTo(target, MAP_HOME_ZOOM, { duration: 1.2 });
}

function addRecenterControl() {
  const Recenter = L.Control.extend({
    options: { position: "topright" },
    onAdd() {
      const btn = L.DomUtil.create("button", "hex-recenter-btn");
      btn.type = "button";
      btn.title = "Recentrar em mim";
      btn.setAttribute("aria-label", "Recentrar em mim");
      btn.innerHTML =
        '<svg viewBox="0 0 24 24" aria-hidden="true">' +
        '<circle cx="12" cy="12" r="4"></circle>' +
        '<circle cx="12" cy="12" r="8"></circle>' +
        '<path d="M12 1v3M12 20v3M1 12h3M20 12h3"></path>' +
        "</svg>";
      // Sem isto, clicar no botao tambem arrasta/zooma o mapa por baixo.
      L.DomEvent.disableClickPropagation(btn);
      L.DomEvent.on(btn, "click", recenterOnPlayer);
      return btn;
    },
  });
  hexMap.addControl(new Recenter());
}

// Centro do territorio ja descoberto - usado quando o GPS esta negado ou
// ainda nao respondeu.
function territoryCenter() {
  const ids = [...getDiscoveredHexIds()];
  if (ids.length === 0) return null;
  let lat = 0;
  let lng = 0;
  ids.forEach((id) => {
    const [a, b] = h3.cellToLatLng(id);
    lat += a;
    lng += b;
  });
  return [lat / ids.length, lng / ids.length];
}

// --- criacao e entrada -----------------------------------------------------

function createHexMap() {
  hexMap = L.map(hexMapEl, { minZoom: 3, maxZoom: MAP_MAX_ZOOM });
  hexMap.attributionControl.addAttribution("Fronteiras: OpenStreetMap");
  hexMap.setView([39.5, -8.0], MAP_OVERVIEW_ZOOM);

  // hexfog/hexclear: a MESMA foto de satelite em duas panes, distinguidas so
  // pelo filtro CSS (cinzento escuro vs a cores) e pelo recorte (updateClips)
  // - o browser so descarrega os tiles uma vez, a segunda pane sai da cache
  // HTTP. hexgrid: canvas com os icones das minas + o contorno do territorio.
  // hexplayer: o marcador do jogador, por cima de tudo.
  [["hexfog", 200], ["hexclear", 300], ["hexgrid", 400], ["hexplayer", 550]].forEach(([name, z]) => {
    hexMap.createPane(name);
    hexMap.getPane(name).style.zIndex = z;
  });
  hexMap.getPane("hexgrid").style.pointerEvents = "none";

  ["hexfog", "hexclear"].forEach((pane) => {
    L.tileLayer(MAP_TILE_URL, { pane, maxZoom: MAP_MAX_ZOOM }).addTo(hexMap);
  });
  // Ate haver descobertas, so se ve o nevoeiro.
  hexMap.getPane("hexclear").style.clipPath = `path("M0 0Z")`;

  hexCanvas = document.createElement("canvas");
  hexCanvas.className = "hex-map-canvas";
  hexMap.getPane("hexgrid").appendChild(hexCanvas);

  playerMarker = L.marker([0, 0], {
    pane: "hexplayer",
    interactive: false,
    keyboard: false,
    opacity: 0, // so aparece quando ha posicao real
    icon: L.divIcon({
      className: "hex-player-dot",
      html: '<span class="hex-player-rot"><span class="hex-player-cone"></span></span><i></i>',
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    }),
  }).addTo(hexMap);

  addRecenterControl();

  // O canvas trabalha em coordenadas de ecra: redesenha a cada movimento. O
  // recorte so muda no zoom (layer points).
  hexMap.on("move zoom viewreset resize", redrawHexMap);
  hexMap.on("zoom zoomend viewreset resize", updateClips);
}

// Sempre que se entra no mapa: vista geral e depois voo ate onde estas, a
// pedido. Centrada no jogador e nao numa regiao fixa - funciona em qualquer
// pais.
async function enterHexMapMode() {
  const start = playerLatLng || territoryCenter();
  if (start) hexMap.setView(start, MAP_OVERVIEW_ZOOM, { animate: false });
  redrawHexMap();
  updateClips();

  const target = (await locatePlayer()) || territoryCenter();
  if (!target) return;

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    hexMap.setView(target, MAP_HOME_ZOOM, { animate: false });
    return;
  }
  setTimeout(() => hexMap.flyTo(target, MAP_HOME_ZOOM, { duration: MAP_FLY_DURATION_S }), MAP_FLY_DELAY_MS);
}

function renderHexMap() {
  renderHexCount();
  if (!hexMapEl || typeof L === "undefined" || typeof h3 === "undefined") return;

  if (hexMap === null) createHexMap();
  if (typeof startResourcesTicker === "function") startResourcesTicker();

  rebuildTerritoryOutline();
  applyRegions(loadRegionCache());
  redrawHexMap();
  identifyRegions();
  enterHexMapMode();
}

// O Leaflet calcula mal o tamanho quando o contentor estava escondido
// (display:none) no momento em que o mapa foi criado - a sub-aba Missoes esta
// escondida ate ser aberta. invalidateSize() forca o recalculo.
function refreshHexMapSize() {
  if (hexMap) {
    hexMap.invalidateSize();
    redrawHexMap();
    updateClips();
  }
}
