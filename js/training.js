const startScreen = document.getElementById("start-screen");
const trainingScreen = document.getElementById("training-screen");
const btnStart = document.getElementById("btn-start-treino");
const btnStop = document.getElementById("btn-stop-treino");
const distanceEl = document.getElementById("training-distance");
const speedWarningEl = document.getElementById("speed-warning");

const EARTH_RADIUS_M = 6371000;
const SAVE_INTERVAL_MS = 10000;

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
};

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

function updateDistanceDisplay() {
  distanceEl.textContent = formatDistanceKm(totalDistanceM);
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

    if (speedMps > getMaxSpeedMps()) {
      // Salto irreal (erro de GPS, bicicleta ou veiculo) - mantem a ancora
      // e ignora, mas guarda quanto ficou de fora e avisa o jogador.
      addToDiscardedSpeedDistance(segmentM);
      showSpeedWarning();
      return;
    }

    hideSpeedWarning();
    totalDistanceM += segmentM;
    updateDistanceDisplay();
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

  updateXPDisplay(totalDistanceM);
  saveIntervalId = setInterval(() => {
    persistAccumulatedTraining();
    updateXPDisplay(totalDistanceM);
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

function startTraining() {
  if (!("geolocation" in navigator)) {
    alert("Geolocalização não suportada neste navegador.");
    return;
  }

  totalDistanceM = 0;
  lastPosition = null;
  sessionStartTime = Date.now();
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
  const sessionEndTime = Date.now();
  const sessionDurationSeconds = sessionStartTime ? (sessionEndTime - sessionStartTime) / 1000 : null;

  if (sessionStartTime) {
    enqueueTrainingSession({
      client_id: crypto.randomUUID(),
      started_at: new Date(sessionStartTime).toISOString(),
      ended_at: new Date(sessionEndTime).toISOString(),
      distance_m: sessionDistanceM,
      duration_seconds: sessionDurationSeconds,
    });
  }

  addToLifetimeDistance(totalDistanceM);
  addToMonthlyDistance(totalDistanceM);
  incrementTotalTrainingsCompleted();
  checkAndUnlockAchievements(sessionDistanceM, sessionDurationSeconds);

  totalDistanceM = 0;
  lastPosition = null;
  sessionStartTime = null;
  updateXPDisplay(0);
  renderMonsters(); // pode ter desbloqueado monstros novos

  clearPersistedTraining();
  showStartScreen();
}

// Retoma automaticamente um treino que estava a decorrer antes de um refresh
function resumeTrainingIfNeeded() {
  if (localStorage.getItem(STORAGE_KEYS.active) !== "true") return;
  if (!("geolocation" in navigator)) return;

  totalDistanceM = Number(localStorage.getItem(STORAGE_KEYS.distanciaAcumuladaM)) || 0;
  const savedPosition = localStorage.getItem(STORAGE_KEYS.ultimaPosicao);
  lastPosition = savedPosition ? JSON.parse(savedPosition) : null;
  sessionStartTime = Number(localStorage.getItem(STORAGE_KEYS.inicioSessao)) || Date.now();

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
