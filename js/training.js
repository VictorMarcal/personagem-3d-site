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
  // Modo escolhido (caminhar/correr/bicicleta, ver js/debug.js) - guardado
  // mesmo fora de um treino ativo, para lembrar a ultima escolha como
  // default; guardado TAMBEM enquanto o treino decorre, para um
  // resumeTrainingIfNeeded() apos um refresh continuar a usar o limite de
  // velocidade certo (secção 4.1 da documentação).
  modoAtivo: "treino.modoAtivo",
};

// Fixo para toda a duracao de uma sessao (nao muda a meio - os botoes de
// escolha ficam dentro do #start-screen, por isso ficam escondidos assim
// que o treino comeca).
const DEFAULT_TRAINING_MODE = "correr";
let selectedTrainingMode = localStorage.getItem(STORAGE_KEYS.modoAtivo) || DEFAULT_TRAINING_MODE;

const modeButtonEls = {
  caminhar: document.getElementById("btn-mode-caminhar"),
  correr: document.getElementById("btn-mode-correr"),
  bicicleta: document.getElementById("btn-mode-bicicleta"),
};

// Para apresentacao (popup de contagem decrescente, historico do Perfil) -
// distinto do mapa de sufixos de chave de js/debug.js (TRAINING_MODE_KEY_SUFFIX),
// apesar dos valores coincidirem hoje. Declarado aqui (carrega antes de
// js/profile.js) para nao duplicar o identificador global.
const MODE_LABEL_PT = { caminhar: "Caminhar", correr: "Correr", bicicleta: "Bicicleta" };

function updateModeButtonsUI() {
  Object.entries(modeButtonEls).forEach(([mode, btn]) => {
    btn.classList.toggle("active", mode === selectedTrainingMode);
  });
}

function setTrainingMode(mode) {
  selectedTrainingMode = mode;
  localStorage.setItem(STORAGE_KEYS.modoAtivo, mode);
  updateModeButtonsUI();
}

Object.entries(modeButtonEls).forEach(([mode, btn]) => {
  btn.addEventListener("click", () => setTrainingMode(mode));
});

updateModeButtonsUI();

