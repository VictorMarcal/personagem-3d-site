// Estrelas colecionaveis no mapa (2026-09-07, a pedido: "por cada concelho
// que temos vamos ter 10 x 7 estrelas (7 cores diferentes) espalhadas
// aleatoriamente... como se fossem pokemons. Estares a 100 metros ja e o
// suficiente para a colecionar").
//
// DETERMINISTAS, nao guardadas: as posicoes saem de um gerador pseudo-
// aleatorio semeado com o osm_id do concelho, por isso sao sempre as mesmas
// em qualquer telemovel, em qualquer visita, sem nada gravado e sem rede. O
// unico estado que persiste e QUAIS ja foram apanhadas.
//
// LIMITACAO ASSUMIDA (2026-09-07): "em pontos em que seja possivel treinar
// por la" ainda nao esta garantido. As posicoes sao pontos aleatorios dentro
// da fronteira do concelho, por isso algumas vao cair em campos, agua ou
// terreno privado. Para as colar a estradas e caminhos e precisa a rede de
// vias do OpenStreetMap (Overpass), que e outro servico e outra dose de
// dados - fica para depois de a mecanica estar validada no terreno.
const STAR_COLORS = [
  { id: "vermelha", hex: "#e5484d" },
  { id: "laranja", hex: "#f0913e" },
  { id: "amarela", hex: "#f5cd47" },
  { id: "verde", hex: "#57ab5a" },
  { id: "azul", hex: "#4c8dd9" },
  { id: "roxa", hex: "#a371dd" },
  { id: "rosa", hex: "#e26aa8" },
];

const STARS_PER_COLOR = 10;
const STAR_COLLECT_RADIUS_M = 100;
// O aviso sonoro tem de chegar ANTES de se poder apanhar, senao ouvia-se o
// som ja depois de ter sido apanhada e nao servia de nada.
const STAR_ALERT_RADIUS_M = 250;

