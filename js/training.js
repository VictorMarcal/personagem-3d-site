const startScreen = document.getElementById("start-screen");
const trainingScreen = document.getElementById("training-screen");
const btnStart = document.getElementById("btn-start-treino");
const btnStop = document.getElementById("btn-stop-treino");
const distanceEl = document.getElementById("training-distance");
const speedWarningEl = document.getElementById("speed-warning");

const EARTH_RADIUS_M = 6371000;
// Baixado de 10s para 5s (2026-08-03): TAB_LOCK_STALE_MS (js/tab-lock.js) e
// de 15000ms - com o antigo intervalo de 10s so havia 5s de margem antes do
// bloqueio entre abas poder expirar por engano (ex: browser a atrasar
// temporizadores com o ecra bloqueado/aba em segundo plano). Com 5s, a
// margem passa a ser de 10s, o dobro.
const SAVE_INTERVAL_MS = 5000;

// Filtros contra ruido/erros de GPS: ignora leituras pouco precisas,
// movimentos pequenos demais para serem deslocamento real (parado, o GPS
// "deriva" uns metros por conta propria) e saltos rapidos demais para
// serem deslocamento real a pe (erro de GPS ou veiculo). Todos ajustaveis
// no card de Debug (js/debug.js).
const STORAGE_KEYS = {
  active: "treino.ativo",
  distanciaAcumuladaM: "treino.distanciaAcumuladaM",
  ultimaPosicao: "treino.ultimaPosicao",
  inicioSessao: "treino.inicioSessao",
  // Calorias/atividade/modo dominante (2026-08-11, bug reportado - "sempre
  // que dava refresh a pagina, as calorias contadas desapareciam e
  // voltavam a zero"): so distancia/posicao eram persistidas ate aqui.
  caloriasAcumuladasKcal: "treino.caloriasAcumuladasKcal",
  modoTempoAcumuladoMs: "treino.modoTempoAcumuladoMs",
  atividadeAtiva: "treino.atividadeAtiva",
};

// Para apresentacao (historico do Perfil, treinos de hoje). Declarado aqui
// (carrega antes de js/profile.js) para nao duplicar o identificador global.
const MODE_LABEL_PT = { caminhar: "Caminhar", correr: "Correr", bicicleta: "Bicicleta" };

// --- Deteccao automatica de atividade (2026-08-10, secção 17.1 da
// documentacao) - substitui a escolha manual de modo (Caminhar/Correr/
// Bicicleta). Cada segmento de GPS e classificado pela velocidade MEDIA de
// uma janela deslizante (evita reclassificar a cada oscilacao pontual, ex:
// parar num semaforo), com historese antes de confirmar uma mudanca de
// categoria (evita "saltar" entre atividades a cada variacao de ritmo
// momentanea). "parado" nao acumula distancia/calorias (pausa automatica).
const ACTIVITY_STOPPED = "parado";
const ACTIVITY_WALK = "caminhar";
const ACTIVITY_RUN = "correr";
const ACTIVITY_CYCLE = "bicicleta";
const ACTIVITY_LABEL_PT = { parado: "Parado", caminhar: "Caminhar", correr: "Correr", bicicleta: "Bicicleta" };

function classifySpeedKmh(speedKmh) {
  if (speedKmh < getActivityStoppedMaxKmh()) return ACTIVITY_STOPPED;
  if (speedKmh < getActivityWalkMaxKmh()) return ACTIVITY_WALK;
  if (speedKmh < getActivityRunMaxKmh()) return ACTIVITY_RUN;
  return ACTIVITY_CYCLE;
}

// Amostras {speedMps, timestamp} dos ultimos getActivityWindowSeconds()
// segundos - usadas so para a media da janela deslizante acima, nao para o
// calculo de calorias em si (esse usa a velocidade real de cada segmento).
let speedSampleBuffer = [];

function pushSpeedSample(speedMps, timestamp) {
  speedSampleBuffer.push({ speedMps, timestamp });
  const windowMs = getActivityWindowSeconds() * 1000;
  while (speedSampleBuffer.length > 1 && timestamp - speedSampleBuffer[0].timestamp > windowMs) {
    speedSampleBuffer.shift();
  }
}

// Media da janela PONDERADA pelo tempo entre amostras (nao uma media simples
// dos valores) - leituras de GPS nao chegam a intervalos regulares.
function windowAverageSpeedMps() {
  if (speedSampleBuffer.length === 0) return 0;
  if (speedSampleBuffer.length === 1) return speedSampleBuffer[0].speedMps;
  let weightedSum = 0;
  let totalWeight = 0;
  for (let i = 1; i < speedSampleBuffer.length; i++) {
    const dt = speedSampleBuffer[i].timestamp - speedSampleBuffer[i - 1].timestamp;
    weightedSum += speedSampleBuffer[i].speedMps * dt;
    totalWeight += dt;
  }
  return totalWeight > 0 ? weightedSum / totalWeight : speedSampleBuffer[speedSampleBuffer.length - 1].speedMps;
}

