// Cada equipamento tem um nivel proprio (comeca em 1 = valor base).
// O valor do status cresce de forma recursiva e aditiva (nunca decresce
// de nivel para nivel, ao contrario de uma curva de potencia pura):
//   Valor(1) = STAT_BASE
//   Valor(n) = round(Valor(n-1) + STAT_FLAT + n * STAT_PERCENT)
// Cada status (Vida/Ataque/Defesa) tem a sua propria base/flat/percentagem,
// ajustaveis independentemente no card de Debug (js/debug.js).
const STORAGE_KEYS_EQUIPMENT = {
  pontosDisponiveis: "personagem.pontosDisponiveis",
  nivelEquipVida: "personagem.nivelEquipVida",
  nivelEquipAtaque: "personagem.nivelEquipAtaque",
  nivelEquipDefesa: "personagem.nivelEquipDefesa",
  ultimoQuartoPremiado: "personagem.ultimoQuartoPremiado",
};

const EQUIP_LEVEL_STORAGE_KEY_BY_TYPE = {
  vida: STORAGE_KEYS_EQUIPMENT.nivelEquipVida,
  ataque: STORAGE_KEYS_EQUIPMENT.nivelEquipAtaque,
  defesa: STORAGE_KEYS_EQUIPMENT.nivelEquipDefesa,
};

const STAT_LABEL_BY_TYPE = {
  vida: "Vida",
  ataque: "Ataque",
  defesa: "Defesa",
};

const statVidaValueEl = document.getElementById("stat-vida-value");
const statAtaqueValueEl = document.getElementById("stat-ataque-value");
const statDefesaValueEl = document.getElementById("stat-defesa-value");
const hudLevelVidaEl = document.getElementById("hud-level-vida");
const hudLevelAtaqueEl = document.getElementById("hud-level-ataque");
const hudLevelDefesaEl = document.getElementById("hud-level-defesa");
const btnUpgradeEquip = document.getElementById("btn-upgrade-equip");

const btnHudUpgradeByType = {
  vida: document.getElementById("btn-hud-upgrade-vida"),
  ataque: document.getElementById("btn-hud-upgrade-ataque"),
  defesa: document.getElementById("btn-hud-upgrade-defesa"),
};

let selectedEquipType = null;

function getStoredNumber(key, defaultValue) {
  const raw = localStorage.getItem(key);
  return raw === null ? defaultValue : Number(raw) || defaultValue;
}

function getUnspentPoints() {
  return getStoredNumber(STORAGE_KEYS_EQUIPMENT.pontosDisponiveis, 0);
}

function getEquipLevel(type) {
  return getStoredNumber(EQUIP_LEVEL_STORAGE_KEY_BY_TYPE[type], 1);
}

function computeStatValue(type, equipLevel) {
  const flat = getStatFlat(type);
  const percent = getStatPercent(type);

  let value = getStatBase(type);
  for (let level = 2; level <= equipLevel; level++) {
    value = Math.round(value + flat + level * percent);
  }
  return value;
}

function getLastAwardedQuarters() {
  return getStoredNumber(STORAGE_KEYS_EQUIPMENT.ultimoQuartoPremiado, 0);
}

// Quantos "quartos" (25%) de progresso ja foram alcancados no total,
// somando todos os niveis ja completados mais a fracao do nivel atual
function getTotalQuartersEarned(lifetimeM) {
  const quartersPerLevel = getQuartersPerLevel();
  const info = getLevelInfo(lifetimeM);
  const fraction = info.distanceIntoLevel / info.distanceForNextLevel;
  const quartersInCurrentLevel = Math.min(
    quartersPerLevel,
    Math.floor(fraction * quartersPerLevel + 1e-9)
  );
  return (info.level - 1) * quartersPerLevel + quartersInCurrentLevel;
}

// Chamado sempre que a distancia confirmada (nunca a sessao em curso)
// avanca, para creditar pontos de status a cada 25% de progresso
function awardPointsIfNeeded(lifetimeM) {
  const totalQuartersEarned = getTotalQuartersEarned(lifetimeM);
  const lastAwarded = getLastAwardedQuarters();
  if (totalQuartersEarned <= lastAwarded) return;

  const newPoints = getUnspentPoints() + (totalQuartersEarned - lastAwarded);
  localStorage.setItem(STORAGE_KEYS_EQUIPMENT.pontosDisponiveis, String(newPoints));
  localStorage.setItem(STORAGE_KEYS_EQUIPMENT.ultimoQuartoPremiado, String(totalQuartersEarned));
}

function renderStatsHud() {
  statVidaValueEl.textContent = computeStatValue("vida", getEquipLevel("vida"));
  statAtaqueValueEl.textContent = computeStatValue("ataque", getEquipLevel("ataque"));
  statDefesaValueEl.textContent = computeStatValue("defesa", getEquipLevel("defesa"));

  hudLevelVidaEl.textContent = getEquipLevel("vida");
  hudLevelAtaqueEl.textContent = getEquipLevel("ataque");
  hudLevelDefesaEl.textContent = getEquipLevel("defesa");

  const hasPoints = getUnspentPoints() > 0;
  Object.values(btnHudUpgradeByType).forEach((btn) => {
    btn.classList.toggle("hidden", !hasPoints);
  });
}

function hideUpgradeButton() {
  btnUpgradeEquip.classList.add("hidden");
  selectedEquipType = null;
}

// Chamado ao clicar/tocar num equipamento no personagem 3D
// (o raycast que identifica qual foi tocado esta em js/main.js)
function selectEquipment(type) {
  selectedEquipType = type;

  const points = getUnspentPoints();
  btnUpgradeEquip.textContent = points > 0 ? `Upgrade ${STAT_LABEL_BY_TYPE[type]}` : "Sem pontos";
  btnUpgradeEquip.disabled = points <= 0;
  btnUpgradeEquip.classList.remove("hidden");
}

// Gasta 1 ponto a subir o nivel de um equipamento; partilhado pelo
// fluxo de clicar no personagem 3D e pelos botoes "+" do HUD
function upgradeEquipmentType(type) {
  if (getUnspentPoints() <= 0) return;

  const levelKey = EQUIP_LEVEL_STORAGE_KEY_BY_TYPE[type];
  localStorage.setItem(levelKey, String(getEquipLevel(type) + 1));
  localStorage.setItem(STORAGE_KEYS_EQUIPMENT.pontosDisponiveis, String(getUnspentPoints() - 1));

  renderStatsHud();
  renderDebugCharacterInfo();
}

function upgradeSelectedEquipment() {
  if (!selectedEquipType) return;
  upgradeEquipmentType(selectedEquipType);
  hideUpgradeButton();
}

btnUpgradeEquip.addEventListener("click", upgradeSelectedEquipment);

Object.entries(btnHudUpgradeByType).forEach(([type, btn]) => {
  btn.addEventListener("click", () => upgradeEquipmentType(type));
});

renderStatsHud();
