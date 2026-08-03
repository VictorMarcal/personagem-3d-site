// Curva de progressao de nivel: distancia (m) necessaria para subir do
// nivel n para o n+1 = round(LEVEL_BASE * n^LEVEL_EXP). Nem linear nem
// exponencial: os incrementos crescem, mas a taxa de crescimento desacelera.
// LEVEL_BASE/LEVEL_EXP sao ajustaveis no card de Debug (js/debug.js).
// STORAGE_KEY_LIFETIME_M esta definida em js/storage-keys.js

const characterLevelValueEl = document.getElementById("character-level-value");
const xpProgressTextEl = document.getElementById("xp-progress-text");
const xpBarFillEl = document.getElementById("xp-bar-fill");

function getLifetimeDistanceM() {
  return Number(localStorage.getItem(STORAGE_KEY_LIFETIME_M)) || 0;
}

// Todas as distancias continuam guardadas/calculadas em metros - isto e
// so a formatacao usada sempre que se mostra uma distancia ao jogador.
function formatDistanceKm(meters) {
  return `${(meters / 1000).toFixed(2)} km`;
}

// Velocidade guardada/calculada sempre em m/s (ex: best_pace_mps) - so a
// apresentacao converte para km/h.
function formatSpeedKmh(metersPerSecond) {
  return `${(metersPerSecond * 3.6).toFixed(1)} km/h`;
}

// XP (1 XP = 1 metro, ex: 1km = 1000 XP) - mesma convencao da barra de
// nivel (secção 5 da documentação), usada tambem no leaderboard: os
// valores ja sao distancia EFETIVA (com o multiplicador de justica de
// esforco aplicado), por isso mostra-los como "pontos" de XP em vez de km
// reforca que representam esforco, nao quilometros reais percorridos.
function formatXP(meters) {
  return `${Math.round(meters)} XP`;
}

// Chamado quando um treino e efetivamente parado, para tornar a distancia
// da sessao permanente (a experiencia do personagem nunca reseta)
function addToLifetimeDistance(deltaM) {
  if (deltaM <= 0) return;
  const total = getLifetimeDistanceM() + deltaM;
  localStorage.setItem(STORAGE_KEY_LIFETIME_M, String(total));
  queueProgressSync();
}

function getLevelInfo(totalM) {
  let level = 1;
  let levelStartM = 0;

  while (true) {
    const distanceForThisLevel = Math.round(getLevelBase() * Math.pow(level, getLevelExp()));
    if (levelStartM + distanceForThisLevel > totalM) {
      return {
        level,
        distanceIntoLevel: totalM - levelStartM,
        distanceForNextLevel: distanceForThisLevel,
      };
    }
    levelStartM += distanceForThisLevel;
    level += 1;
  }
}

// liveSessionM: distancia do treino em curso ainda nao commitada ao total
// vitalicio, para a barra refletir progresso em tempo real durante o treino
function updateXPDisplay(liveSessionM = 0) {
  const lifetimeM = getLifetimeDistanceM();

  // Pontos de status so sao creditados com base em distancia ja confirmada
  // (nunca com a sessao em curso, que pode ainda ser perdida)
  awardPointsIfNeeded(lifetimeM);

  const totalM = lifetimeM + liveSessionM;
  const info = getLevelInfo(totalM);
  const progressPct = Math.min(100, (info.distanceIntoLevel / info.distanceForNextLevel) * 100);

  characterLevelValueEl.textContent = info.level;
  // Mostrado como XP (1 XP = 1 metro, ex: 1km = 1000 XP), nao em km como as
  // restantes distancias do jogo - a barra de nivel e a unica leitura de
  // progresso onde faz sentido falar de "pontos de experiencia", nao de
  // distancia percorrida.
  xpProgressTextEl.textContent = `${Math.round(info.distanceIntoLevel)} / ${Math.round(info.distanceForNextLevel)} XP`;
  xpBarFillEl.style.width = `${progressPct}%`;

  renderDebugCharacterInfo();
}

updateXPDisplay();
