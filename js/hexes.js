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

// --- Mapa (Leaflet + OpenStreetMap) ---------------------------------------
//
// Carregado a pedido, so quando a sub-aba Missoes e aberta pela primeira vez
// (js/nav.js) - nao faz sentido descarregar mapa e tiles a quem nunca la
// entra, sobretudo em dados moveis antes de um treino.
const hexMapEl = document.getElementById("hex-map");
const hexCountEl = document.getElementById("hex-count");
let hexMap = null;
let hexLayer = null;

function renderHexCount() {
  if (hexCountEl) hexCountEl.textContent = String(getDiscoveredHexCount());
}

function renderHexMap() {
  renderHexCount();
  if (!hexMapEl || typeof L === "undefined" || typeof h3 === "undefined") return;

  const hexIds = [...getDiscoveredHexIds()];

  if (hexMap === null) {
    hexMap = L.map(hexMapEl, { attributionControl: true });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(hexMap);
    hexLayer = L.layerGroup().addTo(hexMap);
    // Vista por omissao ate haver descobertas (Portugal continental).
    hexMap.setView([39.5, -8.0], 6);
  }

  hexLayer.clearLayers();
  if (hexIds.length === 0) return;

  const bounds = [];
  hexIds.forEach((id) => {
    // cellToBoundary devolve [[lat, lng], ...] - exatamente o formato que o
    // L.polygon espera, sem conversao.
    const boundary = h3.cellToBoundary(id);
    L.polygon(boundary, {
      color: "#c9702f",
      weight: 1,
      fillColor: "#d98a4a",
      fillOpacity: 0.35,
    }).addTo(hexLayer);
    boundary.forEach((p) => bounds.push(p));
  });

  hexMap.fitBounds(bounds, { padding: [20, 20], maxZoom: 15 });
}

// O Leaflet calcula mal o tamanho quando o contentor estava escondido
// (display:none) no momento em que o mapa foi criado - a sub-aba Missoes
// esta escondida ate ser aberta. invalidateSize() forca o recalculo.
function refreshHexMapSize() {
  if (hexMap) hexMap.invalidateSize();
}
