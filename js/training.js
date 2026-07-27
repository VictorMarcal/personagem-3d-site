const startScreen = document.getElementById("start-screen");
const trainingScreen = document.getElementById("training-screen");
const btnStart = document.getElementById("btn-start-treino");
const btnStop = document.getElementById("btn-stop-treino");
const distanceEl = document.getElementById("training-distance");

const EARTH_RADIUS_M = 6371000;

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

let watchId = null;
let lastPosition = null;
let totalDistanceM = 0;

function updateDistanceDisplay() {
  distanceEl.textContent = `${Math.round(totalDistanceM)} m`;
}

function onPositionUpdate(position) {
  const { latitude, longitude } = position.coords;
  if (lastPosition) {
    totalDistanceM += haversineDistance(
      lastPosition.latitude,
      lastPosition.longitude,
      latitude,
      longitude
    );
    updateDistanceDisplay();
  }
  lastPosition = { latitude, longitude };
}

function onPositionError(error) {
  distanceEl.textContent = "GPS indisponível";
  console.error("Erro de geolocalizacao:", error.message);
}

function startTraining() {
  if (!("geolocation" in navigator)) {
    alert("Geolocalização não suportada neste navegador.");
    return;
  }

  totalDistanceM = 0;
  lastPosition = null;
  updateDistanceDisplay();
  startScreen.classList.add("hidden");
  trainingScreen.classList.remove("hidden");

  watchId = navigator.geolocation.watchPosition(onPositionUpdate, onPositionError, {
    enableHighAccuracy: true,
    maximumAge: 1000,
    timeout: 10000,
  });
}

function stopTraining() {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
  trainingScreen.classList.add("hidden");
  startScreen.classList.remove("hidden");
}

btnStart.addEventListener("click", startTraining);
btnStop.addEventListener("click", stopTraining);
