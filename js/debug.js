// Centraliza todas as variaveis publicas afinaveis do jogo (bases,
// expoentes, passos de nivel, filtros de GPS, etc), com override
// persistido em localStorage. Cada get* devolve o valor guardado ou o
// padrao de producao se nao houver override. Carrega-se antes de
// equipment.js/experience.js/monsters.js porque estes chamam os
// getters logo na primeira renderizacao.
const DEBUG_DEFAULTS = {
  // Nivel 1: 1000 XP (= 1km) para subir - pedido explicitamente a subir de
  // 500 (0.5km) para o primeiro nivel "arredondar" para 1km/1000 XP.
  // Duplica a distancia necessaria em TODOS os niveis (o formulario e
  // proporcional a LEVEL_BASE), nao so no primeiro - efeito retroativo em
  // qualquer jogador com progresso existente (o nivel e sempre recalculado
  // ao vivo a partir da distancia vitalicia, nunca guardado por si so).
  levelBase: 1000,
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

  // --- Sistema de status do JOGADOR (2026-08-04) - distinto do sistema
  // acima (statBase/Flat/Percent), que continua a ser usado so pelos
  // monstros (computeCreatureStatValue, js/monsters.js - nao mudaram).
  // Vida/Ataque/Defesa do jogador = base fixa + bonus do equipamento
  // "basico" (ainda sem sistema de moedas para o melhorar/trocar) +
  // (nivel do status investido com pontos)^expoente. Formula escolhida
  // por analise conjunta (ver secção 7 da documentação): expoente > 1 da
  // uma curva que acelera mas sem explodir como uma exponencial pura
  // (testado - base^nivel chegava a centenas de quatriloes no nivel 100).
  playerBaseVida: 100,
  playerBaseAtaque: 10,
  playerBaseDefesa: 10,
  energiaExponent: 1.8,
  forcaExponent: 1.5,
  resistenciaExponent: 1.2,

  // Destreza/Letalidade/Regeneracao (2026-08-04, sem Foco): cada uma
  // alimentada pelo nivel investido no status correspondente (Resistencia/
  // Forca/Energia) + o bonus secundario do tier atual da peca de
  // equipamento que a governa (Escudo/Arma/Armadura - WEAPON_TIERS/
  // SHIELD_TIERS/ARMOR_TIERS em js/equipment.js), na forma
  // "base + (nivel + bonus)^expoente", resultado em pontos percentuais
  // (exceto Regeneracao, em vida/segundo).
  destrezaBase: 2,
  destrezaExponent: 0.56,
  letalidadeBase: 1,
  letalidadeExponent: 0.639,
  // Multiplicador de dano quando um critico acontece - ignora Defesa por
  // completo e nao tem variacao aleatoria (ao contrario do dano normal).
  letalidadeMultiplicador: 1.5,
  regeneracaoBase: 0.2,
  regeneracaoExponent: 0.8,

  levelUpPoints: 1,
  maxAccuracyM: 20,
  minMovementM: 3,
  // Um limite de velocidade por modo de treino (js/training.js) - cada um
  // filtra erros de GPS/veiculo de forma diferente, ja que velocidades
  // normais para bicicleta seriam um erro claro a caminhar ou a correr.
  maxSpeedKmhCaminhar: 7,
  maxSpeedKmhCorrer: 20,
  maxSpeedKmhBicicleta: 25,
  // Multiplicador de "justica de esforco" aplicado a distancia real (GPS)
  // antes de contar para XP/pontos/leaderboard/conquistas (ver secção 4 da
  // documentacao) - calibrado a partir de valores MET do Compendium of
  // Physical Activities (Ainsworth et al.): correr gasta ~1 kcal/kg/km
  // seja qual for o ritmo (por isso fica em 1.0, sem alteracao); andar
  // custa ~75-85% disso a ritmo normal; bicicleta custa muito menos por km
  // percorrido (~30-50%, mais alto quanto mais rapido, por causa do
  // arrasto) - 0.35 e um valor representativo de ritmo moderado, nao uma
  // formula continua por velocidade (mantem o sistema simples, como o
  // resto do jogo).
  xpMultiplierCaminhar: 0.8,
  xpMultiplierCorrer: 1.0,
  xpMultiplierBicicleta: 0.35,
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

// Modos de treino (js/training.js) - a chave e o valor guardado em
// treino.modoAtivo/training_sessions.mode, o sufixo mapeia para as
// variaveis de Debug acima.
const TRAINING_MODE_KEY_SUFFIX = { caminhar: "Caminhar", correr: "Correr", bicicleta: "Bicicleta" };

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

function getPlayerBaseVida() { return getDebugValue("playerBaseVida"); }
function getPlayerBaseAtaque() { return getDebugValue("playerBaseAtaque"); }
function getPlayerBaseDefesa() { return getDebugValue("playerBaseDefesa"); }
function getEnergiaExponent() { return getDebugValue("energiaExponent"); }
function getForcaExponent() { return getDebugValue("forcaExponent"); }
function getResistenciaExponent() { return getDebugValue("resistenciaExponent"); }
function getDestrezaBase() { return getDebugValue("destrezaBase"); }
function getDestrezaExponent() { return getDebugValue("destrezaExponent"); }
function getLetalidadeBase() { return getDebugValue("letalidadeBase"); }
function getLetalidadeExponent() { return getDebugValue("letalidadeExponent"); }
function getLetalidadeMultiplicador() { return getDebugValue("letalidadeMultiplicador"); }
function getRegeneracaoBase() { return getDebugValue("regeneracaoBase"); }
function getRegeneracaoExponent() { return getDebugValue("regeneracaoExponent"); }

function getLevelUpPoints() { return getDebugValue("levelUpPoints"); }
function getMaxAccuracyM() { return getDebugValue("maxAccuracyM"); }
function getMinMovementM() { return getDebugValue("minMovementM"); }
function getMaxSpeedKmh(mode) { return getDebugValue("maxSpeedKmh" + TRAINING_MODE_KEY_SUFFIX[mode]); }
function getMaxSpeedMps(mode) { return getMaxSpeedKmh(mode) / 3.6; }
function getXpMultiplier(mode) { return getDebugValue("xpMultiplier" + TRAINING_MODE_KEY_SUFFIX[mode]); }
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
  playerBaseVida: document.getElementById("dbg-playerBaseVida"),
  playerBaseAtaque: document.getElementById("dbg-playerBaseAtaque"),
  playerBaseDefesa: document.getElementById("dbg-playerBaseDefesa"),
  energiaExponent: document.getElementById("dbg-energiaExponent"),
  forcaExponent: document.getElementById("dbg-forcaExponent"),
  resistenciaExponent: document.getElementById("dbg-resistenciaExponent"),
  destrezaBase: document.getElementById("dbg-destrezaBase"),
  destrezaExponent: document.getElementById("dbg-destrezaExponent"),
  letalidadeBase: document.getElementById("dbg-letalidadeBase"),
  letalidadeExponent: document.getElementById("dbg-letalidadeExponent"),
  letalidadeMultiplicador: document.getElementById("dbg-letalidadeMultiplicador"),
  regeneracaoBase: document.getElementById("dbg-regeneracaoBase"),
  regeneracaoExponent: document.getElementById("dbg-regeneracaoExponent"),
  levelUpPoints: document.getElementById("dbg-levelUpPoints"),
  maxAccuracyM: document.getElementById("dbg-maxAccuracyM"),
  minMovementM: document.getElementById("dbg-minMovementM"),
  maxSpeedKmhCaminhar: document.getElementById("dbg-maxSpeedKmhCaminhar"),
  maxSpeedKmhCorrer: document.getElementById("dbg-maxSpeedKmhCorrer"),
  maxSpeedKmhBicicleta: document.getElementById("dbg-maxSpeedKmhBicicleta"),
  xpMultiplierCaminhar: document.getElementById("dbg-xpMultiplierCaminhar"),
  xpMultiplierCorrer: document.getElementById("dbg-xpMultiplierCorrer"),
  xpMultiplierBicicleta: document.getElementById("dbg-xpMultiplierBicicleta"),
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
const debugLevelEnergiaEl = document.getElementById("debug-level-energia");
const debugLevelForcaEl = document.getElementById("debug-level-forca");
const debugLevelResistenciaEl = document.getElementById("debug-level-resistencia");

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
  debugLevelEnergiaEl.textContent = getEffectiveInvestableStatLevel("energia");
  debugLevelForcaEl.textContent = getEffectiveInvestableStatLevel("forca");
  debugLevelResistenciaEl.textContent = getEffectiveInvestableStatLevel("resistencia");
}

