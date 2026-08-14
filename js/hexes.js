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
// NAO e um mapa real. A pedido: "em vez de mostrar o mapa real, gostava que
// fosse algo tipo [jogo de estrategia hexagonal] - imagina uma textura de
// terreno e vais pintando os hexagonos por cima; a textura esta a preto e
// branco excepto nas areas ja descobertas".
//
// Por isso o terreno e GERADO POR CODIGO (ruido determinista a partir das
// coordenadas) e desenhado num canvas. O Leaflet fica so como motor de
// pan/zoom e de projecao geografica - sem tiles, sem pedidos de rede, sem
// atribuicao, sem depender de nenhum servico externo.
//
// O mapa e GLOBAL: nao ha nenhuma regiao fixa no codigo. O terreno existe em
// todo o lado e cada jogador ve a cores a zona onde treinou. Para o Skllrx
// isso desenha aproximadamente o distrito de Braga, porque foi so onde
// explorou; para outro jogador sera outra area, sem uma linha de codigo
// diferente.
const hexMapEl = document.getElementById("hex-map");
const hexCountEl = document.getElementById("hex-count");
let hexMap = null;
let hexCanvas = null;

function renderHexCount() {
  if (hexCountEl) hexCountEl.textContent = String(getDiscoveredHexCount());
}

// --- Terreno procedural ----------------------------------------------------
//
// Ruido de valor com interpolacao suave. Determinista: a mesma coordenada da
// sempre o mesmo terreno, em qualquer dispositivo e em qualquer visita, sem
// ser preciso guardar ou descarregar nada.
function terrainHash(x, y) {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function terrainSmoothNoise(x, y) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  // Curva suave (3t^2-2t^3) em vez de interpolacao linear: a linear deixa
  // artefactos em losango nas fronteiras entre celulas de ruido.
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = terrainHash(xi, yi);
  const b = terrainHash(xi + 1, yi);
  const c = terrainHash(xi, yi + 1);
  const d = terrainHash(xi + 1, yi + 1);
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}

// A frequencia do ruido acompanha o tamanho do hexagono que esta a ser
// pintado. Sem isto, hexagonos vizinhos caem em celulas de ruido diferentes
// e o mapa sai granulado - parece estatica, nao terreno. A regra: um passo
// de um hexagono deve valer ~0.08 de unidade de ruido, para que as manchas
// de agua/floresta/rocha tenham sempre a dimensao de varios hexagonos.
// Consequencia: o terreno e auto-semelhante (as formas repetem-se a cada
// escala), mas cada hexagono descoberto e sempre desenhado a frequencia da
// resolucao 9, por isso a sua cor nunca muda.
function terrainFrequencyFor(resolution) {
  return (0.08 * 111000) / H3_CELL_DIAMETER_M[resolution];
}

// Duas oitavas: a primeira da as massas grandes, a segunda parte-as em
// detalhe.
function terrainValue(lat, lng, freq) {
  return (
    terrainSmoothNoise(lat * freq, lng * freq) * 0.65 +
    terrainSmoothNoise(lat * freq * 3.1, lng * freq * 3.1) * 0.35
  );
}

// Faixas de "altitude" ficticias.
const TERRAIN_BANDS = [
  { max: 0.33, color: [58, 110, 140] },   // agua
  { max: 0.39, color: [206, 186, 140] },  // areia / margem
  { max: 0.58, color: [122, 158, 82] },   // relva
  { max: 0.76, color: [74, 112, 62] },    // floresta
  { max: 1.01, color: [138, 128, 114] },  // rocha
];

function terrainColorAt(lat, lng, freq) {
  const value = terrainValue(lat, lng, freq);
  for (const band of TERRAIN_BANDS) {
    if (value < band.max) return band.color;
  }
  return TERRAIN_BANDS[TERRAIN_BANDS.length - 1].color;
}

