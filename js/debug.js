// Centraliza todas as variaveis publicas afinaveis do jogo (bases,
// expoentes, passos de nivel, filtros de GPS, etc), com override
// persistido em localStorage. Cada get* devolve o valor guardado ou o
// padrao de producao se nao houver override. Carrega-se antes de
// equipment.js/experience.js/monsters.js porque estes chamam os
// getters logo na primeira renderizacao.
const DEBUG_DEFAULTS = {
  levelBase: 500,
  levelExp: 1.3,
  statBaseVida: 100,
  statFlatVida: 4,
  statPercentVida: 0.89,
  // Ataque e Defesa trocam de curva de crescimento (decisao tomada ao
  // discutir o sistema de duelos): Ataque cresce como a Defesa crescia
  // antes, e vice-versa, para o dano de combate nunca ficar negativo.
  statBaseAtaque: 50,
  statFlatAtaque: 2,
  statPercentAtaque: 0.45,
  statBaseDefesa: 10,
  statFlatDefesa: 2,
  statPercentDefesa: 0.16,
  statRecoveryBase: 0.1,
  levelUpPoints: 1,
  maxAccuracyM: 20,
  minMovementM: 3,
  // Sem bicicleta por agora - 20 km/h so deixa passar andar/correr (ver
  // js/training.js para o aviso mostrado ao jogador quando e ultrapassado).
  maxSpeedKmh: 20,
  miniBossLevelStep: 5,
  bossLevelStep: 10,
  maxLevelToGenerate: 100,
  miniBossMaxPoints: 3,
  bossMaxPoints: 5,
  battleDefensePercent: 0.6,
  battleFloorPercent: 0.5,
  damageVarianceMin: 0.8,
};

const STAT_TYPE_KEY_SUFFIX = { vida: "Vida", ataque: "Ataque", defesa: "Defesa" };

const DEBUG_STORAGE_PREFIX = "debug.";

function getDebugValue(key) {
  const raw = localStorage.getItem(DEBUG_STORAGE_PREFIX + key);
  const parsed = Number(raw);
  return raw !== null && !Number.isNaN(parsed) ? parsed : DEBUG_DEFAULTS[key];
}

function setDebugValue(key, value) {
  localStorage.setItem(DEBUG_STORAGE_PREFIX + key, String(value));
}

function getLevelBase() { return getDebugValue("levelBase"); }
function getLevelExp() { return getDebugValue("levelExp"); }
function getStatBase(type) { return getDebugValue("statBase" + STAT_TYPE_KEY_SUFFIX[type]); }
function getStatFlat(type) { return getDebugValue("statFlat" + STAT_TYPE_KEY_SUFFIX[type]); }
function getStatPercent(type) { return getDebugValue("statPercent" + STAT_TYPE_KEY_SUFFIX[type]); }
function getStatRecoveryBase() { return getDebugValue("statRecoveryBase"); }
function getLevelUpPoints() { return getDebugValue("levelUpPoints"); }
function getMaxAccuracyM() { return getDebugValue("maxAccuracyM"); }
function getMinMovementM() { return getDebugValue("minMovementM"); }
function getMaxSpeedKmh() { return getDebugValue("maxSpeedKmh"); }
function getMaxSpeedMps() { return getMaxSpeedKmh() / 3.6; }
function getMiniBossLevelStep() { return getDebugValue("miniBossLevelStep"); }
function getBossLevelStep() { return getDebugValue("bossLevelStep"); }
function getMaxLevelToGenerate() { return getDebugValue("maxLevelToGenerate"); }
function getMiniBossMaxPoints() { return getDebugValue("miniBossMaxPoints"); }
function getBossMaxPoints() { return getDebugValue("bossMaxPoints"); }
function getBattleDefensePercent() { return getDebugValue("battleDefensePercent"); }
function getBattleFloorPercent() { return getDebugValue("battleFloorPercent"); }
function getDamageVarianceMin() { return getDebugValue("damageVarianceMin"); }