// Atividade confirmada (a que de facto conta para MET/calorias) - so muda
// depois de a classificacao da janela se manter estavel numa categoria
// diferente por getActivityHysteresisSeconds() segundos seguidos.
let currentActiveMode = null;
let pendingMode = null;
let pendingModeSinceMs = null;

function updateDetectedActivity(timestamp) {
  const candidate = classifySpeedKmh(windowAverageSpeedMps() * 3.6);

  if (currentActiveMode === null) {
    currentActiveMode = candidate; // primeira leitura da sessao, sem periodo de graca
    pendingMode = null;
    return;
  }
  if (candidate === currentActiveMode) {
    pendingMode = null;
    return;
  }
  if (candidate !== pendingMode) {
    pendingMode = candidate;
    pendingModeSinceMs = timestamp;
    return;
  }
  if (timestamp - pendingModeSinceMs >= getActivityHysteresisSeconds() * 1000) {
    currentActiveMode = candidate;
    pendingMode = null;
  }
}

// --- Formula MET (calorias) -----------------------------------------------
//
// Caminhar/Correr: equacoes continuas do ACSM (VO2 em ml/kg/min a partir da
// velocidade em m/min). Bicicleta: tabela por faixas de velocidade
// (Compendium of Physical Activities, Ainsworth et al.) - nao ha uma formula
// linear tao limpa como andar/correr. Calorias = MET x peso(kg) x horas,
// por segmento, somadas ao longo da sessao (secção 17.1 da documentação).
function computeWalkOrRunMet(speedKmh, isRunning) {
  const speedMPerMin = (speedKmh * 1000) / 60;
  const vo2 = (isRunning ? 0.2 : 0.1) * speedMPerMin + 3.5;
  return vo2 / 3.5;
}

function computeCyclingMet(speedKmh) {
  if (speedKmh < 16) return 4.0;
  if (speedKmh < 19) return 6.8;
  if (speedKmh < 22.4) return 8.0;
  if (speedKmh < 25.6) return 10.0;
  if (speedKmh < 30.6) return 12.0;
  return 15.8;
}

function computeMetForActivity(activity, speedKmh) {
  if (activity === ACTIVITY_WALK) return computeWalkOrRunMet(speedKmh, false);
  if (activity === ACTIVITY_RUN) return computeWalkOrRunMet(speedKmh, true);
  if (activity === ACTIVITY_CYCLE) return computeCyclingMet(speedKmh);
  return 0; // parado - nunca chamado (ver onPositionUpdate, parado nao gera segmento)
}

function computeSegmentCalories(activity, speedKmh, durationSeconds) {
  const met = computeMetForActivity(activity, speedKmh);
  return met * getPesoKg() * (durationSeconds / 3600);
}

// Tempo (ms) acumulado em cada atividade nesta sessao - decide o "modo
// dominante" (o que ocupou mais tempo), gravado em training_sessions.mode
// e usado pelas conquistas de ritmo/recorde pessoal por modo (secção 10).
let modeTimeAccumMs = { caminhar: 0, correr: 0, bicicleta: 0 };

function getDominantMode() {
  let best = "correr";
  let bestMs = 0;
  [ACTIVITY_WALK, ACTIVITY_RUN, ACTIVITY_CYCLE].forEach((mode) => {
    if ((modeTimeAccumMs[mode] || 0) > bestMs) {
      bestMs = modeTimeAccumMs[mode];
      best = mode;
    }
  });
  return best;
}

function haversineDistance(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_M * c;
}

// Distancia do treino a decorrer (em memoria, atualizada a cada leitura de GPS)
let totalDistanceM = 0;
// lastPosition: SEMPRE avanca para a leitura mais recente - usada para
// velocidade/deteccao de atividade (classifySpeedKmh, teto de seguranca).
// lastCountedPosition: so avanca quando um segmento e de facto creditado a
// distancia/calorias (2026-08-11, bug reportado - treino real de 1-3min a
// pe ficava sempre a 0.00km/0kcal). Com uma unica ancora que avanca sempre,
// um telemovel a reportar GPS mais depressa do que o tempo que a pe leva a
// percorrer MIN_MOVEMENT_M (ex: leituras a cada 1-2s a 4km/h) nunca gera um
// UNICO segmento grande o suficiente para contar, por mais que o jogador
// caminhe sem parar. Com duas ancoras, segmentos pequenos consecutivos
// somam-se (lastCountedPosition fica para tras) ate ultrapassarem o
// limiar, exatamente como antes da correcao de ontem para o "parado".
let lastPosition = null;
let lastCountedPosition = null;
let watchId = null;
let saveIntervalId = null;
let sessionStartTime = null; // usado para conquistas de ritmo (ex: 5km em menos de 25 min)