// Por explorar: a mesma textura, sem cor e escurecida. Continua a ver-se a
// FORMA do terreno (era esse o pedido, em vez de preto solido), mas le-se de
// imediato como "ainda nao fui la".
function toFogColor([r, g, b]) {
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  const dim = Math.round(lum * 0.48);
  return `rgb(${dim},${dim},${dim})`;
}

function toDiscoveredColor([r, g, b]) {
  return `rgb(${r},${g},${b})`;
}

// A grelha de fundo acompanha o zoom. Os hexagonos de descoberta (resolucao
// 9, ~427m) desenhados ao nivel de um pais seriam dezenas de milhar de
// poligonos de 1px - lento e ilegivel. Escolhe-se a resolucao pelo tamanho
// que os hexagonos teriam NO ECRA, e nao por uma tabela de niveis de zoom:
// assim o resultado e o mesmo em qualquer latitude e em qualquer tamanho de
// ecra. Nunca passa da resolucao 9 - mais fino que a propria descoberta nao
// acrescenta informacao nenhuma.
// Diametro aproximado da celula H3 por resolucao (cada nivel e ~2.65x maior
// que o seguinte). Ancorado nos ~427m da resolucao 9 que a app ja anuncia ao
// jogador; so precisa de estar certo na proporcao.
const H3_CELL_DIAMETER_M = { 2: 390000, 3: 148000, 4: 56000, 5: 21300, 6: 8060, 7: 3050, 8: 1150, 9: 435 };
const MIN_BACKDROP_RESOLUTION = 2;
const BACKDROP_TARGET_PX = 34;

function backdropResolutionForView() {
  const size = hexMap.getSize();
  const a = hexMap.containerPointToLatLng([0, size.y / 2]);
  const b = hexMap.containerPointToLatLng([100, size.y / 2]);
  const metersPerPixel = hexMap.distance(a, b) / 100;

  let best = MIN_BACKDROP_RESOLUTION;
  let bestErr = Infinity;
  for (let res = MIN_BACKDROP_RESOLUTION; res <= 9; res += 1) {
    const err = Math.abs(H3_CELL_DIAMETER_M[res] / metersPerPixel - BACKDROP_TARGET_PX);
    if (err < bestErr) {
      bestErr = err;
      best = res;
    }
  }
  return best;
}

