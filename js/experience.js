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
  xpProgressTextEl.textContent = `${Math.round(info.distanceIntoLevel)} / ${info.distanceForNextLevel} m`;
  xpBarFillEl.style.width = `${progressPct}%`;

  renderDebugCharacterInfo();
}

updateXPDisplay();
