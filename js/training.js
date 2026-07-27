const startScreen = document.getElementById("start-screen");
const trainingScreen = document.getElementById("training-screen");
const btnStart = document.getElementById("btn-start-treino");
const btnStop = document.getElementById("btn-stop-treino");
const distanceEl = document.getElementById("training-distance");

const EARTH_RADIUS_M = 6371000;
const SAVE_INTERVAL_MS = 10000;

// Filtros contra ruido de GPS: ignora leituras pouco precisas e movimentos
// pequenos demais para serem deslocamento real (parado, o GPS "deriva" uns
// metros por conta propria)
const MAX_ACCURACY_M = 20;
const MIN_MOVEMENT_M = 3;

const STORAGE_KEYS = {
  active: "treino.ativo",
  distanciaAcumuladaM: "treino.distanciaAcumuladaM",
  ultimaPosicao: "treino.ultimaPosicao",
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

function updateDistanceDisplay() {
  distanceEl.textContent = `${Math.round(totalDistanceM)} m`;
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
}

function onPositionUpdate(position) {
  const { latitude, longitude, accuracy } = position.coords;

  if (accuracy != null && accuracy > MAX_ACCURACY_M) {
    return; // leitura pouco confiavel, ignora
  }

  if (lastPosition) {
    const segmentM = haversineDistance(
      lastPosition.latitude,
      lastPosition.longitude,
      latitude,
      longitude
    );

    if (segmentM < MIN_MOVEMENT_M) {
      return; // provavel ruido de GPS parado, mantem a ancora e ignora
    }

    totalDistanceM += segmentM;
    updateDistanceDisplay();
  }

  lastPosition = { latitude, longitude };
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
}

function showStartScreen() {
  trainingScreen.classList.add("hidden");
  startScreen.classList.remove("hidden");
}

function startTraining() {
  if (!("geolocation" in navigator)) {
    alert("Geolocalização não suportada neste navegador.");
    return;
  }

  totalDistanceM = 0;
  lastPosition = null;
  updateDistanceDisplay();
  showTrainingScreen();

  localStorage.setItem(STORAGE_KEYS.active, "true");
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

  addToLifetimeDistance(totalDistanceM);
  totalDistanceM = 0;
  lastPosition = null;
  updateXPDisplay(0);

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