// Distancia "efetiva" (com o multiplicador de justica de esforco do modo
// ja aplicado) - e esta que conta para XP/pontos/leaderboard/conquistas,
// nunca a distancia real diretamente (ver js/debug.js getXpMultiplier).
function getEffectiveDistanceM(rawM, mode) {
  return rawM * getXpMultiplier(mode);
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
let lastPosition = null;
let watchId = null;
let saveIntervalId = null;
let sessionStartTime = null; // usado para conquistas de ritmo (ex: 5km em menos de 25 min)

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

// Aviso persistente enquanto a velocidade estiver acima do limite - so
// desaparece quando uma leitura seguinte volta a ficar dentro do limite
// (nao e um toast com temporizador).
function showSpeedWarning() {
  speedWarningEl.classList.remove("hidden");
}

function hideSpeedWarning() {
  speedWarningEl.classList.add("hidden");
}

const effectiveDistanceRowEl = document.getElementById("training-effective-distance-row");
const effectiveDistanceEl = document.getElementById("training-effective-distance");

function updateDistanceDisplay() {
  distanceEl.textContent = formatDistanceKm(totalDistanceM);

  // So mostra a linha "efetiva" quando difere da real (multiplicador != 1)
  // - em Correr as duas seriam sempre o mesmo numero, so ruido visual.
  const multiplier = getXpMultiplier(selectedTrainingMode);
  effectiveDistanceRowEl.classList.toggle("hidden", multiplier === 1);
  if (multiplier !== 1) {
    effectiveDistanceEl.textContent = formatDistanceKm(getEffectiveDistanceM(totalDistanceM, selectedTrainingMode));
  }
}

// Treino acumulado: copia persistida em localStorage, salva a cada 10s
// para sobreviver a um refresh acidental durante o treino
function persistAccumulatedTraining() {
  localStorage.setItem(STORAGE_KEYS.distanciaAcumuladaM, String(totalDistanceM));
  if (lastPosition) {
    localStorage.setItem(STORAGE_KEYS.ultimaPosicao, JSON.stringify(lastPosition));
  }
}

function clearPersistedTraining() {
  localStorage.removeItem(STORAGE_KEYS.active);
  localStorage.removeItem(STORAGE_KEYS.distanciaAcumuladaM);
  localStorage.removeItem(STORAGE_KEYS.ultimaPosicao);
  localStorage.removeItem(STORAGE_KEYS.inicioSessao);
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

function rollCoinDropsForKm(kmCount) {
  for (let i = 0; i < kmCount; i++) {
    if (Math.random() < COIN_FIND_CHANCE) {
      const found = Math.floor(Math.random() * (COIN_FIND_MAX - COIN_FIND_MIN + 1)) + COIN_FIND_MIN;
      addMoedas(found);
      showGameToast(`+${found} moedas`, "moedas");
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
    rollCoinDropsForKm(newKm);
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

    if (segmentM < getMinMovementM()) {
      return; // provavel ruido de GPS parado, mantem a ancora e ignora
    }

    const deltaSeconds = (timestamp - lastPosition.timestamp) / 1000;
    const speedMps = deltaSeconds > 0 ? segmentM / deltaSeconds : Infinity;

    // Fora da janela de velocidade do modo escolhido - tanto acima do teto
    // (ver nota abaixo) como abaixo do minimo (2026-08-06, bug reportado:
    // escolher "Correr" e depois andar devagar continuava a contar ao
    // multiplicador de Correr, ja que so havia teto, nunca piso, e o ritmo
    // de uma caminhada fica bem abaixo do teto de 20km/h de Correr).
    if (speedMps > getMaxSpeedMps(selectedTrainingMode) || speedMps < getMinSpeedMps(selectedTrainingMode)) {
      // A ancora avanca SEMPRE a partir daqui (linha lastPosition = ... no
      // fim da funcao, ja fora deste bloco) - mesmo numa rejeicao. Antes
      // ficava presa na ultima posicao valida; se o ritmo real do jogador
      // se mantivesse perto do limite do modo (facil em Caminhar, cujo teto
      // de 7 km/h esta perto do ritmo normal de uma caminhada), a distancia
      // entre a ancora (cada vez mais antiga) e a posicao atual so crescia -
      // nunca baixava o suficiente para a velocidade calculada voltar a
      // ficar dentro do limite. Bola de neve real: quase tudo acabava
      // descartado numa sessao inteira, em qualquer um dos 3 modos (mesmo
      // codigo partilhado).
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
    totalDistanceM += segmentM;
    updateDistanceDisplay();
    checkCoinDropsForDistance(totalDistanceM);
  }

  lastPosition = { latitude, longitude, timestamp };
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

  // A barra/progresso de nivel usa a distancia EFETIVA (com o multiplicador
  // do modo ja aplicado), nunca a real diretamente - tem de refletir ao
  // vivo exatamente o que vai ser creditado no fim da sessao (secção 4.1),
  // nao uma previa otimista baseada na distancia real.
  updateXPDisplay(getEffectiveDistanceM(totalDistanceM, selectedTrainingMode));
  saveIntervalId = setInterval(() => {
    persistAccumulatedTraining();
    updateXPDisplay(getEffectiveDistanceM(totalDistanceM, selectedTrainingMode));
    refreshTabLock(STORAGE_KEY_TRAINING_TAB_LOCK);
  }, SAVE_INTERVAL_MS);
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
}

// Popup de contagem decrescente (5s) mostrado entre carregar em "Iniciar
// Treino" e o GPS realmente comecar a contar - da tempo ao jogador para se
// preparar/comecar a mexer-se, e lembra a conversao km->XP do modo
// escolhido (relevante sobretudo em Caminhar/Bicicleta, onde difere de 1:1).
const trainingCountdownModalEl = document.getElementById("training-countdown-modal");
const trainingCountdownNumberEl = document.getElementById("training-countdown-number");
const trainingCountdownMessageEl = document.getElementById("training-countdown-message");
const TRAINING_COUNTDOWN_SECONDS = 5;
let trainingCountdownIntervalId = null;

function getModeXpExplanationText(mode) {
  const multiplier = getXpMultiplier(mode);
  const label = MODE_LABEL_PT[mode];
  if (multiplier === 1) return `${label}: 1 km percorrido = 1 km de XP.`;
  return `${label}: 1 km percorrido = ${multiplier.toFixed(2)} km de XP (esforço equivalente menor que correr a mesma distância).`;
}

function showTrainingCountdown() {
  let secondsLeft = TRAINING_COUNTDOWN_SECONDS;
  trainingCountdownMessageEl.textContent = getModeXpExplanationText(selectedTrainingMode);
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
  sessionStartTime = Date.now();
  coinsCheckedKm = 0;
  updateDistanceDisplay();
  showTrainingScreen();

  localStorage.setItem(STORAGE_KEYS.active, "true");
  localStorage.setItem(STORAGE_KEYS.inicioSessao, String(sessionStartTime));
  persistAccumulatedTraining();

  beginWatch();
}

function stopTraining() {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
  if (saveIntervalId !== null) {
    clearInterval(saveIntervalId);
    saveIntervalId = null;
  }

  const sessionDistanceM = totalDistanceM;
  const sessionEffectiveDistanceM = getEffectiveDistanceM(sessionDistanceM, selectedTrainingMode);
  const sessionEndTime = Date.now();
  const sessionDurationSeconds = sessionStartTime ? (sessionEndTime - sessionStartTime) / 1000 : null;

  if (sessionStartTime) {
    enqueueTrainingSession({
      client_id: crypto.randomUUID(),
      started_at: new Date(sessionStartTime).toISOString(),
      ended_at: new Date(sessionEndTime).toISOString(),
      distance_m: sessionDistanceM,
      effective_distance_m: sessionEffectiveDistanceM,
      mode: selectedTrainingMode,
      duration_seconds: sessionDurationSeconds,
    });
  }

  // Distancia EFETIVA (com o multiplicador de justica de esforco ja
  // aplicado) e que conta para XP/pontos/leaderboard/conquistas - a real
  // (GPS) fica so no historico da sessao acima, para o jogador ver o que
  // percorreu de facto.
  addToLifetimeDistance(sessionEffectiveDistanceM);
  addToMonthlyDistance(sessionEffectiveDistanceM);
  incrementTotalTrainingsCompleted();
  checkAndUnlockAchievements(sessionEffectiveDistanceM, sessionDurationSeconds, selectedTrainingMode);

  totalDistanceM = 0;
  lastPosition = null;
  sessionStartTime = null;
  updateXPDisplay(0);
  renderMonsters(); // pode ter desbloqueado monstros novos

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
  sessionStartTime = Number(localStorage.getItem(STORAGE_KEYS.inicioSessao)) || Date.now();
  // Nao re-testa km ja percorridos antes do refresh - so os km novos a
  // partir daqui contam para moedas.
  coinsCheckedKm = Math.floor(totalDistanceM / 1000);

  updateDistanceDisplay();
  showTrainingScreen();
  beginWatch();
}

btnStart.addEventListener("click", startTraining);
btnStop.addEventListener("click", stopTraining);

// Salva o valor mais recente imediatamente ao sair/recarregar a pagina,
// sem esperar pelo proximo checkpoint de 10s
window.addEventListener("pagehide", () => {
  if (watchId !== null) persistAccumulatedTraining();
});

resumeTrainingIfNeeded();