// Recalcula tudo o que depende das variaveis afinaveis, depois de
// guardar/repor ou de um reset de personagem
function refreshAllAfterConfigChange() {
  // Distancia EFETIVA (nao a real) - mesma logica de js/training.js
  // beginWatch(), para a barra de nivel nunca mostrar uma previa otimista
  // se este for chamado a meio de um treino ativo (ex: guardar no Debug).
  updateXPDisplay(typeof totalDistanceM === "number" ? getEffectiveDistanceM(totalDistanceM, selectedTrainingMode) : 0);
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
// Espelha coinsCheckedKm de js/training.js (contador PROPRIO, nunca
// partilhado - ver rollCoinDropsForKm la) - o simulador substitui uma
// sessao de treino real (ver nota acima), por isso tambem tem de testar
// moedas por km, senao isso ficaria impossivel de testar sem andar de
// verdade.
let simCoinsCheckedKm = 0;

function checkSimCoinDropsForDistance(currentSessionDistanceM) {
  const currentKm = Math.floor(currentSessionDistanceM / 1000);
  const newKm = currentKm - simCoinsCheckedKm;
  if (newKm > 0) {
    rollCoinDropsForKm(newKm);
    simCoinsCheckedKm = currentKm;
  }
}

function tickSimDistance() {
  const factor = Number(inputSimFactor.value) || 0;
  const elapsedSeconds = SIM_DISTANCE_TICK_MS / 1000;
  const deltaM = elapsedSeconds * factor;

  addToLifetimeDistance(deltaM);
  addToMonthlyDistance(deltaM);
  simSessionDistanceM += deltaM;
  checkSimCoinDropsForDistance(simSessionDistanceM);
  const simSessionDurationSeconds = (Date.now() - simSessionStartTime) / 1000;
  checkAndUnlockAchievements(simSessionDistanceM, simSessionDurationSeconds);

  refreshAllAfterConfigChange();
  simDistanceStatusEl.textContent = `Simulação ativa: +${factor} m/s`;
}

function startSimDistance() {
  if (simDistanceIntervalId !== null) return;
  simSessionDistanceM = 0;
  simCoinsCheckedKm = 0;
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
  // O simulador representa sempre o modo Correr (multiplicador 1.0) -
  // simSessionDistanceM ja e a distancia diretamente creditada para XP em
  // tickSimDistance acima, sem passar por getEffectiveDistanceM.
  enqueueTrainingSession({
    client_id: crypto.randomUUID(),
    started_at: new Date(simSessionStartTime).toISOString(),
    ended_at: new Date().toISOString(),
    distance_m: simSessionDistanceM,
    effective_distance_m: simSessionDistanceM,
    mode: "correr",
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
  localStorage.removeItem(STORAGE_KEYS_EQUIPMENT.nivelEnergia);
  localStorage.removeItem(STORAGE_KEYS_EQUIPMENT.nivelForca);
  localStorage.removeItem(STORAGE_KEYS_EQUIPMENT.nivelResistencia);
  localStorage.removeItem(STORAGE_KEY_MOEDAS);
  localStorage.removeItem(STORAGE_KEY_WEAPON_LEVEL);
  localStorage.removeItem(STORAGE_KEY_SHIELD_LEVEL);
  localStorage.removeItem(STORAGE_KEY_ARMOR_LEVEL);
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

// Esconder/mostrar o corpo do card de Debug (2026-08-05): so o admin ve
// este card, mas com dezenas de campos ocupa muito espaco na aba Jogo -
// o titulo/botao de alternar ficam sempre visiveis, so o resto se esconde.
// Preferencia local (debug.*, nunca sincronizada, como o resto do Debug).
const DEBUG_CARD_COLLAPSED_KEY = "debug.cardEscondido";
const debugCardBodyEl = document.getElementById("debug-card-body");
const btnToggleDebugCard = document.getElementById("btn-toggle-debug-card");

function applyDebugCardCollapsedState() {
  const collapsed = localStorage.getItem(DEBUG_CARD_COLLAPSED_KEY) === "true";
  debugCardBodyEl.classList.toggle("hidden", collapsed);
  btnToggleDebugCard.textContent = collapsed ? "Mostrar" : "Esconder";
}

btnToggleDebugCard.addEventListener("click", () => {
  const collapsed = localStorage.getItem(DEBUG_CARD_COLLAPSED_KEY) === "true";
  localStorage.setItem(DEBUG_CARD_COLLAPSED_KEY, String(!collapsed));
  applyDebugCardCollapsedState();
});

applyDebugCardCollapsedState();

loadDebugVarInputs();