const debugVarInputs = {
  levelBase: document.getElementById("dbg-levelBase"),
  levelExp: document.getElementById("dbg-levelExp"),
  statBaseVida: document.getElementById("dbg-statBaseVida"),
  statFlatVida: document.getElementById("dbg-statFlatVida"),
  statPercentVida: document.getElementById("dbg-statPercentVida"),
  statBaseAtaque: document.getElementById("dbg-statBaseAtaque"),
  statFlatAtaque: document.getElementById("dbg-statFlatAtaque"),
  statPercentAtaque: document.getElementById("dbg-statPercentAtaque"),
  statBaseDefesa: document.getElementById("dbg-statBaseDefesa"),
  statFlatDefesa: document.getElementById("dbg-statFlatDefesa"),
  statPercentDefesa: document.getElementById("dbg-statPercentDefesa"),
  statRecoveryBase: document.getElementById("dbg-statRecoveryBase"),
  levelUpPoints: document.getElementById("dbg-levelUpPoints"),
  maxAccuracyM: document.getElementById("dbg-maxAccuracyM"),
  minMovementM: document.getElementById("dbg-minMovementM"),
  maxSpeedKmh: document.getElementById("dbg-maxSpeedKmh"),
  miniBossLevelStep: document.getElementById("dbg-miniBossLevelStep"),
  bossLevelStep: document.getElementById("dbg-bossLevelStep"),
  maxLevelToGenerate: document.getElementById("dbg-maxLevelToGenerate"),
  miniBossMaxPoints: document.getElementById("dbg-miniBossMaxPoints"),
  bossMaxPoints: document.getElementById("dbg-bossMaxPoints"),
  battleDefensePercent: document.getElementById("dbg-battleDefensePercent"),
  battleFloorPercent: document.getElementById("dbg-battleFloorPercent"),
  damageVarianceMin: document.getElementById("dbg-damageVarianceMin"),
};

const debugVarsStatusEl = document.getElementById("debug-vars-status");
const debugPointsValueEl = document.getElementById("debug-points-value");
const debugLevelVidaEl = document.getElementById("debug-level-vida");
const debugLevelAtaqueEl = document.getElementById("debug-level-ataque");
const debugLevelDefesaEl = document.getElementById("debug-level-defesa");

function loadDebugVarInputs() {
  Object.keys(debugVarInputs).forEach((key) => {
    debugVarInputs[key].value = getDebugValue(key);
  });
}

// Mostra pontos disponiveis e nivel de cada equipamento (funcoes de
// equipment.js, que carrega depois deste ficheiro mas so e chamado aqui
// dentro de handlers, nunca no topo do modulo)
function renderDebugCharacterInfo() {
  debugPointsValueEl.textContent = getUnspentPoints();
  debugLevelVidaEl.textContent = getEquipLevel("vida");
  debugLevelAtaqueEl.textContent = getEquipLevel("ataque");
  debugLevelDefesaEl.textContent = getEquipLevel("defesa");
}

// Recalcula tudo o que depende das variaveis afinaveis, depois de
// guardar/repor ou de um reset de personagem
function refreshAllAfterConfigChange() {
  updateXPDisplay(typeof totalDistanceM === "number" ? totalDistanceM : 0);
  renderStatsHud();
  renderMonsters();
  renderDebugCharacterInfo();
  renderAchievementsSummary();
}

function saveDebugVars() {
  Object.keys(debugVarInputs).forEach((key) => {
    const value = Number(debugVarInputs[key].value);
    if (!Number.isNaN(value)) {
      setDebugValue(key, value);
    }
  });
  debugVarsStatusEl.textContent = "Variáveis guardadas.";
  refreshAllAfterConfigChange();
}

// Simula ganho de experiencia pelo tempo em vez de GPS: a cada tick
// soma (segundos passados * fator) diretamente a distancia vitalicia.
// Util para testar niveis altos, monstros e batalhas sem andar de
// verdade. O fator e ajustavel em tempo real, sem precisar de "Guardar".
const inputSimFactor = document.getElementById("input-sim-factor");
const btnToggleSimDistance = document.getElementById("btn-toggle-sim-distance");
const simDistanceStatusEl = document.getElementById("sim-distance-status");

const SIM_DISTANCE_TICK_MS = 500;
let simDistanceIntervalId = null;
// Trata o tempo simulado como uma sessao de treino continua, para as
// conquistas de distancia/ritmo (que dependem de uma sessao, nao da
// distancia vitalicia) tambem poderem ser testadas com o simulador
let simSessionDistanceM = 0;
let simSessionStartTime = null;

function tickSimDistance() {
  const factor = Number(inputSimFactor.value) || 0;
  const elapsedSeconds = SIM_DISTANCE_TICK_MS / 1000;
  const deltaM = elapsedSeconds * factor;

  addToLifetimeDistance(deltaM);
  addToMonthlyDistance(deltaM);
  simSessionDistanceM += deltaM;
  const simSessionDurationSeconds = (Date.now() - simSessionStartTime) / 1000;
  checkAndUnlockAchievements(simSessionDistanceM, simSessionDurationSeconds);

  refreshAllAfterConfigChange();
  simDistanceStatusEl.textContent = `Simulação ativa: +${factor} m/s`;
}

function startSimDistance() {
  if (simDistanceIntervalId !== null) return;
  simSessionDistanceM = 0;
  simSessionStartTime = Date.now();
  simDistanceIntervalId = setInterval(tickSimDistance, SIM_DISTANCE_TICK_MS);
  btnToggleSimDistance.textContent = "Parar simulação";
  simDistanceStatusEl.textContent = "Simulação a decorrer...";
}

