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
  quartersPerLevel: 4,
  maxAccuracyM: 20,
  minMovementM: 3,
  maxSpeedKmh: 30,
  monsterLevelStep: 3,
  bossLevelStep: 10,
  maxLevelToGenerate: 60,
  battleDefensePercent: 0.6,
  battleFloorPercent: 0.5,
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
function getQuartersPerLevel() { return getDebugValue("quartersPerLevel"); }
function getMaxAccuracyM() { return getDebugValue("maxAccuracyM"); }
function getMinMovementM() { return getDebugValue("minMovementM"); }
function getMaxSpeedKmh() { return getDebugValue("maxSpeedKmh"); }
function getMaxSpeedMps() { return getMaxSpeedKmh() / 3.6; }
function getMonsterLevelStep() { return getDebugValue("monsterLevelStep"); }
function getBossLevelStep() { return getDebugValue("bossLevelStep"); }
function getMaxLevelToGenerate() { return getDebugValue("maxLevelToGenerate"); }
function getBattleDefensePercent() { return getDebugValue("battleDefensePercent"); }
function getBattleFloorPercent() { return getDebugValue("battleFloorPercent"); }

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
  quartersPerLevel: document.getElementById("dbg-quartersPerLevel"),
  maxAccuracyM: document.getElementById("dbg-maxAccuracyM"),
  minMovementM: document.getElementById("dbg-minMovementM"),
  maxSpeedKmh: document.getElementById("dbg-maxSpeedKmh"),
  monsterLevelStep: document.getElementById("dbg-monsterLevelStep"),
  bossLevelStep: document.getElementById("dbg-bossLevelStep"),
  maxLevelToGenerate: document.getElementById("dbg-maxLevelToGenerate"),
  battleDefensePercent: document.getElementById("dbg-battleDefensePercent"),
  battleFloorPercent: document.getElementById("dbg-battleFloorPercent"),
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
  localStorage.removeItem(STORAGE_KEYS_EQUIPMENT.ultimoQuartoPremiado);
  localStorage.removeItem(STORAGE_KEYS.active);
  localStorage.removeItem(STORAGE_KEYS.distanciaAcumuladaM);
  localStorage.removeItem(STORAGE_KEYS.ultimaPosicao);
  localStorage.removeItem(STORAGE_KEY_DEFEATED_CREATURES);

  totalDistanceM = 0;
  lastPosition = null;

  updateDistanceDisplay();
  showStartScreen();
  refreshAllAfterConfigChange();
}

document.getElementById("btn-save-debug-vars").addEventListener("click", saveDebugVars);
document.getElementById("btn-reset-debug-vars").addEventListener("click", resetDebugVars);
document.getElementById("btn-reset-character").addEventListener("click", resetCharacterAndDistance);

loadDebugVarInputs();
