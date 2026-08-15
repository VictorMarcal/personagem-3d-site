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
// partir dos proprios hexagonos (identifyDistricts) e o enquadramento segue o
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
const MIN_HEXES_FOR_DISTRICT = 3;

const hexMapEl = document.getElementById("hex-map");
const hexCountEl = document.getElementById("hex-count");
const hexDistrictEl = document.getElementById("hex-district");
let hexMap = null;
let hexCanvas = null;
let hexDistrictLayer = null;
let playerMarker = null;
let playerLatLng = null;
let unlockedDistricts = [];
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
  unlockedDistricts.forEach(({ geojson }) => {
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

  const ratio = window.devicePixelRatio || 1;
  if (hexCanvas.width !== Math.round(size.x * ratio)) {
    hexCanvas.width = Math.round(size.x * ratio);
    hexCanvas.height = Math.round(size.y * ratio);
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

  cells.forEach((cell) => {
    const isMine = res === discoveryRes && discovered.has(cell);
    const path = new Path2D(hexPathIn(cell, project));
    if (!isMine) {
      // Leve variacao de escuridao por hexagono: da a leitura de "peca" em
      // vez de fotografia continua.
      const jitter = Math.abs(Math.sin(parseInt(cell.slice(-6), 16) || 1)) * 0.16;
      ctx.fillStyle = `rgba(6,10,16,${0.1 + jitter})`;
      ctx.fill(path);
    }
    ctx.lineWidth = 1;
    ctx.strokeStyle = isMine ? "rgba(255,255,255,0.22)" : "rgba(0,0,0,0.35)";
    ctx.stroke(path);
  });

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

// --- distritos -------------------------------------------------------------
//
// Nao ha nenhum distrito escrito no codigo: pergunta-se ao Nominatim (OSM) em
// que unidade administrativa cai cada zona ja descoberta e guarda-se a
// fronteira que vier. O servico permite 1 pedido por segundo, por isso o
// resultado fica em cache e so se perguntam zonas NOVAS - abrir o mapa outra
// vez nao gasta pedidos nenhuns.
const NOMINATIM_GAP_MS = 1100;
const DISTRICT_SAMPLES_PER_OPEN = 4;

function loadDistrictCache() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY_DISTRICTS) || "{}");
    return {
      asked: Array.isArray(parsed.asked) ? parsed.asked : [],
      districts: Array.isArray(parsed.districts) ? parsed.districts : [],
    };
  } catch (e) {
    return { asked: [], districts: [] };
  }
}

function saveDistrictCache(cache) {
  localStorage.setItem(STORAGE_KEY_DISTRICTS, JSON.stringify(cache));
}

const sleepMs = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function identifyDistricts() {
  const cache = loadDistrictCache();
  const asked = new Set(cache.asked);

  // Uma amostra por zona grande (resolucao 5, ~21km): chega para apanhar
  // todos os distritos tocados sem fazer um pedido por hexagono.
  const pending = new Map();
  getDiscoveredHexIds().forEach((cell) => {
    const coarse = h3.cellToParent(cell, 5);
    if (!asked.has(coarse) && !pending.has(coarse)) pending.set(coarse, h3.cellToLatLng(cell));
  });

  const batch = [...pending.entries()].slice(0, DISTRICT_SAMPLES_PER_OPEN);
  if (batch.length === 0) return;

  for (const [coarse, [lat, lng]] of batch) {
    try {
      // polygon_threshold simplifica a fronteira no servidor: menos vertices
      // para desenhar e para recortar, sem perder a forma do distrito.
      const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=jsonv2&zoom=8&polygon_geojson=1&polygon_threshold=0.0008`;
      const data = await (await fetch(url)).json();
      asked.add(coarse);
      if (data && data.geojson && data.osm_id && !cache.districts.some((d) => d.osmId === data.osm_id)) {
        cache.districts.push({ osmId: data.osm_id, name: data.name || data.display_name, geojson: data.geojson });
      }
    } catch (e) {
      // Sem rede ou servico em baixo: fica por identificar e tenta-se noutra
      // abertura do mapa. O resto do mapa nunca e afetado.
    }
    await sleepMs(NOMINATIM_GAP_MS);
  }

  cache.asked = [...asked];
  saveDistrictCache(cache);
  applyDistricts(cache);
}

function applyDistricts(cache) {
  if (!hexMap) return;

  unlockedDistricts = cache.districts.filter((d) => countHexesInside(d.geojson) >= MIN_HEXES_FOR_DISTRICT);

  hexDistrictLayer.clearLayers();
  unlockedDistricts.forEach(({ name, geojson }) => {
    L.geoJSON(geojson, {
      pane: "hexdistrict",
      interactive: false,
      style: { color: "#ffd48a", weight: 2, opacity: 0.9, dashArray: "7 5", fill: false },
    }).addTo(hexDistrictLayer);

    L.marker(L.geoJSON(geojson).getBounds().getCenter(), {
      pane: "hexdistrict",
      interactive: false,
      keyboard: false,
      icon: L.divIcon({ className: "hex-district-label", html: name, iconSize: null }),
    }).addTo(hexDistrictLayer);
  });

  if (hexDistrictEl) {
    hexDistrictEl.textContent = unlockedDistricts.length
      ? unlockedDistricts.map((d) => d.name).join(", ")
      : "nenhum ainda";
  }
  updateClips();
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

  hexDistrictLayer = L.layerGroup([], { pane: "hexdistrict" }).addTo(hexMap);

  playerMarker = L.marker([0, 0], {
    pane: "hexplayer",
    interactive: false,
    keyboard: false,
    opacity: 0, // so aparece quando ha posicao real
    icon: L.divIcon({ className: "hex-player-dot", html: "<i></i>", iconSize: [14, 14], iconAnchor: [7, 7] }),
  }).addTo(hexMap);

  // O canvas trabalha em coordenadas de ecra: redesenha a cada movimento. Os
  // recortes so mudam quando muda o zoom.
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

  rebuildTerritoryOutline();
  applyDistricts(loadDistrictCache());
  redrawHexMap();
  identifyDistricts();
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