function fillHexPath(ctx, cellId) {
  const boundary = h3.cellToBoundary(cellId);
  ctx.beginPath();
  boundary.forEach(([lat, lng], i) => {
    const p = hexMap.latLngToContainerPoint([lat, lng]);
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.closePath();
}

// So as celulas dentro do viewport (o H3 recorta ao poligono): o custo do
// desenho nao cresce com o tamanho do mundo, so com o tamanho do ecra.
// Ainda assim, um viewport largo numa resolucao fina pode dar milhares de
// celulas - se acontecer, sobe-se um nivel ate caber num orcamento seguro.
const MAX_BACKDROP_CELLS = 2500;

function backdropCellsFor(viewport, startResolution) {
  for (let resolution = startResolution; resolution >= MIN_BACKDROP_RESOLUTION; resolution -= 1) {
    let cells;
    try {
      cells = h3.polygonToCells(viewport, resolution);
    } catch (e) {
      return { cells: [], resolution };
    }
    if (cells.length <= MAX_BACKDROP_CELLS) return { cells, resolution };
  }
  return { cells: [], resolution: MIN_BACKDROP_RESOLUTION };
}

function drawHexMap() {
  if (!hexMap || !hexCanvas) return;

  const size = hexMap.getSize();
  if (size.x === 0 || size.y === 0) return;

  const ratio = window.devicePixelRatio || 1;
  if (hexCanvas.width !== Math.round(size.x * ratio) || hexCanvas.height !== Math.round(size.y * ratio)) {
    hexCanvas.width = Math.round(size.x * ratio);
    hexCanvas.height = Math.round(size.y * ratio);
    hexCanvas.style.width = `${size.x}px`;
    hexCanvas.style.height = `${size.y}px`;
  }

  const ctx = hexCanvas.getContext("2d");
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, size.x, size.y);

  const mapBounds = hexMap.getBounds();
  const viewport = [
    [mapBounds.getNorth(), mapBounds.getWest()],
    [mapBounds.getNorth(), mapBounds.getEast()],
    [mapBounds.getSouth(), mapBounds.getEast()],
    [mapBounds.getSouth(), mapBounds.getWest()],
  ];

  const discovered = getDiscoveredHexIds();
  const discoveryResolution = getHexResolution();
  const { cells, resolution } = backdropCellsFor(viewport, backdropResolutionForView());
  const backdropFreq = terrainFrequencyFor(resolution);

  ctx.lineWidth = 0.5;
  ctx.strokeStyle = "rgba(0,0,0,0.22)";
  cells.forEach((cell) => {
    const [lat, lng] = h3.cellToLatLng(cell);
    const color = terrainColorAt(lat, lng, backdropFreq);
    // Quando a grelha de fundo coincide com a de descoberta, os hexagonos ja
    // descobertos sao pintados aqui a cores - evita desenhar duas vezes o
    // mesmo poligono.
    const isDiscovered = resolution === discoveryResolution && discovered.has(cell);
    fillHexPath(ctx, cell);
    ctx.fillStyle = isDiscovered ? toDiscoveredColor(color) : toFogColor(color);
    ctx.fill();
    ctx.stroke();
  });

  // Afastado, os hexagonos descobertos sao mais pequenos que a grelha de
  // fundo - desenha-os por cima para o progresso continuar visivel a
  // qualquer zoom, em vez de desaparecer ao afastar.
  if (resolution !== discoveryResolution) {
    const discoveryFreq = terrainFrequencyFor(discoveryResolution);
    ctx.strokeStyle = "rgba(255,255,255,0.4)";
    discovered.forEach((cell) => {
      const [lat, lng] = h3.cellToLatLng(cell);
      if (!mapBounds.contains([lat, lng])) return;
      fillHexPath(ctx, cell);
      ctx.fillStyle = toDiscoveredColor(terrainColorAt(lat, lng, discoveryFreq));
      ctx.fill();
      ctx.stroke();
    });
  }
}

function renderHexMap() {
  renderHexCount();
  if (!hexMapEl || typeof L === "undefined" || typeof h3 === "undefined") return;

  if (hexMap === null) {
    hexMap = L.map(hexMapEl, {
      attributionControl: false, // sem tiles de terceiros, nao ha nada a atribuir
      minZoom: 4,
      maxZoom: 16,
    });
    // Vista por omissao ate haver descobertas (Portugal continental).
    hexMap.setView([39.5, -8.0], 6);

    hexCanvas = document.createElement("canvas");
    hexCanvas.className = "hex-map-canvas";
    hexMapEl.appendChild(hexCanvas);

    // Redesenha durante o movimento, nao so no fim: o canvas vive no
    // contentor do mapa e nao num pane do Leaflet, por isso nao e arrastado
    // automaticamente - tem de ser redesenhado em coordenadas de ecra.
    hexMap.on("move zoom resize", drawHexMap);
  }

  const hexIds = [...getDiscoveredHexIds()];
  if (hexIds.length > 0) {
    // O enquadramento segue as descobertas do proprio jogador - e isto que
    // faz o mapa global mostrar "a minha zona" sem nenhuma regiao no codigo.
    const bounds = [];
    hexIds.forEach((id) => h3.cellToBoundary(id).forEach((p) => bounds.push(p)));
    hexMap.fitBounds(bounds, { padding: [24, 24], maxZoom: 14 });
  }

  drawHexMap();
}

// O Leaflet calcula mal o tamanho quando o contentor estava escondido
// (display:none) no momento em que o mapa foi criado - a sub-aba Missoes
// esta escondida ate ser aberta. invalidateSize() forca o recalculo.
function refreshHexMapSize() {
  if (hexMap) {
    hexMap.invalidateSize();
    drawHexMap();
  }
}
