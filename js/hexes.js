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

  flushHexQueue();
  renderHexMap();
}


// --- Mapa de territorio ----------------------------------------------------
//
// Imagem de satelite real usada como TEXTURA, nao como mapa: desfocada, sem
// cor e escurecida onde ainda nao se treinou. A pedido (2026-08-15):
// "imagina o mapa em vista satelite mas com um desfoque".
//
// Tres niveis de conhecimento do mundo, do mais escuro ao mais claro:
//   1. por explorar          - cinzento, desfocado, escuro
//   2. distrito desbloqueado - o mesmo, um pouco mais claro (sabes que e teu
//                              para explorar, mas ainda nao la puseste os pes)
//   3. hexagono descoberto   - a cores e quase nitido
//
// Nada disto tem uma regiao escrita no codigo: o distrito e identificado a
// partir dos proprios hexagonos (identifyRegions) e o enquadramento segue o
// jogador. Para o Skllrx da Braga porque foi so onde treinou; para outro
// jogador dara o distrito dele.
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
let hexConcelhoLayer = null;
let hexDistritoLayer = null;
let playerMarker = null;
let playerLatLng = null;
let unlockedConcelhos = [];
let unlockedDistritos = [];
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

// GeoJSON vem em [lng, lat]; o Leaflet projeta em [lat, lng].
function ringPathIn(ring, project) {
  let d = "";
  ring.forEach(([lng, lat], i) => {
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

// --- recortes --------------------------------------------------------------
//
// Trabalham em "layer points", cuja origem so muda no zoom: nao e preciso
// recalcula-los ao arrastar, e a fronteira de um distrito tem milhares de
// vertices.
function updateClips() {
  if (!hexMap) return;
  const project = (ll) => hexMap.latLngToLayerPoint(ll);

  const hexParts = [];
  getDiscoveredHexIds().forEach((c) => hexParts.push(hexPathIn(c, project)));
  hexMap.getPane("hexclear").style.clipPath = hexParts.length ? `path("${hexParts.join(" ")}")` : `path("M0 0Z")`;

  const districtParts = [];
  unlockedConcelhos.forEach(({ geojson }) => {
    const polys = geojson.type === "Polygon" ? [geojson.coordinates] : geojson.coordinates;
    polys.forEach((poly) => poly.forEach((ring) => districtParts.push(ringPathIn(ring, project))));
  });
  hexMap.getPane("hexdistrictfog").style.clipPath = districtParts.length ? `path("${districtParts.join(" ")}")` : `path("M0 0Z")`;
}

// --- grelha ----------------------------------------------------------------
//
// A grelha acompanha o zoom: os hexagonos de descoberta (resolucao 9, ~427m)
// desenhados ao nivel de um pais seriam dezenas de milhar de poligonos de
// 1px. Escolhe-se a resolucao pelo tamanho aparente NO ECRA, e nao por uma
// tabela de niveis de zoom - assim o resultado e igual em qualquer latitude e
// em qualquer tamanho de ecra.
const H3_CELL_DIAMETER_M = { 5: 21300, 6: 8060, 7: 3050, 8: 1150, 9: 435 };
const GRID_TARGET_PX = 40;
const MAX_GRID_CELLS = 4000;

// Escolhas do jogador no mockup: SEM linhas de grelha, mas COM o sombreado
// por hexagono - o mosaico continua a ler-se pelas manchas, sem a malha
// desenhada por cima da imagem.
const SHOW_GRID_LINES = false;
const SHOW_HEX_SHADING = true;

function gridResolution() {
  const size = hexMap.getSize();
  const a = hexMap.containerPointToLatLng([0, size.y / 2]);
  const b = hexMap.containerPointToLatLng([100, size.y / 2]);
  const metersPerPixel = hexMap.distance(a, b) / 100;

  let best = 9;
  let bestErr = Infinity;
  for (const res of [5, 6, 7, 8, 9]) {
    const err = Math.abs(H3_CELL_DIAMETER_M[res] / metersPerPixel - GRID_TARGET_PX);
    if (err < bestErr) { bestErr = err; best = res; }
  }
  return best;
}

// Recalculado so quando ha descobertas novas, nao a cada frame.
function rebuildTerritoryOutline() {
  const ids = [...getDiscoveredHexIds()];
  territoryOutline = ids.length ? h3.cellsToMultiPolygon(ids).flat() : [];
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
  const viewport = [
    [bounds.getNorth(), bounds.getWest()], [bounds.getNorth(), bounds.getEast()],
    [bounds.getSouth(), bounds.getEast()], [bounds.getSouth(), bounds.getWest()],
  ];
  const res = gridResolution();
  let cells = [];
  try { cells = h3.polygonToCells(viewport, res); } catch (e) { cells = []; }
  if (cells.length > MAX_GRID_CELLS) cells = [];

  const project = (ll) => hexMap.latLngToContainerPoint(ll);
  const discovered = getDiscoveredHexIds();
  const discoveryRes = getHexResolution();

  if (SHOW_GRID_LINES || SHOW_HEX_SHADING) {
    cells.forEach((cell) => {
      const isMine = res === discoveryRes && discovered.has(cell);
      const path = new Path2D(hexPathIn(cell, project));
      if (SHOW_HEX_SHADING && !isMine) {
        // Leve variacao de escuridao por hexagono: da a leitura de "peca" em
        // vez de fotografia continua.
        const jitter = Math.abs(Math.sin(parseInt(cell.slice(-6), 16) || 1)) * 0.16;
        ctx.fillStyle = `rgba(6,10,16,${0.1 + jitter})`;
        ctx.fill(path);
      }
      if (SHOW_GRID_LINES) {
        ctx.lineWidth = 1;
        ctx.strokeStyle = isMine ? "rgba(255,255,255,0.22)" : "rgba(0,0,0,0.35)";
        ctx.stroke(path);
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

// Afastado, o escurecimento deixa o pais irreconhecivel - o nevoeiro passa a
// ser so uma mancha preta. Alivia-se com o zoom: vista geral legivel,
// nevoeiro cerrado ao perto, que e onde a exploracao se nota.
function updateFogLift() {
  const t = Math.min(1, Math.max(0, (12 - hexMap.getZoom()) / 5));
  hexMapEl.style.setProperty("--hexmap-fog-lift", String(1 + t));
}

function redrawHexMap() {
  drawHexGrid();
  updateFogLift();
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

// Abaixo deste zoom mostra-se o distrito; a partir dele, os concelhos. Um
// concelho ocupa praticamente o ecra de um telemovel no zoom 11, por isso e
// dai para cima que faz sentido ler os nomes deles.
const CONCELHO_LABEL_MIN_ZOOM = 11;

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

function applyRegions(cache) {
  if (!hexMap) return;

  unlockedConcelhos = cache.concelhos.filter((c) => countHexesInside(c.geojson) >= MIN_HEXES_FOR_REGION);
  // So se mostra o distrito que tem pelo menos um concelho ja desbloqueado.
  const distritosAtivos = new Set(unlockedConcelhos.map((c) => c.distritoOsmId));
  unlockedDistritos = cache.distritos.filter((d) => distritosAtivos.has(d.osmId));

  hexConcelhoLayer.clearLayers();
  unlockedConcelhos.forEach(({ name, geojson }) => {
    L.geoJSON(geojson, {
      pane: "hexdistrict",
      interactive: false,
      style: { color: "#ffd48a", weight: 2, opacity: 0.9, dashArray: "7 5", fill: true, fillColor: "#ffcf80", fillOpacity: 0.05 },
    }).addTo(hexConcelhoLayer);

    L.marker(L.geoJSON(geojson).getBounds().getCenter(), {
      pane: "hexdistrict",
      interactive: false,
      keyboard: false,
      icon: L.divIcon({ className: "hex-region-label", html: name, iconSize: null }),
    }).addTo(hexConcelhoLayer);
  });

  hexDistritoLayer.clearLayers();
  unlockedDistritos.forEach(({ name, geojson }) => {
    L.geoJSON(geojson, {
      pane: "hexdistrict",
      interactive: false,
      style: { color: "#ffd48a", weight: 1.5, opacity: 0.6, dashArray: "10 7", fill: false },
    }).addTo(hexDistritoLayer);

    // "distrito de X" por extenso: o concelho e o distrito tem muitas vezes
    // o mesmo nome (Braga e Braga) e sem isto parecia um bug.
    L.marker(L.geoJSON(geojson).getBounds().getCenter(), {
      pane: "hexdistrict",
      interactive: false,
      keyboard: false,
      icon: L.divIcon({ className: "hex-region-label distrito", html: `distrito de ${name}`, iconSize: null }),
    }).addTo(hexDistritoLayer);
  });

  if (hexDistrictEl) {
    hexDistrictEl.textContent = unlockedConcelhos.length
      ? unlockedConcelhos.map((c) => c.name).join(", ")
      : "nenhum ainda";
  }

  updateRegionZoomLevel();
  updateClips();
}

// A pedido: o distrito so aparece na vista geral; a partir do momento em que
// se aproxima, quem se ve sao os concelhos desbloqueados. Nunca os dois ao
// mesmo tempo - com nomes iguais, ficava ilegivel.
function updateRegionZoomLevel() {
  if (!hexMap || !hexConcelhoLayer || !hexDistritoLayer) return;
  const perto = hexMap.getZoom() >= CONCELHO_LABEL_MIN_ZOOM;

  if (perto && !hexMap.hasLayer(hexConcelhoLayer)) hexMap.addLayer(hexConcelhoLayer);
  if (!perto && hexMap.hasLayer(hexConcelhoLayer)) hexMap.removeLayer(hexConcelhoLayer);
  if (!perto && !hexMap.hasLayer(hexDistritoLayer)) hexMap.addLayer(hexDistritoLayer);
  if (perto && hexMap.hasLayer(hexDistritoLayer)) hexMap.removeLayer(hexDistritoLayer);
}
// --- onde estas ------------------------------------------------------------
//
// Chamada tambem por js/training.js a cada leitura de GPS, para o ponto
// acompanhar quem esta a treinar com o mapa aberto.
function setMapPlayerPosition(latitude, longitude) {
  playerLatLng = [latitude, longitude];
  if (playerMarker) {
    playerMarker.setLatLng(playerLatLng);
    playerMarker.setOpacity(1);
  }
}

// Uma leitura so, a abrir o mapa - nao um watchPosition permanente, que
// gastaria bateria a olhar para um ecra parado.
function locatePlayer() {
  if (!navigator.geolocation) return Promise.resolve(playerLatLng);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setMapPlayerPosition(pos.coords.latitude, pos.coords.longitude);
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
  hexMap.attributionControl.addAttribution("Imagem: Esri &mdash; Fronteiras: OpenStreetMap");
  hexMap.setView([39.5, -8.0], MAP_OVERVIEW_ZOOM);

  [["hexfog", 200], ["hexdistrictfog", 250], ["hexclear", 300],
   ["hexgrid", 400], ["hexdistrict", 450], ["hexplayer", 550]].forEach(([name, z]) => {
    hexMap.createPane(name);
    hexMap.getPane(name).style.zIndex = z;
  });
  ["hexgrid", "hexdistrict", "hexplayer"].forEach((name) => {
    hexMap.getPane(name).style.pointerEvents = "none";
  });

  // A MESMA imagem em tres camadas; o que as distingue e o filtro CSS e o
  // recorte. O browser so descarrega os tiles uma vez - as outras duas
  // camadas saem da cache HTTP.
  ["hexfog", "hexdistrictfog", "hexclear"].forEach((pane) => {
    L.tileLayer(MAP_TILE_URL, { pane, maxZoom: MAP_MAX_ZOOM }).addTo(hexMap);
  });
  // Ate haver descobertas, so se ve o nevoeiro.
  hexMap.getPane("hexdistrictfog").style.clipPath = `path("M0 0Z")`;
  hexMap.getPane("hexclear").style.clipPath = `path("M0 0Z")`;

  hexCanvas = document.createElement("canvas");
  hexCanvas.className = "hex-map-canvas";
  hexMap.getPane("hexgrid").appendChild(hexCanvas);

  hexConcelhoLayer = L.layerGroup([], { pane: "hexdistrict" });
  hexDistritoLayer = L.layerGroup([], { pane: "hexdistrict" });

  playerMarker = L.marker([0, 0], {
    pane: "hexplayer",
    interactive: false,
    keyboard: false,
    opacity: 0, // so aparece quando ha posicao real
    icon: L.divIcon({ className: "hex-player-dot", html: "<i></i>", iconSize: [14, 14], iconAnchor: [7, 7] }),
  }).addTo(hexMap);

  addRecenterControl();

  // O canvas trabalha em coordenadas de ecra: redesenha a cada movimento. Os
  // recortes so mudam quando muda o zoom.
  hexMap.on("move zoom viewreset resize", redrawHexMap);
  hexMap.on("zoom zoomend viewreset resize", updateClips);
  // Distrito na vista geral, concelhos ao aproximar.
  hexMap.on("zoomend", updateRegionZoomLevel);
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