// Calorias da sessao em curso (soma dos segmentos, formula MET acima) - e
// o que conta para XP/nivel (secção 5). Velocidade nominal = velocidade
// do ultimo segmento aceite (instantanea), distinta da media da sessao
// inteira mostrada ao lado.
let sessionCaloriesKcal = 0;
let currentNominalSpeedMps = 0;

// Soma vitalicia (nao so desta sessao) de distancia descartada por exceder
// MAX_SPEED_KMH - nunca conta para XP/leaderboard, so para o jogador ver
// quanto ficou de fora. Sincronizada com o Supabase como o resto do
// progresso (ver js/progress-sync.js).
function getDiscardedSpeedDistanceM() {
  return Number(localStorage.getItem(STORAGE_KEY_DISCARDED_SPEED_M)) || 0;
}

function addToDiscardedSpeedDistance(deltaM) {
  if (deltaM <= 0) return;
  localStorage.setItem(STORAGE_KEY_DISCARDED_SPEED_M, String(getDiscardedSpeedDistanceM() + deltaM));
  queueProgressSync();
}

// Aviso persistente enquanto a velocidade exceder o teto de seguranca UNICO
// (2026-08-10, ja nao ha "modo escolhido" para violar - a deteccao e
// automatica, ver secção 17.1) - so desaparece quando uma leitura seguinte
// volta a ficar dentro do teto (nao e um toast com temporizador).
function showSpeedWarning() {
  speedWarningEl.classList.remove("hidden");
}

function hideSpeedWarning() {
  speedWarningEl.classList.add("hidden");
}

const caloriesEl = document.getElementById("training-calories");
const liveStatsEl = document.getElementById("training-live-stats");
const detectedActivityEl = document.getElementById("training-detected-activity");

// Relogio + velocidade nominal/media ao vivo, por baixo da distancia
// percorrida (2026-08-06, a pedido - antes so existiam no fim da sessao,
// guardados em training_sessions, nunca mostrados durante o proprio
// treino). Nominal = velocidade do ultimo segmento aceite (instantanea);
// media = da sessao inteira ate agora (2026-08-10, as duas passaram a
// aparecer lado a lado, antes so havia a media). Duracao em "MM:SS" (ou
// "H:MM:SS" acima de 1h, formatDurationClock em js/experience.js).
function updateLiveStatsDisplay() {
  const elapsedSeconds = sessionStartTime ? (Date.now() - sessionStartTime) / 1000 : 0;
  const avgSpeedMps = elapsedSeconds > 0 ? totalDistanceM / elapsedSeconds : 0;
  liveStatsEl.textContent =
    `${formatDurationClock(elapsedSeconds)} · nominal ${formatSpeedKmh(currentNominalSpeedMps)} · média ${formatSpeedKmh(avgSpeedMps)}`;
  detectedActivityEl.textContent = `Atividade detetada: ${ACTIVITY_LABEL_PT[currentActiveMode] || "—"}`;
}

let liveStatsIntervalId = null;

function startLiveStatsTicker() {
  updateLiveStatsDisplay();
  if (liveStatsIntervalId === null) liveStatsIntervalId = setInterval(updateLiveStatsDisplay, 1000);
}

function stopLiveStatsTicker() {
  if (liveStatsIntervalId !== null) {
    clearInterval(liveStatsIntervalId);
    liveStatsIntervalId = null;
  }
}

function updateDistanceDisplay() {
  distanceEl.textContent = formatDistanceKm(totalDistanceM);
  caloriesEl.textContent = `${Math.round(sessionCaloriesKcal)} kcal`;
}

// Treino acumulado: copia persistida em localStorage, salva a cada 10s
// para sobreviver a um refresh acidental durante o treino
function persistAccumulatedTraining() {
  localStorage.setItem(STORAGE_KEYS.distanciaAcumuladaM, String(totalDistanceM));
  if (lastPosition) {
    localStorage.setItem(STORAGE_KEYS.ultimaPosicao, JSON.stringify(lastPosition));
  }
  localStorage.setItem(STORAGE_KEYS.caloriasAcumuladasKcal, String(sessionCaloriesKcal));
  localStorage.setItem(STORAGE_KEYS.modoTempoAcumuladoMs, JSON.stringify(modeTimeAccumMs));
  if (currentActiveMode) {
    localStorage.setItem(STORAGE_KEYS.atividadeAtiva, currentActiveMode);
  }
}

