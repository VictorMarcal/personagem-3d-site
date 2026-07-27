// Cada equipamento tem um nivel proprio (comeca em 1 = valor base 100).
// O valor do status cresce em curva sub-linear (retornos decrescentes)
// para nao explodir em niveis altos: valor = 100 * nivelEquip^0.7
const STAT_BASE = 100;
const STAT_LEVEL_EXP = 0.7;

// 1 ponto a cada 25% de progresso dentro do nivel do personagem
// (4 pontos por nivel, distribuidos ao longo do nivel em vez de so no fim)
const QUARTERS_PER_LEVEL = 4;

const STORAGE_KEYS_EQUIPMENT = {
  pontosDisponiveis: "personagem.pontosDisponiveis",
  nivelEquipEnergia: "personagem.nivelEquipEnergia",
  nivelEquipAtaque: "personagem.nivelEquipAtaque",
  nivelEquipDefesa: "personagem.nivelEquipDefesa",
  ultimoQuartoPremiado: "personagem.ultimoQuartoPremiado",
};

const EQUIP_LEVEL_STORAGE_KEY_BY_TYPE = {
  energia: STORAGE_KEYS_EQUIPMENT.nivelEquipEnergia,
  ataque: STORAGE_KEYS_EQUIPMENT.nivelEquipAtaque,
  defesa: STORAGE_KEYS_EQUIPMENT.nivelEquipDefesa,
};

const STAT_LABEL_BY_TYPE = {
  energia: "Energia",
  ataque: "Ataque",
  defesa: "Defesa",
};

const statEnergiaValueEl = document.getElementById("stat-energia-value");
const statAtaqueValueEl = document.getElementById("stat-ataque-value");
const statDefesaValueEl = document.getElementById("stat-defesa-value");
const btnUpgradeEquip = document.getElementById("btn-upgrade-equip");

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

function computeStatValue(equipLevel) {
  return Math.round(STAT_BASE * Math.pow(equipLevel, STAT_LEVEL_EXP));
}

function getLastAwardedQuarters() {
  return getStoredNumber(STORAGE_KEYS_EQUIPMENT.ultimoQuartoPremiado, 0);
}

// Quantos "quartos" (25%) de progresso ja foram alcancados no total,
// somando todos os niveis ja completados mais a fracao do nivel atual
function getTotalQuartersEarned(lifetimeM) {
  const info = getLevelInfo(lifetimeM);
  const fraction = info.distanceIntoLevel / info.distanceForNextLevel;
  const quartersInCurrentLevel = Math.min(
    QUARTERS_PER_LEVEL,
    Math.floor(fraction * QUARTERS_PER_LEVEL + 1e-9)
  );
  return (info.level - 1) * QUARTERS_PER_LEVEL + quartersInCurrentLevel;
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
  statEnergiaValueEl.textContent = computeStatValue(getEquipLevel("energia"));
  statAtaqueValueEl.textContent = computeStatValue(getEquipLevel("ataque"));
  statDefesaValueEl.textContent = computeStatValue(getEquipLevel("defesa"));
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

function upgradeSelectedEquipment() {
  if (!selectedEquipType || getUnspentPoints() <= 0) return;

  const levelKey = EQUIP_LEVEL_STORAGE_KEY_BY_TYPE[selectedEquipType];
  localStorage.setItem(levelKey, String(getEquipLevel(selectedEquipType) + 1));
  localStorage.setItem(STORAGE_KEYS_EQUIPMENT.pontosDisponiveis, String(getUnspentPoints() - 1));

  renderStatsHud();
  hideUpgradeButton();
}

btnUpgradeEquip.addEventListener("click", upgradeSelectedEquipment);

renderStatsHud();
