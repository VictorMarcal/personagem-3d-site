// Cada equipamento tem um nivel proprio (comeca em 1 = valor base).
// O valor do status cresce de forma recursiva e aditiva (nunca decresce
// de nivel para nivel, ao contrario de uma curva de potencia pura):
//   Valor(1) = STAT_BASE
//   Valor(n) = round(Valor(n-1) + STAT_FLAT + n * STAT_PERCENT)
// Cada status (Vida/Ataque/Defesa) tem a sua propria base/flat/percentagem,
// ajustaveis independentemente no card de Debug (js/debug.js).
// STORAGE_KEYS_EQUIPMENT esta definida em js/storage-keys.js

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
const statRecuperacaoValueEl = document.getElementById("stat-recuperacao-value");
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

// Oferta inicial de 3 pontos (so para quem nunca teve esta chave guardada -
// jogadores existentes com um valor ja gravado, mesmo que 0, nao sao
// afetados). Compensa o mini-boss de nivel 5 ser dificil de vencer so com
// os pontos ganhos a subir de nivel.
const STARTING_UNSPENT_POINTS = 3;

function getUnspentPoints() {
  return getStoredNumber(STORAGE_KEYS_EQUIPMENT.pontosDisponiveis, STARTING_UNSPENT_POINTS);
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

// Recuperacao de vida da armadura: formula linear simples (nao recursiva
// como computeStatValue), aplicada uma vez no inicio de cada batalha
// (js/battle.js) como bonus percentual sobre a Vida maxima do jogador.
// Recuperacao = STAT_RECOVERY_BASE + nivelArmadura x 10% (nivel 1 ja conta
// como 1 nivel, por isso da 20% desde o inicio com a base em 10%).
function computeRecoveryPercent(armorLevel) {
  return getStatRecoveryBase() + armorLevel * 0.1;
}

// Comeca em 1 (nivel inicial) para "subir de nivel" so contar a partir
// do primeiro nivel realmente ganho, nao do nivel de partida.
function getLastAwardedLevel() {
  return getStoredNumber(STORAGE_KEYS_EQUIPMENT.ultimoNivelPremiado, 1);
}

// Cada nivel de personagem ganho (por distancia) da LEVEL_UP_POINTS
// pontos (1 por omissao) - substituiu o antigo sistema de "quartos"
// (4 pontos distribuidos a cada 25% de progresso).
function awardPointsIfNeeded(lifetimeM) {
  const currentLevel = getLevelInfo(lifetimeM).level;
  const lastAwarded = getLastAwardedLevel();
  if (currentLevel <= lastAwarded) return;

  const levelsGained = currentLevel - lastAwarded;
  const newPoints = getUnspentPoints() + levelsGained * getLevelUpPoints();
  localStorage.setItem(STORAGE_KEYS_EQUIPMENT.pontosDisponiveis, String(newPoints));
  localStorage.setItem(STORAGE_KEYS_EQUIPMENT.ultimoNivelPremiado, String(currentLevel));
  queueProgressSync();
}

// Pontuacao por derrotar uma criatura depende das estrelas da vitoria
// (que por sua vez dependem da vida do jogador no fim - ver
// computeStarsForHp em js/monsters.js): 3 estrelas = pontuacao maxima,
// 2 estrelas = maxima-1, 1 estrela = maxima-2 (nunca abaixo de 0).
function computeBonusPointsForStars(maxPoints, stars) {
  if (stars >= 3) return maxPoints;
  if (stars === 2) return Math.max(0, maxPoints - 1);
  return Math.max(0, maxPoints - 2);
}

// Vida atual do jogador: persiste entre lutas e recupera com o tempo real
// decorrido (nao um timer a correr sempre - calculado sob demanda a partir
// do ultimo valor guardado + segundos passados, padrao comum em jogos
// idle). Nunca lutou ainda = comeca cheia.
function getCurrentHp(maxHp) {
  const stored = localStorage.getItem(STORAGE_KEY_CURRENT_HP);
  if (stored === null) return maxHp;

  const lastUpdate = Number(localStorage.getItem(STORAGE_KEY_HP_LAST_UPDATE)) || Date.now();
  const elapsedSeconds = Math.max(0, (Date.now() - lastUpdate) / 1000);
  const recovered = Number(stored) + computeRecoveryPercent(getEquipLevel("vida")) * elapsedSeconds;
  return Math.min(maxHp, Math.max(0, recovered));
}

// Chamado no fim de cada luta (ganha ou perdida) com a vida com que o
// jogador ficou - e a partir daqui que a recuperacao por tempo comeca.
function setCurrentHp(value) {
  localStorage.setItem(STORAGE_KEY_CURRENT_HP, String(value));
  localStorage.setItem(STORAGE_KEY_HP_LAST_UPDATE, String(Date.now()));
}

// Pontos de bonus por derrotar um mini-boss/boss pela primeira vez
// (js/battle.js decide quando chamar isto, com base em isCreatureDefeated
// antes de markCreatureDefeated).
function awardBonusPoints(amount) {
  if (amount <= 0) return;
  localStorage.setItem(STORAGE_KEYS_EQUIPMENT.pontosDisponiveis, String(getUnspentPoints() + amount));
  queueProgressSync();
  renderStatsHud();
  renderDebugCharacterInfo();
}

function renderStatsHud() {
  const maxHp = computeStatValue("vida", getEquipLevel("vida"));
  statVidaValueEl.textContent = `${Math.round(getCurrentHp(maxHp))}/${maxHp}`;
  statAtaqueValueEl.textContent = computeStatValue("ataque", getEquipLevel("ataque"));
  statDefesaValueEl.textContent = computeStatValue("defesa", getEquipLevel("defesa"));
  statRecuperacaoValueEl.textContent = computeRecoveryPercent(getEquipLevel("vida")).toFixed(1);

  hudLevelVidaEl.textContent = getEquipLevel("vida");
  hudLevelAtaqueEl.textContent = getEquipLevel("ataque");
  hudLevelDefesaEl.textContent = getEquipLevel("defesa");

  const hasPoints = getUnspentPoints() > 0;
  Object.values(btnHudUpgradeByType).forEach((btn) => {
    btn.classList.toggle("hidden", !hasPoints);
  });

  updateHpTicker(maxHp);
}

// Enquanto a vida nao estiver completamente recuperada, re-renderiza a
// cada segundo para o HUD mostrar o incremento ao vivo - para sozinho
// assim que chegar ao maximo, sem timer a correr desnecessariamente.
let hpTickerIntervalId = null;

function updateHpTicker(maxHp) {
  const isFull = getCurrentHp(maxHp) >= maxHp;
  if (!isFull && hpTickerIntervalId === null) {
    hpTickerIntervalId = setInterval(() => {
      renderStatsHud();
      // So faz sentido mostrar o "+X" por cima da cabeca fora de combate -
      // durante uma luta o personagem esta noutra posicao (battle-fullscreen)
      // e a recuperacao ja nao avanca de qualquer forma.
      if (!battleInProgress) {
        showFloatingCombatText(head, computeRecoveryPercent(getEquipLevel("vida")));
      }
    }, 1000);
  } else if (isFull && hpTickerIntervalId !== null) {
    clearInterval(hpTickerIntervalId);
    hpTickerIntervalId = null;
  }
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
  queueProgressSync();

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
