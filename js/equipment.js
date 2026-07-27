// A cada nivel ganho, o personagem recebe pontos de status para
// evoluir os equipamentos (armadura/escudo/espada)
const POINTS_PER_LEVEL = 4;

const STORAGE_KEYS_EQUIPMENT = {
  pontosDisponiveis: "personagem.pontosDisponiveis",
  statEnergia: "personagem.statEnergia",
  statAtaque: "personagem.statAtaque",
  statDefesa: "personagem.statDefesa",
  ultimoNivelPremiado: "personagem.ultimoNivelPremiado",
};

const STAT_STORAGE_KEY_BY_TYPE = {
  energia: STORAGE_KEYS_EQUIPMENT.statEnergia,
  ataque: STORAGE_KEYS_EQUIPMENT.statAtaque,
  defesa: STORAGE_KEYS_EQUIPMENT.statDefesa,
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

function getStoredNumber(key, defaultValue = 0) {
  const raw = localStorage.getItem(key);
  return raw === null ? defaultValue : Number(raw) || defaultValue;
}

function getUnspentPoints() {
  return getStoredNumber(STORAGE_KEYS_EQUIPMENT.pontosDisponiveis, 0);
}

function getStat(type) {
  return getStoredNumber(STAT_STORAGE_KEY_BY_TYPE[type], 0);
}

function getLastAwardedLevel() {
  return getStoredNumber(STORAGE_KEYS_EQUIPMENT.ultimoNivelPremiado, 1);
}

// Chamado sempre que o nivel confirmado (com base na distancia ja
// acumulada, nao na sessao em curso) avanca, para creditar os pontos
function awardPointsIfLeveledUp(currentLevel) {
  const lastAwarded = getLastAwardedLevel();
  if (currentLevel <= lastAwarded) return;

  const levelsGained = currentLevel - lastAwarded;
  const newPoints = getUnspentPoints() + levelsGained * POINTS_PER_LEVEL;

  localStorage.setItem(STORAGE_KEYS_EQUIPMENT.pontosDisponiveis, String(newPoints));
  localStorage.setItem(STORAGE_KEYS_EQUIPMENT.ultimoNivelPremiado, String(currentLevel));
}

function renderStatsHud() {
  statEnergiaValueEl.textContent = getStat("energia");
  statAtaqueValueEl.textContent = getStat("ataque");
  statDefesaValueEl.textContent = getStat("defesa");
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

  const statKey = STAT_STORAGE_KEY_BY_TYPE[selectedEquipType];
  localStorage.setItem(statKey, String(getStat(selectedEquipType) + 1));
  localStorage.setItem(STORAGE_KEYS_EQUIPMENT.pontosDisponiveis, String(getUnspentPoints() - 1));

  renderStatsHud();
  hideUpgradeButton();
}

btnUpgradeEquip.addEventListener("click", upgradeSelectedEquipment);

renderStatsHud();
