// Centraliza todas as variaveis publicas afinaveis do jogo (bases,
// expoentes, passos de nivel, filtros de GPS, etc), com override
// persistido em localStorage. Cada get* devolve o valor guardado ou o
// padrao de producao se nao houver override. Carrega-se antes de
// equipment.js/experience.js/monsters.js porque estes chamam os
// getters logo na primeira renderizacao.
const DEBUG_DEFAULTS = {
  // Nivel 1: 70 XP (= 70 kcal) para subir (2026-08-10, secção 5/17.1 da
  // documentação - era 1000 XP/1 km ate aqui, quando a unidade base era
  // metros). 70 kcal e o equivalente calorico de 1km a correr para um
  // jogador de referencia de 70kg (formula MET, ~1 kcal/kg/km a correr) -
  // escolhido para preservar EXATAMENTE o mesmo nivel de qualquer jogador
  // ja existente na migracao retroativa (LEVEL_BASE novo = LEVEL_BASE
  // antigo/1000 * 70), nao um numero arbitrario novo. Duplica as calorias
  // necessarias em TODOS os niveis (o incremento e proporcional a
  // LEVEL_BASE), nao so no primeiro - o nivel e sempre recalculado ao vivo
  // a partir das calorias vitalicias, nunca guardado por si so.
  levelBase: 70,
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
  // Teto de seguranca UNICO (2026-08-10, substitui os tetos/pisos por modo
  // que existiam antes de existir deteccao automatica de atividade, secção
  // 4.1/17.1 da documentacao) - so filtra erro de GPS/veiculo (nenhum
  // humano sustem isto a pe/de bicicleta), nao decide esforco (isso e a
  // formula MET, continua por velocidade real de cada segmento).
  maxSafeSpeedKmh: 45,
  // Limiares que classificam cada segmento por atividade (janela deslizante
  // de velocidade media, ver activityWindowSeconds abaixo) - so escolhem
  // QUAL formula MET usar (andar/correr/bicicleta), ja nao bloqueiam nada.
  // Valores vindos de uma conversa de desenho anterior (nao os tetos/pisos
  // antigos por modo, que eram para bloquear, nao para classificar).
  activityStoppedMaxKmh: 2,
  activityWalkMaxKmh: 6.5,
  activityRunMaxKmh: 14,
  // Janela deslizante (segundos) usada para a velocidade media que alimenta
  // a classificacao acima - evita reclassificar a cada oscilacao pontual
  // (ex: parar num semaforo). Historese (segundos) - so muda de categoria
  // depois de estar continuamente na nova faixa por este tempo. Descidos de
  // 45/25 para 20/8 (2026-08-11, corrigido a pedido - "demora muito tempo
  // para detetar entre treino e parado... 30 segundos ate detetar que
  // estava a caminhar", os dois valores somavam-se): 45+25 no pior caso
  // (arrancar a andar depois de estar mesmo parado, com o segmento anterior
  // ainda a pesar na media da janela) dava perto dos 30s sentidos na
  // pratica. 20/8 continua a suavizar ruido pontual do GPS sem ficar tao
  // lento a confirmar o inicio real de uma atividade.
  activityWindowSeconds: 20,
  activityHysteresisSeconds: 8,
  // Desempate por acelerometro (2026-08-12, secção 4.3) - so a velocidade
  // nao distingue "pernas a mexer" de "rodas a rolar": a subir de bicicleta
  // devagar a velocidade cai nas faixas de caminhar/correr e a atividade
  // era mal classificada. Andar/correr produzem uma oscilacao forte ao
  // ritmo da passada; pedalar produz so vibracao da estrada, muito mais
  // fraca. Este e o desvio-padrao (m/s2) da magnitude da aceleracao acima
  // do qual se considera que HA passada. Valor de partida por calibrar com
  // dados reais - gps_diag grava a intensidade medida de cada sessao
  // precisamente para isso.
  stepSignalThresholdMs2: 1.2,
  miniBossLevelStep: 5,
  bossLevelStep: 10,
  maxLevelToGenerate: 100,
  miniBossMaxPoints: 3,
  bossMaxPoints: 5,
  battleDefensePercent: 0.6,
  battleFloorPercent: 0.5,
  damageVarianceMin: 0.8,
  // % da Vida MAXIMA do monstro recuperada a cada troca de ataques durante
  // a luta (2026-08-07, a pedido - antes so o jogador regenerava em
  // combate, ver tickPlayerRegen em js/battle.js). Percentagem em vez de
  // vida/segundo como o jogador porque os monstros nao tem nenhum status de
  // Energia para alimentar essa formula - uma % da propria Vida maxima
  // escala automaticamente com o nivel/arquetipo sem precisar de um numero
  // fixo por monstro.
  monsterRegenPercent: 1,
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
function getMaxSafeSpeedKmh() { return getDebugValue("maxSafeSpeedKmh"); }
function getMaxSafeSpeedMps() { return getMaxSafeSpeedKmh() / 3.6; }
function getActivityStoppedMaxKmh() { return getDebugValue("activityStoppedMaxKmh"); }
function getActivityWalkMaxKmh() { return getDebugValue("activityWalkMaxKmh"); }
function getActivityRunMaxKmh() { return getDebugValue("activityRunMaxKmh"); }
function getActivityWindowSeconds() { return getDebugValue("activityWindowSeconds"); }
function getActivityHysteresisSeconds() { return getDebugValue("activityHysteresisSeconds"); }
function getStepSignalThresholdMs2() { return getDebugValue("stepSignalThresholdMs2"); }
function getMiniBossLevelStep() { return getDebugValue("miniBossLevelStep"); }
function getBossLevelStep() { return getDebugValue("bossLevelStep"); }
function getMaxLevelToGenerate() { return getDebugValue("maxLevelToGenerate"); }
function getMiniBossMaxPoints() { return getDebugValue("miniBossMaxPoints"); }
function getBossMaxPoints() { return getDebugValue("bossMaxPoints"); }
function getBattleDefensePercent() { return getDebugValue("battleDefensePercent"); }
function getBattleFloorPercent() { return getDebugValue("battleFloorPercent"); }
function getDamageVarianceMin() { return getDebugValue("damageVarianceMin"); }
function getMonsterRegenPercent() { return getDebugValue("monsterRegenPercent"); }

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
  maxSafeSpeedKmh: document.getElementById("dbg-maxSafeSpeedKmh"),
  activityStoppedMaxKmh: document.getElementById("dbg-activityStoppedMaxKmh"),
  activityWalkMaxKmh: document.getElementById("dbg-activityWalkMaxKmh"),
  activityRunMaxKmh: document.getElementById("dbg-activityRunMaxKmh"),
  activityWindowSeconds: document.getElementById("dbg-activityWindowSeconds"),
  activityHysteresisSeconds: document.getElementById("dbg-activityHysteresisSeconds"),
  stepSignalThresholdMs2: document.getElementById("dbg-stepSignalThresholdMs2"),
  miniBossLevelStep: document.getElementById("dbg-miniBossLevelStep"),
  bossLevelStep: document.getElementById("dbg-bossLevelStep"),
  maxLevelToGenerate: document.getElementById("dbg-maxLevelToGenerate"),
  miniBossMaxPoints: document.getElementById("dbg-miniBossMaxPoints"),
  bossMaxPoints: document.getElementById("dbg-bossMaxPoints"),
  battleDefensePercent: document.getElementById("dbg-battleDefensePercent"),
  battleFloorPercent: document.getElementById("dbg-battleFloorPercent"),
  damageVarianceMin: document.getElementById("dbg-damageVarianceMin"),
  monsterRegenPercent: document.getElementById("dbg-monsterRegenPercent"),
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
  updateXPDisplay(typeof sessionCaloriesKcal === "number" ? sessionCaloriesKcal : 0);
  renderStatsHud();
  renderMonsters();
  renderDebugCharacterInfo();
  renderAchievementsSummary();
  renderTodaysTrainings();
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
let simSessionCaloriesKcal = 0;
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
    rollCoinDropsForKm(simCoinsCheckedKm, newKm);
    simCoinsCheckedKm = currentKm;
  }
}

