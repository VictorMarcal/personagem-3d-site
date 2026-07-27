// Painel de debug: permite ajustar em tempo real o limite de velocidade
// usado para filtrar leituras de GPS irreais (js/training.js le este
// valor via getMaxSpeedMps()). Util para testar de carro sem que o
// filtro rejeite toda a distancia por ir demasiado rapido.
const DEFAULT_MAX_SPEED_KMH = 30;
const STORAGE_KEY_DEBUG_MAX_SPEED_KMH = "debug.maxSpeedKmh";

const inputMaxSpeed = document.getElementById("input-max-speed");
const btnSaveMaxSpeed = document.getElementById("btn-save-max-speed");
const btnResetMaxSpeed = document.getElementById("btn-reset-max-speed");
const debugMaxSpeedStatus = document.getElementById("debug-max-speed-status");

function getMaxSpeedKmh() {
  const stored = Number(localStorage.getItem(STORAGE_KEY_DEBUG_MAX_SPEED_KMH));
  return stored > 0 ? stored : DEFAULT_MAX_SPEED_KMH;
}

function getMaxSpeedMps() {
  return getMaxSpeedKmh() / 3.6;
}

function loadMaxSpeedInput() {
  inputMaxSpeed.value = getMaxSpeedKmh();
}

function saveMaxSpeed() {
  const value = Number(inputMaxSpeed.value);
  if (!(value > 0)) return;

  localStorage.setItem(STORAGE_KEY_DEBUG_MAX_SPEED_KMH, String(value));
  debugMaxSpeedStatus.textContent = `Guardado: ${value} km/h`;
}

function resetMaxSpeed() {
  localStorage.removeItem(STORAGE_KEY_DEBUG_MAX_SPEED_KMH);
  loadMaxSpeedInput();
  debugMaxSpeedStatus.textContent = `Reposto para o padrão: ${DEFAULT_MAX_SPEED_KMH} km/h`;
}

btnSaveMaxSpeed.addEventListener("click", saveMaxSpeed);
btnResetMaxSpeed.addEventListener("click", resetMaxSpeed);

loadMaxSpeedInput();