function clearPersistedTraining() {
  localStorage.removeItem(STORAGE_KEYS.active);
  localStorage.removeItem(STORAGE_KEYS.distanciaAcumuladaM);
  localStorage.removeItem(STORAGE_KEYS.ultimaPosicao);
  localStorage.removeItem(STORAGE_KEYS.inicioSessao);
  localStorage.removeItem(STORAGE_KEYS.caloriasAcumuladasKcal);
  localStorage.removeItem(STORAGE_KEYS.modoTempoAcumuladoMs);
  localStorage.removeItem(STORAGE_KEYS.atividadeAtiva);
}

// --- Historico de sessoes individuais (aba de Perfil) ---------------------
//
// Ao contrario do progresso agregado (que e sempre um snapshot completo,
// seguro para reenviar), cada sessao e um evento discreto - se a rede
// falhar mesmo quando o treino termina (comum, GPS ao ar livre), o registo
// nao pode desaparecer. Fica numa fila local ate ser confirmado no Supabase.

function getQueuedTrainingSessions() {
  const raw = localStorage.getItem(STORAGE_KEY_SESSION_QUEUE);
  try {
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function saveQueuedTrainingSessions(queue) {
  localStorage.setItem(STORAGE_KEY_SESSION_QUEUE, JSON.stringify(queue));
}

// Chamado no fim de stopTraining(), sempre (mesmo com distancia 0, para
// nao criar um caso especial diferente do resto do jogo). Tenta enviar de
// imediato; se falhar, o registo fica em seguranca na fila local.
function enqueueTrainingSession(record) {
  const queue = getQueuedTrainingSessions();
  queue.push(record);
  saveQueuedTrainingSessions(queue);
  flushTrainingSessionQueue();
}

// So true depois do login/arranque terminar (mesmas globais expostas por
// js/auth.js que guardam queueProgressSync) - evita tentar enviar antes de
// haver sessao autenticada.
async function flushTrainingSessionQueue() {
  if (!currentUserId || !readyForSync) return;

  const queue = getQueuedTrainingSessions();
  if (queue.length === 0) return;

  const rows = queue.map((record) => ({ user_id: currentUserId, ...record }));
  const { error } = await supabaseClient
    .from("training_sessions")
    .upsert(rows, { onConflict: "user_id,client_id", ignoreDuplicates: true });

  if (error) {
    console.warn("Falha ao enviar sessoes de treino pendentes, tenta de novo mais tarde.", error);
    return;
  }

  saveQueuedTrainingSessions([]);
  if (typeof onTrainingSessionsSynced === "function") onTrainingSessionsSynced();
}

window.addEventListener("online", () => {
  flushTrainingSessionQueue();
});

// Leituras seguidas acima do limite de velocidade antes de uma serem
// tratadas como violacao real (aviso + soma ao descartado) - um pico
// isolado de ruido de GPS e ignorado em silencio (nem conta, nem descarta).
const SPEED_VIOLATION_GRACE_READINGS = 2;
let consecutiveSpeedViolations = 0;

// Moedas encontradas a treinar (secção 7 da documentação): 50% de chance a
// cada quilometro REAL (nao efetivo - "encontrar" moedas e sobre esforco
// fisico bruto, nao sobre o modo de treino) de encontrar entre 1 e 20.
// rollCoinDropsForKm e partilhada com o simulador de distancia do Debug
// (js/debug.js tickSimDistance) - cada chamador guarda o seu PROPRIO
// contador de km ja testados (coinsCheckedKm aqui, simCoinsCheckedKm la),
// nunca partilhado, senao uma sessao real e uma simulada interferiam uma
// com a outra.
const COIN_FIND_CHANCE = 0.5;
const COIN_FIND_MIN = 1;
const COIN_FIND_MAX = 20;

// Cartao persistente com a ultima moeda encontrada (2026-08-06, a pedido -
// complementa o toast efemero acima, que desaparece sozinho ao fim de
// 3.5s). Fica visivel ate ao fim do treino ou ate uma moeda nova aparecer
// (substitui o conteudo, nao acumula um historico).
const trainingCoinFoundEl = document.getElementById("training-coin-found");
const trainingCoinFoundAmountEl = document.getElementById("training-coin-found-amount");
const trainingCoinFoundKmEl = document.getElementById("training-coin-found-km");

function showCoinFoundCard(amount, kmNumber) {
  trainingCoinFoundAmountEl.textContent = amount;
  trainingCoinFoundKmEl.textContent = kmNumber;
  trainingCoinFoundEl.classList.remove("hidden");
}

function hideCoinFoundCard() {
  trainingCoinFoundEl.classList.add("hidden");
}

// startKm: quantos km INTEIROS ja tinham sido testados antes desta chamada
// - preciso para saber a que km exato (1-based) cada moeda desta leva
// pertence, para o cartao acima poder dizer "ao N.º quilómetro" (2026-08-06,
// a pedido; antes so se sabia "quantas" moedas, nunca "em que km").
function rollCoinDropsForKm(startKm, kmCount) {
  for (let i = 0; i < kmCount; i++) {
    if (Math.random() < COIN_FIND_CHANCE) {
      const found = Math.floor(Math.random() * (COIN_FIND_MAX - COIN_FIND_MIN + 1)) + COIN_FIND_MIN;
      const kmNumber = startKm + i + 1;
      addMoedas(found);
      showGameToast(`+${found} moedas`, "moedas");
      showCoinFoundCard(found, kmNumber);
    }
  }
}

// coinsCheckedKm guarda quantos km INTEIROS ja foram testados nesta sessao
// de treino real, para o teste correr exatamente uma vez por km cruzado
// (mesmo que um so segmento de GPS avance mais que 1km de uma vez).
let coinsCheckedKm = 0;

function checkCoinDropsForDistance(currentTotalDistanceM) {
  const currentKm = Math.floor(currentTotalDistanceM / 1000);
  const newKm = currentKm - coinsCheckedKm;
  if (newKm > 0) {
    rollCoinDropsForKm(coinsCheckedKm, newKm);
    coinsCheckedKm = currentKm;
  }
}

function onPositionUpdate(position) {
  const { latitude, longitude, accuracy } = position.coords;
  const timestamp = position.timestamp;

  if (accuracy != null && accuracy > getMaxAccuracyM()) {
    return; // leitura pouco confiavel, ignora
  }

  if (lastPosition) {
    const segmentM = haversineDistance(
      lastPosition.latitude,
      lastPosition.longitude,
      latitude,
      longitude
    );

    const deltaSeconds = (timestamp - lastPosition.timestamp) / 1000;
    const speedMps = deltaSeconds > 0 ? segmentM / deltaSeconds : Infinity;
    const speedKmh = speedMps * 3.6;

    // Teto de seguranca UNICO (2026-08-10, substitui os tetos/pisos por
    // modo de antes de existir deteccao automatica - secção 4.1/17.1 da
    // documentação) - so filtra erro de GPS/veiculo (nenhum humano sustem
    // isto a pe/de bicicleta), nao decide esforco (isso e a formula MET,
    // mais abaixo, aplicada a qualquer velocidade dentro do teto).
    if (speedKmh > getMaxSafeSpeedKmh()) {
      // A ancora avanca SEMPRE a partir daqui (linha lastPosition = ... no
      // fim da funcao, ja fora deste bloco) - mesmo numa rejeicao. Antes
      // ficava presa na ultima posicao valida numa rejeicao, o que podia
      // criar uma "bola de neve" (secção 4 da documentação) - com a ancora
      // a avancar sempre, cada leitura e comparada com a mais recente.
      consecutiveSpeedViolations += 1;
      if (consecutiveSpeedViolations >= SPEED_VIOLATION_GRACE_READINGS) {
        addToDiscardedSpeedDistance(segmentM);
        showSpeedWarning();
      }
      lastPosition = { latitude, longitude, timestamp };
      return;
    }

    consecutiveSpeedViolations = 0;
    hideSpeedWarning();

    // A deteccao de atividade corre SEMPRE, mesmo com deslocamento abaixo
    // de MIN_MOVEMENT_M (2026-08-10, bug reportado: "o treino nao entra em
    // pausa apos um periodo de inatividade") - e a UNICA forma de a
    // atividade detetada conseguir chegar a "parado": um segmento pequeno
    // demais para contar como deslocamento real (deriva de GPS parado)
    // continua a representar uma velocidade quase nula, que a janela
    // deslizante precisa de ver para o jogador deixar de ficar "preso" na
    // ultima atividade detetada antes de parar, por mais tempo que fique
    // parado. MIN_MOVEMENT_M continua a decidir se o segmento CONTA para
    // distancia/calorias (abaixo), so deixou de bloquear a classificacao.
    pushSpeedSample(speedMps, timestamp);
    updateDetectedActivity(timestamp);
    currentNominalSpeedMps = speedMps;

    // Distancia/calorias medidas a partir de lastCountedPosition, NAO de
    // lastPosition (2026-08-11) - pode ser uma leitura mais antiga que a
    // usada acima para velocidade/deteccao, para segmentos pequenos
    // consecutivos se poderem somar ate ultrapassar MIN_MOVEMENT_M. Velocidade
    // e duracao usadas na formula MET sao as deste segmento acumulado (nao a
    // instantanea entre as duas ultimas leituras), para bater certo com a
    // distancia/tempo creditados.
    //
    // Bug corrigido (2026-08-11, reportado com o histórico real: "Caminhar
    // - 0.33km - 33min - 58kcal", calorias muito acima do esperado para a
    // distância): se o jogador ficasse "parado" (ou quase) durante varios
    // minutos SEM lastCountedPosition avancar (so avancava ao creditar um
    // segmento), esse tempo todo ficava "pendurado" à espera - assim que um
    // movimento real finalmente ultrapassava MIN_MOVEMENT_M, TODO o gap
    // (incluindo os minutos parados) era creditado como duracao desse UNICO
    // segmento, inflacionando calorias/tempo por modo muito acima do real
    // (podia tambem inflacionar a propria DISTANCIA, por deriva de GPS
    // acumulada num ponto-ancora cada vez mais antigo - mesma "bola de
    // neve" ja corrigida para lastPosition na secção 4, mas ainda possivel
    // aqui). Duas correcoes:
    if (currentActiveMode === ACTIVITY_STOPPED) {
      // "Parado" nunca creditou distancia/calorias - agora tambem avanca a
      // ancora (antes so a deteccao de atividade fazia isto, via
      // lastPosition acima) para o tempo parado nunca "vazar" para dentro
      // de um credito futuro.
      lastCountedPosition = { latitude, longitude, timestamp };
    } else {
      const distanceSegmentM = haversineDistance(
        lastCountedPosition.latitude,
        lastCountedPosition.longitude,
        latitude,
        longitude
      );

      if (distanceSegmentM >= getMinMovementM()) {
        // Capada a getActivityWindowSeconds() (defensivo): cobre tambem o
        // caso de nunca chegar a classificar como "parado" (ex: a
        // arrastar-se devagar sem nunca cruzar o limiar de "parado"), onde
        // a correcao acima nao chegaria. So limita o DIVISOR usado para
        // calorias/tempo por modo - a distancia creditada nunca e afetada,
        // conta sempre por inteiro.
        const rawDurationSeconds = (timestamp - lastCountedPosition.timestamp) / 1000;
        const creditedDurationSeconds = Math.min(getActivityWindowSeconds(), rawDurationSeconds);
        const creditedSpeedKmh = creditedDurationSeconds > 0 ? (distanceSegmentM / creditedDurationSeconds) * 3.6 : speedKmh;
        totalDistanceM += distanceSegmentM;
        sessionCaloriesKcal += computeSegmentCalories(currentActiveMode, creditedSpeedKmh, creditedDurationSeconds);
        modeTimeAccumMs[currentActiveMode] = (modeTimeAccumMs[currentActiveMode] || 0) + creditedDurationSeconds * 1000;
        updateDistanceDisplay();
        checkCoinDropsForDistance(totalDistanceM);
        lastCountedPosition = { latitude, longitude, timestamp };
      }
    }
  }

  lastPosition = { latitude, longitude, timestamp };
  if (!lastCountedPosition) lastCountedPosition = { latitude, longitude, timestamp };
}

function onPositionError(error) {
  distanceEl.textContent = "GPS indisponível";
  console.error("Erro de geolocalizacao:", error.message);
}

function beginWatch() {
  watchId = navigator.geolocation.watchPosition(onPositionUpdate, onPositionError, {
    enableHighAccuracy: true,
    maximumAge: 5000,
    timeout: 15000,
  });

  // A barra/progresso de nivel usa as CALORIAS da sessao em curso
  // (2026-08-10, secção 5/17.1 - era distancia efetiva ate aqui), para
  // refletir ao vivo exatamente o que vai ser creditado no fim da sessao.
  updateXPDisplay(sessionCaloriesKcal);
  saveIntervalId = setInterval(() => {
    persistAccumulatedTraining();
    updateXPDisplay(sessionCaloriesKcal);
    refreshTabLock(STORAGE_KEY_TRAINING_TAB_LOCK);
  }, SAVE_INTERVAL_MS);
  startLiveStatsTicker();
}

function showTrainingScreen() {
  startScreen.classList.add("hidden");
  trainingScreen.classList.remove("hidden");
  hideSpeedWarning();
}

function showStartScreen() {
  trainingScreen.classList.add("hidden");
  startScreen.classList.remove("hidden");
  hideSpeedWarning();
  hideCoinFoundCard();
  renderTodaysTrainings();
}

// Popup de contagem decrescente (5s) mostrado entre carregar em "Iniciar
// Treino" e o GPS realmente comecar a contar - da tempo ao jogador para se
// preparar/comecar a mexer-se.
const trainingCountdownModalEl = document.getElementById("training-countdown-modal");
const trainingCountdownNumberEl = document.getElementById("training-countdown-number");
const trainingCountdownMessageEl = document.getElementById("training-countdown-message");
const TRAINING_COUNTDOWN_SECONDS = 5;
let trainingCountdownIntervalId = null;

function showTrainingCountdown() {
  let secondsLeft = TRAINING_COUNTDOWN_SECONDS;
  trainingCountdownMessageEl.textContent =
    "A atividade (Caminhar/Correr/Bicicleta) é detetada automaticamente pelo teu ritmo ao longo do treino.";
  trainingCountdownNumberEl.textContent = String(secondsLeft);
  trainingCountdownModalEl.classList.remove("hidden");

  trainingCountdownIntervalId = setInterval(() => {
    secondsLeft -= 1;
    if (secondsLeft <= 0) {
      clearInterval(trainingCountdownIntervalId);
      trainingCountdownIntervalId = null;
      trainingCountdownModalEl.classList.add("hidden");
      beginTrainingSession();
      return;
    }
    trainingCountdownNumberEl.textContent = String(secondsLeft);
  }, 1000);
}

function startTraining() {
  if (!("geolocation" in navigator)) {
    alert("Geolocalização não suportada neste navegador.");
    return;
  }

  // Impede duas abas do mesmo telemovel/navegador terem um treino ativo em
  // simultaneo - cada uma contaria a mesma distancia GPS em separado e
  // somava-a em dobro ao progresso partilhado. Reclamado ja aqui (antes da
  // contagem decrescente), nao so no fim dela, para bloquear logo uma
  // segunda aba que tente comecar durante esses 5s.
  if (!claimTabLock(STORAGE_KEY_TRAINING_TAB_LOCK)) {
    alert("Já tens um treino ativo noutro separador ou janela. Fecha-o antes de começar um novo aqui.");
    return;
  }

  showTrainingCountdown();
}

// So corre depois da contagem decrescente terminar (showTrainingCountdown).
function beginTrainingSession() {
  totalDistanceM = 0;
  lastPosition = null;
  lastCountedPosition = null;
  sessionStartTime = Date.now();
  coinsCheckedKm = 0;
  sessionCaloriesKcal = 0;
  currentNominalSpeedMps = 0;
  speedSampleBuffer = [];
  currentActiveMode = null;
  pendingMode = null;
  pendingModeSinceMs = null;
  modeTimeAccumMs = { caminhar: 0, correr: 0, bicicleta: 0 };
  updateDistanceDisplay();
  showTrainingScreen();

  localStorage.setItem(STORAGE_KEYS.active, "true");
  localStorage.setItem(STORAGE_KEYS.inicioSessao, String(sessionStartTime));
  persistAccumulatedTraining();

  beginWatch();
}

// Treino descartado por completo se nao tiver distancia real nenhuma OU
// durar menos que isto (2026-08-06, a pedido) - nao gera registo em
// training_sessions nem conta para XP/pontos/conquistas. Cobre paragens
// acidentais ("Iniciar" logo seguido de "Parar") e ruido puro de GPS sem
// deslocamento nenhum.
const MIN_TRAINING_DURATION_SECONDS = 10;

function stopTraining() {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
  if (saveIntervalId !== null) {
    clearInterval(saveIntervalId);
    saveIntervalId = null;
  }
  stopLiveStatsTicker();

  const sessionDistanceM = totalDistanceM;
  const sessionDominantMode = getDominantMode();
  const sessionCalories = sessionCaloriesKcal;
  const sessionEndTime = Date.now();
  const sessionDurationSeconds = sessionStartTime ? (sessionEndTime - sessionStartTime) / 1000 : null;

  const discardReasons = [];
  if (sessionDistanceM <= 0) discardReasons.push("sem distância percorrida");
  if (sessionDurationSeconds == null || sessionDurationSeconds < MIN_TRAINING_DURATION_SECONDS) {
    discardReasons.push(`duração menor que ${MIN_TRAINING_DURATION_SECONDS}s`);
  }

  if (discardReasons.length > 0) {
    showGameToast(`Treino descartado (${discardReasons.join(" e ")})`, "aviso");
  } else {
    enqueueTrainingSession({
      client_id: crypto.randomUUID(),
      started_at: new Date(sessionStartTime).toISOString(),
      ended_at: new Date(sessionEndTime).toISOString(),
      distance_m: sessionDistanceM,
      // Modo DOMINANTE (mais tempo, secção 17.1) - ja nao e escolhido a
      // mao, a sessao pode ter passado por mais que uma atividade.
      mode: sessionDominantMode,
      duration_seconds: sessionDurationSeconds,
      calories_kcal: sessionCalories,
    });

    // Calorias (2026-08-10, secção 5) sao o que conta para XP/pontos/
    // leaderboard/medalhas mensais. Distancia efetiva deixou de existir
    // (2026-08-10) - conquistas de distancia/ritmo/recorde por modo
    // (secção 10) passam a usar a distancia/velocidade REAL diretamente.
    addToLifetimeCalories(sessionCalories);
    addToMonthlyCalories(sessionCalories);
    addToLifetimeDistance(sessionDistanceM);
    addToMonthlyDistance(sessionDistanceM);
    incrementTotalTrainingsCompleted();
    checkAndUnlockAchievements(sessionDistanceM, sessionDurationSeconds, sessionDominantMode, sessionCalories);
    renderMonsters(); // pode ter desbloqueado monstros novos
  }

  totalDistanceM = 0;
  lastPosition = null;
  lastCountedPosition = null;
  sessionStartTime = null;
  updateXPDisplay(0);

  clearPersistedTraining();
  releaseTabLock(STORAGE_KEY_TRAINING_TAB_LOCK);
  showStartScreen();
}

// Retoma automaticamente um treino que estava a decorrer antes de um refresh
function resumeTrainingIfNeeded() {
  if (localStorage.getItem(STORAGE_KEYS.active) !== "true") return;
  if (!("geolocation" in navigator)) return;

  // Se outra aba viva ja estiver a tratar deste treino (ex: esta aba so
  // reabriu uma pagina antiga em segundo plano), nao arranca aqui tambem um
  // segundo GPS watch a contar a mesma coisa outra vez.
  if (!claimTabLock(STORAGE_KEY_TRAINING_TAB_LOCK)) return;

  totalDistanceM = Number(localStorage.getItem(STORAGE_KEYS.distanciaAcumuladaM)) || 0;
  const savedPosition = localStorage.getItem(STORAGE_KEYS.ultimaPosicao);
  lastPosition = savedPosition ? JSON.parse(savedPosition) : null;
  // lastCountedPosition arranca igual a lastPosition apos um refresh (nao e
  // persistida em separado) - pior caso, um segmento a mais precisa de se
  // acumular antes de voltar a contar, sem impacto real (refresh a meio de
  // um treino ja e um caso raro, ver nota abaixo sobre calorias/deteccao).
  lastCountedPosition = lastPosition;
  sessionStartTime = Number(localStorage.getItem(STORAGE_KEYS.inicioSessao)) || Date.now();
  // Nao re-testa km ja percorridos antes do refresh - so os km novos a
  // partir daqui contam para moedas.
  coinsCheckedKm = Math.floor(totalDistanceM / 1000);

  // Calorias/modo dominante (2026-08-11, bug corrigido - "as calorias
  // desapareciam e voltavam a zero" a cada refresh a meio de um treino).
  sessionCaloriesKcal = Number(localStorage.getItem(STORAGE_KEYS.caloriasAcumuladasKcal)) || 0;
  try {
    const savedModeTime = localStorage.getItem(STORAGE_KEYS.modoTempoAcumuladoMs);
    if (savedModeTime) modeTimeAccumMs = JSON.parse(savedModeTime);
  } catch (e) {
    // fica no valor por omissao (todos a 0) se o JSON guardado for invalido
  }
  // A deteccao em si (janela deslizante, historese - speedSampleBuffer/
  // pendingMode) nao e persistida, so o ULTIMO modo confirmado antes do
  // refresh - evita mostrar "Atividade detetada: —" e um "parado" errado
  // logo na primeira leitura a seguir a retomar, mas a janela recomeca a
  // encher-se do zero (poucos segundos, aceitavel).
  currentActiveMode = localStorage.getItem(STORAGE_KEYS.atividadeAtiva) || null;

  updateDistanceDisplay();
  showTrainingScreen();
  beginWatch();
}

// --- Treinos de hoje (2026-08-10, secção 17.2) -----------------------------
//
// Lista dos treinos ja concluidos no dia civil corrente, no ecrã inicial do
// painel de Treino - desaparece a meia-noite (nao e um cache, e sempre um
// pedido novo filtrado por "hoje" na hora local do dispositivo).
const trainingTodayListEl = document.getElementById("training-today-list");

async function renderTodaysTrainings() {
  if (!trainingTodayListEl || !currentUserId) return;

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const { data, error } = await supabaseClient
    .from("training_sessions")
    .select("distance_m, duration_seconds, mode, calories_kcal")
    .eq("user_id", currentUserId)
    .gte("started_at", startOfToday.toISOString())
    .order("started_at", { ascending: false });

  if (error || !data) return;

  if (data.length === 0) {
    trainingTodayListEl.innerHTML = '<li class="training-today-empty">Ainda sem treinos hoje.</li>';
    return;
  }

  trainingTodayListEl.innerHTML = data
    .map((s) => {
      const modeLabel = MODE_LABEL_PT[s.mode] || "Treino";
      const km = formatDistanceKm(Number(s.distance_m) || 0);
      const minutes = Math.round((Number(s.duration_seconds) || 0) / 60);
      const kcal = Math.round(Number(s.calories_kcal) || 0);
      return `<li>${modeLabel} — ${km} · ${minutes} min · ${kcal} kcal</li>`;
    })
    .join("");
}

btnStart.addEventListener("click", startTraining);
btnStop.addEventListener("click", stopTraining);

// Salva o valor mais recente imediatamente ao sair/recarregar a pagina,
// sem esperar pelo proximo checkpoint de 10s
window.addEventListener("pagehide", () => {
  if (watchId !== null) persistAccumulatedTraining();
});

resumeTrainingIfNeeded();