function tickSimDistance() {
  const factor = Number(inputSimFactor.value) || 0;
  const elapsedSeconds = SIM_DISTANCE_TICK_MS / 1000;
  const deltaM = elapsedSeconds * factor;

  // Desde o cutover para calorias (2026-08-10, secção 5), o nivel ja nao
  // sobe so com addToLifetimeDistance - o simulador tambem precisa de
  // creditar calorias, ou deixaria de servir para testar niveis altos sem
  // andar de verdade (o proposito original desta ferramenta). Sem MET real
  // (o simulador nao gera velocidade/segmentos), usa a mesma aproximacao
  // da migracao retroativa: ~1 kcal/kg/km a correr (Compendium/ACSM).
  const deltaKcal = (deltaM / 1000) * getPesoKg();
  addToLifetimeCalories(deltaKcal);
  addToMonthlyCalories(deltaKcal);
  addToLifetimeDistance(deltaM);
  addToMonthlyDistance(deltaM);
  simSessionDistanceM += deltaM;
  simSessionCaloriesKcal += deltaKcal;
  checkSimCoinDropsForDistance(simSessionDistanceM);
  const simSessionDurationSeconds = (Date.now() - simSessionStartTime) / 1000;
  checkAndUnlockAchievements(simSessionDistanceM, simSessionDurationSeconds, "correr", simSessionCaloriesKcal);

  refreshAllAfterConfigChange();
  simDistanceStatusEl.textContent = `Simulação ativa: +${factor} m/s`;
}

function startSimDistance() {
  if (simDistanceIntervalId !== null) return;
  simSessionDistanceM = 0;
  simSessionCaloriesKcal = 0;
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
  // testar sem andar de verdade. O simulador representa sempre o modo
  // Correr - simSessionCaloriesKcal ja e o que conta para XP (ver
  // tickSimDistance acima).
  enqueueTrainingSession({
    client_id: crypto.randomUUID(),
    started_at: new Date(simSessionStartTime).toISOString(),
    ended_at: new Date().toISOString(),
    distance_m: simSessionDistanceM,
    mode: "correr",
    duration_seconds: (Date.now() - simSessionStartTime) / 1000,
    calories_kcal: simSessionCaloriesKcal,
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
  localStorage.removeItem(STORAGE_KEY_LIFETIME_KCAL);
  localStorage.removeItem(STORAGE_KEY_MONTHLY_KCAL);
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
  localStorage.removeItem(STORAGE_KEY_TOTAL_MOEDAS_GANHAS);
  localStorage.removeItem(STORAGE_KEY_TOTAL_MOEDAS_GASTAS);
  localStorage.removeItem(STORAGE_KEY_TOTAL_BATTLES);
  localStorage.removeItem(STORAGE_KEY_DISTINCT_MONTHS_TRAINED);

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
  lastCountedPosition = null;
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
