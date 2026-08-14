// Curva de progressao de nivel: calorias (kcal) necessarias para subir do
// nivel n para o n+1 = round(LEVEL_BASE * n^LEVEL_EXP) (2026-08-10, era
// distancia em metros ate aqui - secção 5/17.1 da documentação). Nem linear
// nem exponencial: os incrementos crescem, mas a taxa de crescimento
// desacelera. LEVEL_BASE/LEVEL_EXP sao ajustaveis no card de Debug
// (js/debug.js). STORAGE_KEY_LIFETIME_M/STORAGE_KEY_LIFETIME_KCAL estao
// definidas em js/storage-keys.js

const characterLevelValueEl = document.getElementById("character-level-value");
const siteTitleLevelEl = document.getElementById("site-title-level");
const xpProgressTextEl = document.getElementById("xp-progress-text");
const xpBarFillEl = document.getElementById("xp-bar-fill");

function getLifetimeDistanceM() {
  return Number(localStorage.getItem(STORAGE_KEY_LIFETIME_M)) || 0;
}

// Calorias vitalicias (2026-08-10) - a unidade base do nivel/XP (ver
// getLevelInfo/updateXPDisplay abaixo). getLifetimeDistanceM acima
// continua a existir e a ser atualizada em paralelo, so como estatistica
// informativa de distancia real - deixou de alimentar o nivel.
function getLifetimeCaloriesKcal() {
  return Number(localStorage.getItem(STORAGE_KEY_LIFETIME_KCAL)) || 0;
}

function addToLifetimeCalories(deltaKcal) {
  if (deltaKcal <= 0) return;
  const total = getLifetimeCaloriesKcal() + deltaKcal;
  localStorage.setItem(STORAGE_KEY_LIFETIME_KCAL, String(total));
  queueProgressSync();
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

// XP (2026-08-10: 1 XP = 1 kcal, era 1 XP = 1 metro ate aqui - secção 5/17.1
// da documentação) - mesma convencao da barra de nivel, usada tambem no
// leaderboard: os valores representam esforco real (calorias, formula
// MET), nao quilometros percorridos.
function formatXP(kcal) {
  return `${Math.round(kcal).toLocaleString("pt-BR")} XP`;
}

// "3900" -> "3:00" (ou "1:05:00" acima de 1h) - usado no relogio ao vivo do
// treino (js/training.js), nunca guardado neste formato (duration_seconds
// continua sempre em segundos nos dados).
function formatDurationClock(totalSeconds) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  const mm = hours > 0 ? String(minutes).padStart(2, "0") : String(minutes);
  const ss = String(secs).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

// Chamado quando um treino e efetivamente parado, para tornar a distancia
// da sessao permanente (a experiencia do personagem nunca reseta)
function addToLifetimeDistance(deltaM) {
  if (deltaM <= 0) return;
  const total = getLifetimeDistanceM() + deltaM;
  localStorage.setItem(STORAGE_KEY_LIFETIME_M, String(total));
  queueProgressSync();
}

// totalKcal: total de calorias vitalicias (2026-08-10 - era totalM em
// metros ate aqui). A formula em si nao mudou (round(LEVEL_BASE * n^LEVEL_EXP)),
// so a unidade do numero de entrada - ver secção 5 da documentação.
function getLevelInfo(totalKcal) {
  let level = 1;
  let levelStartKcal = 0;

  while (true) {
    const kcalForThisLevel = Math.round(getLevelBase() * Math.pow(level, getLevelExp()));
    if (levelStartKcal + kcalForThisLevel > totalKcal) {
      return {
        level,
        distanceIntoLevel: totalKcal - levelStartKcal,
        distanceForNextLevel: kcalForThisLevel,
      };
    }
    levelStartKcal += kcalForThisLevel;
    level += 1;
  }
}

// liveSessionKcal: calorias do treino em curso ainda nao commitadas ao
// total vitalicio, para a barra refletir progresso em tempo real durante
// o treino (2026-08-10 - era distancia efetiva em metros ate aqui).
function updateXPDisplay(liveSessionKcal = 0) {
  const lifetimeKcal = getLifetimeCaloriesKcal();

  // Pontos de status so sao creditados com base em calorias ja confirmadas
  // (nunca com a sessao em curso, que pode ainda ser perdida)
  awardPointsIfNeeded(lifetimeKcal);

  const totalKcal = lifetimeKcal + liveSessionKcal;
  const info = getLevelInfo(totalKcal);
  const progressPct = Math.min(100, (info.distanceIntoLevel / info.distanceForNextLevel) * 100);

  characterLevelValueEl.textContent = info.level;
  // Nivel tambem no hero da pagina (2026-08-07, a pedido), ao lado do nome
  // - mesmo valor do cracha do palco 3D, so uma segunda leitura visivel sem
  // ter de entrar na aba Personagem.
  siteTitleLevelEl.textContent = `Nível ${info.level}`;
  // Mostrado como XP (1 XP = 1 kcal, 2026-08-10 - era 1 XP = 1 metro), nao em
  // km como as restantes distancias do jogo - a barra de nivel e a unica
  // leitura de progresso onde faz sentido falar de "pontos de experiencia",
  // nao de esforco em si. Formato "campo aberto" (2026-08-06): XP ja
  // ganho no nivel atual, mais quanto falta para o proximo, em vez de
  // "X / Y XP".
  const remaining = Math.round(info.distanceForNextLevel - info.distanceIntoLevel);
  xpProgressTextEl.textContent = `${Math.round(info.distanceIntoLevel).toLocaleString("pt-BR")} XP — faltam ${remaining.toLocaleString("pt-BR")} para o Nível ${info.level + 1}`;
  xpBarFillEl.style.width = `${progressPct}%`;

}

updateXPDisplay();