// --- gerador determinista ---------------------------------------------------
// mulberry32: pequeno, rapido e com boa distribuicao. Semeado a partir do
// osm_id, por isso o mesmo concelho da sempre as mesmas estrelas.
function starRandom(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- posicoes ---------------------------------------------------------------
const starsByConcelho = new Map();

function geoJsonBounds(gj) {
  const polys = gj.type === "Polygon" ? [gj.coordinates] : gj.coordinates;
  let minLat = 90;
  let maxLat = -90;
  let minLng = 180;
  let maxLng = -180;
  polys.forEach((poly) =>
    poly[0].forEach(([lng, lat]) => {
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
    })
  );
  return { minLat, maxLat, minLng, maxLng };
}

// Amostragem por rejeicao: sorteia dentro da caixa e fica com o que cai
// dentro da fronteira. O teto de tentativas evita um ciclo infinito se o
// poligono for degenerado - mais vale menos estrelas do que a app pendurada.
function buildStarsFor(concelho) {
  const gj = concelho.geojson;
  const box = geoJsonBounds(gj);
  const rand = starRandom(Number(concelho.osmId) || 1);
  const estrelas = [];
  const alvo = STAR_COLORS.length * STARS_PER_COLOR;
  const maxTentativas = alvo * 400;

  for (let tentativa = 0; estrelas.length < alvo && tentativa < maxTentativas; tentativa += 1) {
    const lat = box.minLat + rand() * (box.maxLat - box.minLat);
    const lng = box.minLng + rand() * (box.maxLng - box.minLng);
    if (!pointInGeoJson(lat, lng, gj)) continue;
    const cor = STAR_COLORS[estrelas.length % STAR_COLORS.length];
    estrelas.push({
      id: `${concelho.osmId}:${estrelas.length}`,
      lat,
      lng,
      cor: cor.id,
      hex: cor.hex,
      concelho: concelho.name,
    });
  }
  return estrelas;
}

function getStarsForUnlockedConcelhos() {
  const todas = [];
  (typeof unlockedConcelhos !== "undefined" ? unlockedConcelhos : []).forEach((c) => {
    if (!starsByConcelho.has(c.osmId)) starsByConcelho.set(c.osmId, buildStarsFor(c));
    starsByConcelho.get(c.osmId).forEach((e) => todas.push(e));
  });
  return todas;
}

// --- estado (quais ja foram apanhadas) --------------------------------------
// So localStorage por agora. Fica offline e sobrevive a um refresh, que e o
// que a corrida de hoje precisa; sincronizar com o Supabase (mesmo padrao de
// discovered_hexes) fica para quando a mecanica estiver validada.
function getCollectedStarIds() {
  try {
    const bruto = JSON.parse(localStorage.getItem(STORAGE_KEY_COLLECTED_STARS) || "[]");
    return new Set(Array.isArray(bruto) ? bruto : []);
  } catch (e) {
    return new Set();
  }
}

function saveCollectedStarIds(set) {
  localStorage.setItem(STORAGE_KEY_COLLECTED_STARS, JSON.stringify([...set]));
}

function getCollectedStarCount() {
  return getCollectedStarIds().size;
}

// --- som --------------------------------------------------------------------
// Web Audio em vez de um ficheiro: sao dois bips, nao vale um download nem um
// asset no repositorio. O contexto tem de ser criado/retomado a partir de um
// gesto do utilizador (o iOS exige-o), por isso unlockStarAudio() e chamada
// no botao de iniciar treino.
let starAudioCtx = null;

function unlockStarAudio() {
  try {
    if (!starAudioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      starAudioCtx = new Ctx();
    }
    if (starAudioCtx.state === "suspended") starAudioCtx.resume();
  } catch (e) {
    // sem audio, a mecanica continua a funcionar - so nao avisa
  }
}

function playTones(notas) {
  if (!starAudioCtx || starAudioCtx.state !== "running") return;
  const agora = starAudioCtx.currentTime;
  notas.forEach(({ hz, inicio, duracao }) => {
    const osc = starAudioCtx.createOscillator();
    const ganho = starAudioCtx.createGain();
    osc.type = "sine";
    osc.frequency.value = hz;
    // Envelope: sem isto ouve-se um "click" no inicio e no fim de cada nota.
    ganho.gain.setValueAtTime(0, agora + inicio);
    ganho.gain.linearRampToValueAtTime(0.25, agora + inicio + 0.01);
    ganho.gain.linearRampToValueAtTime(0, agora + inicio + duracao);
    osc.connect(ganho);
    ganho.connect(starAudioCtx.destination);
    osc.start(agora + inicio);
    osc.stop(agora + inicio + duracao + 0.02);
  });
}

// Aviso de aproximacao: dois bips iguais, discretos.
function playStarNearby() {
  playTones([
    { hz: 660, inicio: 0, duracao: 0.09 },
    { hz: 660, inicio: 0.16, duracao: 0.09 },
  ]);
}

// Apanhada: arpejo a subir, para nao se confundir com o aviso.
function playStarCollected() {
  playTones([
    { hz: 784, inicio: 0, duracao: 0.1 },
    { hz: 988, inicio: 0.1, duracao: 0.1 },
    { hz: 1319, inicio: 0.2, duracao: 0.2 },
  ]);
}

// --- proximidade ------------------------------------------------------------
// Chamada a cada leitura de GPS (js/hexes.js setMapPlayerPosition), que corre
// durante o treino todo.
//
// O conjunto das ja avisadas evita o telemovel a apitar de segundo em segundo
// enquanto se anda perto de uma estrela sem chegar aos 100 m. So volta a
// avisar depois de se ter afastado.
const starsAvisadas = new Set();

function checkStarProximity(latitude, longitude) {
  if (typeof haversineDistance !== "function") return;

  const apanhadas = getCollectedStarIds();
  const estrelas = getStarsForUnlockedConcelhos();
  if (estrelas.length === 0) return;

  let apanhouAlguma = false;
  let avisou = false;

  estrelas.forEach((estrela) => {
    if (apanhadas.has(estrela.id)) return;
    const metros = haversineDistance(latitude, longitude, estrela.lat, estrela.lng);

    if (metros <= STAR_COLLECT_RADIUS_M) {
      apanhadas.add(estrela.id);
      starsAvisadas.delete(estrela.id);
      apanhouAlguma = true;
      if (typeof showGameToast === "function") {
        showGameToast(`Estrela ${estrela.cor} apanhada!`, "medalha");
      }
      return;
    }

    if (metros <= STAR_ALERT_RADIUS_M) {
      if (!starsAvisadas.has(estrela.id)) {
        starsAvisadas.add(estrela.id);
        avisou = true;
      }
    } else {
      starsAvisadas.delete(estrela.id);
    }
  });

  if (apanhouAlguma) {
    saveCollectedStarIds(apanhadas);
    playStarCollected();
    renderStarCount();
    if (typeof redrawHexMap === "function") redrawHexMap();
  } else if (avisou) {
    playStarNearby();
  }
}

// --- desenho ----------------------------------------------------------------
// Desenhadas no mesmo canvas da grelha (js/hexes.js drawHexGrid), a seguir a
// tudo o resto para ficarem por cima.
//
// TODAS VISIVEIS por agora, a pedido, para dar para testar no terreno. As ja
// apanhadas ficam ocas e apagadas, para se perceber o progresso.
function drawStar(ctx, x, y, raio, cor, apanhada) {
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const r = i % 2 === 0 ? raio : raio * 0.45;
    const ang = (Math.PI / 5) * i - Math.PI / 2;
    const px = x + Math.cos(ang) * r;
    const py = y + Math.sin(ang) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();

  if (apanhada) {
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = cor;
    ctx.stroke();
    ctx.globalAlpha = 1;
    return;
  }

  ctx.fillStyle = cor;
  ctx.shadowColor = cor;
  ctx.shadowBlur = 8;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.stroke();
}

function drawStarsOnMap(ctx, bounds, project) {
  const estrelas = getStarsForUnlockedConcelhos();
  if (estrelas.length === 0) return;
  const apanhadas = getCollectedStarIds();

  estrelas.forEach((estrela) => {
    if (!bounds.contains([estrela.lat, estrela.lng])) return;
    const p = project([estrela.lat, estrela.lng]);
    drawStar(ctx, p.x, p.y, 7, estrela.hex, apanhadas.has(estrela.id));
  });
}

// --- contador ---------------------------------------------------------------
function renderStarCount() {
  const el = document.getElementById("star-count");
  if (!el) return;
  const total = getStarsForUnlockedConcelhos().length;
  el.textContent = total > 0 ? `${getCollectedStarCount()} de ${total}` : "0";
}