function stopSimDistance() {
  if (simDistanceIntervalId === null) return;
  clearInterval(simDistanceIntervalId);
  simDistanceIntervalId = null;

  // Tal como ja acontecia para as conquistas, o tempo simulado conta como
  // uma sessao de treino real - sem isto o Perfil nunca teria dados para
  // testar sem andar de verdade.
  enqueueTrainingSession({
    client_id: crypto.randomUUID(),
    started_at: new Date(simSessionStartTime).toISOString(),
    ended_at: new Date().toISOString(),
    distance_m: simSessionDistanceM,
    duration_seconds: (Date.now() - simSessionStartTime) / 1000,
  });

  btnToggleSimDistance.textContent = "Iniciar simulação";
  simDistanceStatusEl.textContent = "Simulação parada.";
}

function toggleSimDistance() {
  if (simDistanceIntervalId !== null) {
    stopSimDistance();
  } else {
    startSimDistance();
  }
}

btnToggleSimDistance.addEventListener("click", toggleSimDistance);

function resetDebugVars() {
  Object.keys(DEBUG_DEFAULTS).forEach((key) => {
    localStorage.removeItem(DEBUG_STORAGE_PREFIX + key);
  });
  loadDebugVarInputs();
  debugVarsStatusEl.textContent = "Repostas para os valores padrão.";
  refreshAllAfterConfigChange();
}

// Apaga nivel, status, pontos e toda a distancia percorrida (sessao
// atual e vitalicia). Nao mexe nas variaveis afinaveis acima.
function resetCharacterAndDistance() {
  const confirmed = confirm(
    "Isto vai repor o nível, os status, os pontos e toda a distância percorrida. Não pode ser desfeito. Continuar?"
  );
  if (!confirmed) return;

  stopSimDistance();

  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
  if (saveIntervalId !== null) {
    clearInterval(saveIntervalId);
    saveIntervalId = null;
  }

  localStorage.removeItem(STORAGE_KEY_LIFETIME_M);
  localStorage.removeItem(STORAGE_KEYS_EQUIPMENT.pontosDisponiveis);
  localStorage.removeItem(STORAGE_KEYS_EQUIPMENT.nivelEquipVida);
  localStorage.removeItem(STORAGE_KEYS_EQUIPMENT.nivelEquipAtaque);
  localStorage.removeItem(STORAGE_KEYS_EQUIPMENT.nivelEquipDefesa);
  localStorage.removeItem(STORAGE_KEYS_EQUIPMENT.ultimoNivelPremiado);
  localStorage.removeItem(STORAGE_KEYS.active);
  localStorage.removeItem(STORAGE_KEYS.distanciaAcumuladaM);
  localStorage.removeItem(STORAGE_KEYS.ultimaPosicao);
  localStorage.removeItem(STORAGE_KEYS.inicioSessao);
  localStorage.removeItem(STORAGE_KEY_DEFEATED_CREATURES);
  localStorage.removeItem(STORAGE_KEY_UNLOCKED_ACHIEVEMENTS);
  localStorage.removeItem(STORAGE_KEY_BEST_SESSION_DISTANCE_M);
  localStorage.removeItem(STORAGE_KEY_TOTAL_TRAININGS);
  localStorage.removeItem(STORAGE_KEY_CURRENT_HP);
  localStorage.removeItem(STORAGE_KEY_HP_LAST_UPDATE);
  localStorage.removeItem(STORAGE_KEY_SESSION_QUEUE);
  localStorage.removeItem(STORAGE_KEY_BEST_PACE_MPS);
  localStorage.removeItem(STORAGE_KEY_BEST_STREAK_DAYS);
  localStorage.removeItem(STORAGE_KEY_MONTHLY_DISTANCE_M);
  localStorage.removeItem(STORAGE_KEY_MONTH_REFERENCE);
  localStorage.removeItem(STORAGE_KEY_ENCOUNTERED_CREATURES);
  localStorage.removeItem(STORAGE_KEY_DISCARDED_SPEED_M);

  // O historico de treinos (aba Perfil) vive numa tabela a parte
  // (training_sessions) - sem isto o reset local nao mexia nele e o
  // Perfil continuava a mostrar dados antigos.
  if (currentUserId) {
    supabaseClient
      .from("training_sessions")
      .delete()
      .eq("user_id", currentUserId)
      .then(({ error }) => {
        if (error) console.warn("Falha ao apagar historico de treinos:", error);
      });
  }

  totalDistanceM = 0;
  lastPosition = null;
  sessionStartTime = null;

  updateDistanceDisplay();
  showStartScreen();
  refreshAllAfterConfigChange();
  queueProgressSync();
}

document.getElementById("btn-save-debug-vars").addEventListener("click", saveDebugVars);
document.getElementById("btn-reset-debug-vars").addEventListener("click", resetDebugVars);
document.getElementById("btn-reset-character").addEventListener("click", resetCharacterAndDistance);

loadDebugVarInputs();
