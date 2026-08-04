// Sistema de status do jogador (2026-08-04, revisto para remover Foco -
// ver secção 6/7 da documentação). 3 status "investidos" com pontos
// (Energia/Força/Resistência), cada um a alimentar diretamente o seu
// status principal MAIS um status secundário. As 3 pecas de equipamento
// (Arma/Escudo/Armadura) tem TODAS agora uma tabela de 10 tiers por nivel
// de personagem, com nivel de melhoria (1-9) proprio gasto em moedas -
// ver WEAPON_TIERS/SHIELD_TIERS/ARMOR_TIERS abaixo:
//   Vida       = PLAYER_BASE_VIDA   + armadura.vida[Lv]   + round(Energia^ENERGIA_EXP)
//   Ataque     = PLAYER_BASE_ATAQUE + arma.ataque[Lv]     + round(Força^FORCA_EXP)
//   Defesa     = PLAYER_BASE_DEFESA + escudo.defesa[Lv]   + round(Resistência^RESISTENCIA_EXP)
//   Regeneração = REGEN_BASE      + (Energia     + armadura.bonusEnergia[Lv])^REGEN_EXP       (bónus vem da Armadura)
//   Letalidade% = LETALIDADE_BASE + (Força       + arma.bonusForca[Lv])^LETALIDADE_EXP        (bónus vem da Arma)
//   Destreza%   = DESTREZA_BASE   + (Resistência + escudo.bonusResistencia[Lv])^DESTREZA_EXP  (bónus vem do Escudo)
// computeStatValue (fórmula recursiva antiga) mantém-se só para os
// MONSTROS (js/monsters.js) - não mudaram, ver nota na documentação.
// STORAGE_KEYS_EQUIPMENT esta definida em js/storage-keys.js

const INVESTABLE_STAT_STORAGE_KEY_BY_TYPE = {
  energia: STORAGE_KEYS_EQUIPMENT.nivelEnergia,
  forca: STORAGE_KEYS_EQUIPMENT.nivelForca,
  resistencia: STORAGE_KEYS_EQUIPMENT.nivelResistencia,
};

const statVidaValueEl = document.getElementById("stat-vida-value");
const statAtaqueValueEl = document.getElementById("stat-ataque-value");
const statDefesaValueEl = document.getElementById("stat-defesa-value");
const statDestrezaValueEl = document.getElementById("stat-destreza-value");
const statLetalidadeValueEl = document.getElementById("stat-letalidade-value");
const statRegeneracaoValueEl = document.getElementById("stat-regeneracao-value");
const hudUnspentPointsValueEl = document.getElementById("hud-unspent-points-value");
const hudMoedasValueEl = document.getElementById("hud-moedas-value");
const hudLevelEnergiaEl = document.getElementById("hud-level-energia");
const hudLevelForcaEl = document.getElementById("hud-level-forca");
const hudLevelResistenciaEl = document.getElementById("hud-level-resistencia");

const btnHudUpgradeByType = {
  energia: document.getElementById("btn-hud-upgrade-energia"),
  forca: document.getElementById("btn-hud-upgrade-forca"),
  resistencia: document.getElementById("btn-hud-upgrade-resistencia"),
};

// CUIDADO: nao trocar por "Number(raw) || defaultValue" - 0 e um valor
// legitimo (ex: 0 pontos por gastar, ou 0 pontos investidos num status)
// mas e "falsy" em JS, o que fazia qualquer valor guardado como 0 ser lido
// de volta como o defaultValue, criando um ciclo infinito de pontos
// "fantasma" sempre que chegavam a 0.
function getStoredNumber(key, defaultValue) {
  const raw = localStorage.getItem(key);
  if (raw === null) return defaultValue;
  const parsed = Number(raw);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

// Oferta inicial de 4 pontos (so para quem nunca teve esta chave guardada -
// jogadores existentes com um valor ja gravado, mesmo que 0, nao sao
// afetados). Compensa o mini-boss de nivel 5 ser dificil de vencer so com
// os pontos ganhos a subir de nivel.
const STARTING_UNSPENT_POINTS = 4;

function getUnspentPoints() {
  return getStoredNumber(STORAGE_KEYS_EQUIPMENT.pontosDisponiveis, STARTING_UNSPENT_POINTS);
}

// Oferta inicial de 100 moedas (secção 7/16 da documentação) - mesmo
// padrao de STARTING_UNSPENT_POINTS acima, so conta para quem nunca teve
// esta chave guardada.
const STARTING_MOEDAS = 100;

function getMoedas() {
  return getStoredNumber(STORAGE_KEY_MOEDAS, STARTING_MOEDAS);
}

function addMoedas(amount) {
  if (amount <= 0) return;
  localStorage.setItem(STORAGE_KEY_MOEDAS, String(getMoedas() + amount));
  queueProgressSync();
  renderStatsHud();
}

function spendMoedas(amount) {
  if (amount <= 0 || amount > getMoedas()) return false;
  localStorage.setItem(STORAGE_KEY_MOEDAS, String(getMoedas() - amount));
  queueProgressSync();
  renderStatsHud();
  return true;
}

// Nivel investido em Energia/Forca/Resistencia - comeca em 0 (nunca
// investido), ao contrario do antigo nivel de equipamento (comecava em 1,
// ja que a formula recursiva precisava de um "nivel 1" com o valor base).
// Aqui 0 pontos = 0 de contributo extra, a base fica so a cargo de
// PLAYER_BASE_*/equipBasico* (ver cabecalho do ficheiro).
function getInvestableStatLevel(type) {
  return getStoredNumber(INVESTABLE_STAT_STORAGE_KEY_BY_TYPE[type], 0);
}

// Formula recursiva antiga - mantida so para os MONSTROS (computeCreatureStatValue,
// js/monsters.js), que continuam com as curvas statBase/Flat/Percent de
// sempre (js/debug.js). O jogador passou a usar computePlayerVida/Ataque/Defesa
// abaixo, com uma formula diferente.
function computeStatValue(type, equipLevel) {
  const flat = getStatFlat(type);
  const percent = getStatPercent(type);

  let value = getStatBase(type);
  for (let level = 2; level <= equipLevel; level++) {
    value = Math.round(value + flat + level * percent);
  }
  return value;
}

function computePlayerVida(energiaLevel) {
  const tierIndex = getCurrentArmorTierIndex();
  const upgradeLevel = getArmorUpgradeLevel(tierIndex);
  const armorVida = ARMOR_TIERS[tierIndex].vida[upgradeLevel - 1];
  return Math.round(getPlayerBaseVida() + armorVida + Math.pow(energiaLevel, getEnergiaExponent()));
}

// 10 niveis por peca de equipamento, desbloqueados de 10 em 10 niveis de
// personagem (1, 10, 20...90), melhoraveis ate ao nivel de melhoria 9
// (indice 8 nos arrays) gastando moedas (custo, por PASSO: custo[N] =
// preco de subir de Lv(N) para Lv(N+1), custo[0] fica a 0 porque o Lv1
// vem incluido de graca ao desbloquear a peca). Valores preenchidos pelo
// designer (livro_da_forja.csv, 2026-08-04) - ver secção 7 da documentação.
const WEAPON_TIERS = [
  { unlockLevel: 1, ataque: [5, 6, 7, 8, 10, 11, 13, 14, 16], bonusForca: [0, 1, 1, 1, 2, 2, 2, 2, 3], custo: [0, 50, 90, 140, 200, 270, 350, 440, 540] },
  { unlockLevel: 10, ataque: [11, 12, 14, 16, 17, 19, 21, 22, 24], bonusForca: [1, 1, 2, 2, 2, 3, 3, 3, 4], custo: [0, 100, 180, 280, 400, 540, 700, 880, 1080] },
  { unlockLevel: 20, ataque: [22, 23, 24, 26, 28, 29, 30, 32, 33], bonusForca: [2, 2, 3, 3, 3, 4, 4, 5, 5], custo: [0, 150, 270, 420, 600, 810, 1050, 1320, 1620] },
  { unlockLevel: 30, ataque: [30, 31, 33, 34, 35, 37, 38, 39, 41], bonusForca: [3, 3, 3, 4, 4, 5, 5, 6, 6], custo: [0, 200, 360, 560, 800, 1080, 1400, 1760, 2160] },
  { unlockLevel: 40, ataque: [37, 38, 40, 42, 43, 45, 46, 47, 49], bonusForca: [4, 5, 5, 5, 6, 6, 6, 7, 7], custo: [0, 250, 450, 700, 1000, 1350, 1750, 2200, 2700] },
  { unlockLevel: 50, ataque: [46, 48, 49, 51, 53, 54, 56, 57, 59], bonusForca: [5, 5, 6, 6, 6, 6, 7, 8, 8], custo: [0, 300, 540, 840, 1200, 1620, 2100, 2640, 3240] },
  { unlockLevel: 60, ataque: [58, 60, 61, 62, 64, 65, 68, 69, 71], bonusForca: [6, 6, 7, 7, 8, 8, 8, 9, 9], custo: [0, 350, 630, 980, 1400, 1890, 2450, 3080, 3780] },
  { unlockLevel: 70, ataque: [66, 69, 70, 72, 73, 74, 76, 77, 79], bonusForca: [7, 7, 8, 8, 8, 9, 9, 10, 10], custo: [0, 400, 720, 1120, 1600, 2160, 2800, 3520, 4320] },
  { unlockLevel: 80, ataque: [76, 77, 80, 81, 84, 86, 88, 91, 93], bonusForca: [8, 8, 9, 9, 9, 10, 10, 11, 11], custo: [0, 450, 810, 1260, 1800, 2430, 3150, 3960, 4860] },
  { unlockLevel: 90, ataque: [90, 92, 95, 98, 102, 107, 114, 118, 125], bonusForca: [9, 9, 10, 10, 11, 11, 12, 12, 13], custo: [0, 500, 900, 1400, 2000, 2700, 3500, 4400, 5400] },
];

const SHIELD_TIERS = [
  { unlockLevel: 1, defesa: [2, 3, 4, 6, 7, 9, 10, 11, 12], bonusResistencia: [0, 1, 1, 1, 2, 2, 2, 3, 3], custo: [0, 50, 90, 140, 200, 270, 350, 440, 540] },
  { unlockLevel: 10, defesa: [10, 11, 12, 14, 16, 17, 18, 19, 21], bonusResistencia: [1, 1, 2, 2, 2, 3, 3, 4, 4], custo: [0, 100, 180, 280, 400, 540, 700, 880, 1080] },
  { unlockLevel: 20, defesa: [19, 20, 22, 23, 24, 26, 27, 28, 29], bonusResistencia: [2, 2, 2, 2, 3, 3, 4, 5, 5], custo: [0, 150, 270, 420, 600, 810, 1050, 1320, 1620] },
  { unlockLevel: 30, defesa: [27, 28, 30, 31, 32, 33, 35, 36, 38], bonusResistencia: [3, 3, 4, 4, 4, 5, 5, 6, 6], custo: [0, 200, 360, 560, 800, 1080, 1400, 1760, 2160] },
  { unlockLevel: 40, defesa: [36, 37, 39, 41, 42, 43, 45, 46, 48], bonusResistencia: [4, 4, 5, 5, 5, 6, 6, 7, 7], custo: [0, 250, 450, 700, 1000, 1350, 1750, 2200, 2700] },
  { unlockLevel: 50, defesa: [47, 48, 50, 52, 53, 54, 57, 59, 61], bonusResistencia: [5, 5, 6, 6, 7, 7, 8, 8, 8], custo: [0, 300, 540, 840, 1200, 1620, 2100, 2640, 3240] },
  { unlockLevel: 60, defesa: [58, 59, 61, 63, 66, 67, 69, 71, 74], bonusResistencia: [6, 6, 6, 6, 7, 7, 8, 9, 9], custo: [0, 350, 630, 980, 1400, 1890, 2450, 3080, 3780] },
  { unlockLevel: 70, defesa: [70, 74, 76, 79, 83, 86, 89, 91, 93], bonusResistencia: [7, 7, 8, 8, 9, 9, 9, 10, 10], custo: [0, 400, 720, 1120, 1600, 2160, 2800, 3520, 4320] },
  { unlockLevel: 80, defesa: [90, 94, 96, 99, 101, 103, 107, 109, 112], bonusResistencia: [8, 8, 9, 9, 10, 10, 10, 11, 11], custo: [0, 450, 810, 1260, 1800, 2430, 3150, 3960, 4860] },
  { unlockLevel: 90, defesa: [110, 113, 117, 121, 124, 129, 135, 141, 150], bonusResistencia: [9, 9, 9, 10, 10, 11, 12, 12, 13], custo: [0, 500, 900, 1400, 2000, 2700, 3500, 4400, 5400] },
];

const ARMOR_TIERS = [
  { unlockLevel: 1, vida: [3, 4, 6, 7, 8, 9, 11, 12, 14], bonusEnergia: [0, 1, 1, 2, 2, 2, 3, 3, 4], custo: [0, 50, 90, 140, 200, 270, 350, 440, 540] },
  { unlockLevel: 10, vida: [11, 13, 14, 15, 17, 18, 19, 21, 23], bonusEnergia: [1, 1, 2, 2, 3, 3, 4, 4, 5], custo: [0, 100, 180, 280, 400, 540, 700, 880, 1080] },
  { unlockLevel: 20, vida: [19, 21, 22, 24, 25, 27, 28, 29, 30], bonusEnergia: [2, 2, 3, 3, 3, 4, 4, 5, 6], custo: [0, 150, 270, 420, 600, 810, 1050, 1320, 1620] },
  { unlockLevel: 30, vida: [28, 29, 31, 33, 34, 35, 37, 39, 41], bonusEnergia: [3, 3, 3, 3, 4, 4, 5, 6, 7], custo: [0, 200, 360, 560, 800, 1080, 1400, 1760, 2160] },
  { unlockLevel: 40, vida: [37, 39, 43, 45, 46, 47, 49, 51, 53], bonusEnergia: [4, 4, 5, 5, 6, 6, 7, 7, 8], custo: [0, 250, 450, 700, 1000, 1350, 1750, 2200, 2700] },
  { unlockLevel: 50, vida: [48, 51, 53, 54, 56, 57, 58, 60, 61], bonusEnergia: [5, 5, 6, 6, 6, 7, 7, 8, 9], custo: [0, 300, 540, 840, 1200, 1620, 2100, 2640, 3240] },
  { unlockLevel: 60, vida: [58, 61, 63, 64, 66, 67, 68, 71, 73], bonusEnergia: [6, 6, 7, 7, 8, 8, 8, 9, 10], custo: [0, 350, 630, 980, 1400, 1890, 2450, 3080, 3780] },
  { unlockLevel: 70, vida: [70, 74, 75, 76, 79, 81, 82, 84, 86], bonusEnergia: [7, 7, 8, 8, 9, 9, 9, 10, 11], custo: [0, 400, 720, 1120, 1600, 2160, 2800, 3520, 4320] },
  { unlockLevel: 80, vida: [78, 79, 84, 86, 89, 92, 94, 97, 99], bonusEnergia: [8, 9, 9, 10, 11, 11, 12, 12, 12], custo: [0, 450, 810, 1260, 1800, 2430, 3150, 3960, 4860] },
  { unlockLevel: 90, vida: [97, 101, 107, 114, 119, 124, 126, 128, 135], bonusEnergia: [9, 9, 9, 10, 11, 11, 12, 13, 13], custo: [0, 500, 900, 1400, 2000, 2700, 3500, 4400, 5400] },
];

const EQUIP_MAX_UPGRADE_LEVEL = 9;

function getTierIndexForLevel(tiers, level) {
  let index = 0;
  tiers.forEach((candidate, i) => {
    if (level >= candidate.unlockLevel) index = i;
  });
  return index; // 0-based
}

// getLevelInfo/getLifetimeDistanceM sao de js/experience.js, que carrega
// DEPOIS de equipment.js (que por sua vez awardPointsIfNeeded, chamado por
// experience.js) - dependencia circular entre os dois ficheiros. O guard
// abaixo evita um ReferenceError na primeira chamada de renderStatsHud()
// (no fundo deste ficheiro, antes de experience.js ter carregado); assim
// que bootstrapAfterLogin() (js/auth.js) chamar refreshAllAfterConfigChange
// mais tarde, ja com tudo carregado, o valor correto e usado.
function getCurrentTierIndex(tiers) {
  if (typeof getLevelInfo !== "function" || typeof getLifetimeDistanceM !== "function") {
    return 0;
  }
  return getTierIndexForLevel(tiers, getLevelInfo(getLifetimeDistanceM()).level);
}

// Nivel de melhoria (1-9) de CADA peca ja desbloqueada, guardado por tier -
// nunca se perde ao subir de nivel e desbloquear a peca seguinte (secção 7
// da documentação, decisao explicita: cada peca guarda o seu progresso
// independentemente de estar a ser usada ou nao). Partilhado por
// Arma/Escudo/Armadura, so muda o storageKey.
function getEquipUpgradeLevelsMap(storageKey) {
  const raw = localStorage.getItem(storageKey);
  try {
    const parsed = raw ? JSON.parse(raw) : {};
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed : {};
  } catch (e) {
    return {};
  }
}

function getEquipUpgradeLevel(storageKey, tierIndex) {
  return getEquipUpgradeLevelsMap(storageKey)[tierIndex] || 1;
}

function setEquipUpgradeLevel(storageKey, tierIndex, level) {
  const map = getEquipUpgradeLevelsMap(storageKey);
  map[tierIndex] = level;
  localStorage.setItem(storageKey, JSON.stringify(map));
  queueProgressSync();
}

// Custo em moedas para subir do nivel atual para o seguinte - undefined se
// ja estiver no maximo (Lv9).
function getEquipUpgradeCost(tiers, tierIndex, currentLevel) {
  if (currentLevel >= EQUIP_MAX_UPGRADE_LEVEL) return undefined;
  return tiers[tierIndex].custo[currentLevel];
}

// --- Arma -----------------------------------------------------------------
function getCurrentWeaponTierIndex() { return getCurrentTierIndex(WEAPON_TIERS); }
function getWeaponUpgradeLevelsMap() { return getEquipUpgradeLevelsMap(STORAGE_KEY_WEAPON_UPGRADE_LEVELS); }
function getWeaponUpgradeLevel(tierIndex) { return getEquipUpgradeLevel(STORAGE_KEY_WEAPON_UPGRADE_LEVELS, tierIndex); }
function setWeaponUpgradeLevel(tierIndex, level) { setEquipUpgradeLevel(STORAGE_KEY_WEAPON_UPGRADE_LEVELS, tierIndex, level); }
function getWeaponUpgradeCost(tierIndex, currentLevel) { return getEquipUpgradeCost(WEAPON_TIERS, tierIndex, currentLevel); }

// --- Escudo -----------------------------------------------------------------
function getCurrentShieldTierIndex() { return getCurrentTierIndex(SHIELD_TIERS); }
function getShieldUpgradeLevelsMap() { return getEquipUpgradeLevelsMap(STORAGE_KEY_SHIELD_UPGRADE_LEVELS); }
function getShieldUpgradeLevel(tierIndex) { return getEquipUpgradeLevel(STORAGE_KEY_SHIELD_UPGRADE_LEVELS, tierIndex); }
function setShieldUpgradeLevel(tierIndex, level) { setEquipUpgradeLevel(STORAGE_KEY_SHIELD_UPGRADE_LEVELS, tierIndex, level); }
function getShieldUpgradeCost(tierIndex, currentLevel) { return getEquipUpgradeCost(SHIELD_TIERS, tierIndex, currentLevel); }

// --- Armadura -----------------------------------------------------------------
function getCurrentArmorTierIndex() { return getCurrentTierIndex(ARMOR_TIERS); }
function getArmorUpgradeLevelsMap() { return getEquipUpgradeLevelsMap(STORAGE_KEY_ARMOR_UPGRADE_LEVELS); }
function getArmorUpgradeLevel(tierIndex) { return getEquipUpgradeLevel(STORAGE_KEY_ARMOR_UPGRADE_LEVELS, tierIndex); }
function setArmorUpgradeLevel(tierIndex, level) { setEquipUpgradeLevel(STORAGE_KEY_ARMOR_UPGRADE_LEVELS, tierIndex, level); }
function getArmorUpgradeCost(tierIndex, currentLevel) { return getEquipUpgradeCost(ARMOR_TIERS, tierIndex, currentLevel); }

function computePlayerAtaque(forcaLevel) {
  const tierIndex = getCurrentWeaponTierIndex();
  const upgradeLevel = getWeaponUpgradeLevel(tierIndex);
  const weaponAtaque = WEAPON_TIERS[tierIndex].ataque[upgradeLevel - 1];
  return Math.round(getPlayerBaseAtaque() + weaponAtaque + Math.pow(forcaLevel, getForcaExponent()));
}

function computePlayerDefesa(resistenciaLevel) {
  const tierIndex = getCurrentShieldTierIndex();
  const upgradeLevel = getShieldUpgradeLevel(tierIndex);
  const shieldDefesa = SHIELD_TIERS[tierIndex].defesa[upgradeLevel - 1];
  return Math.round(getPlayerBaseDefesa() + shieldDefesa + Math.pow(resistenciaLevel, getResistenciaExponent()));
}

// Destreza/Letalidade/Regeneracao (sem Foco - cada uma alimentada pelo
// nivel investido no status que a governa + o bonus da peca de
// equipamento correspondente NESSE mesmo nivel de melhoria, ver cabecalho
// do ficheiro). Destreza/Letalidade: formulas "base + (nivel+bonus)^expoente",
// resultado em pontos percentuais - dividido por 100 para dar a fracao
// (0-1) usada nas rolagens de combate (js/battle.js).
function computeDestrezaChance(resistenciaLevel) {
  const tierIndex = getCurrentShieldTierIndex();
  const upgradeLevel = getShieldUpgradeLevel(tierIndex);
  const shieldBonus = SHIELD_TIERS[tierIndex].bonusResistencia[upgradeLevel - 1];
  const total = resistenciaLevel + shieldBonus;
  return (getDestrezaBase() + Math.pow(total, getDestrezaExponent())) / 100;
}

function computeLetalidadeChance(forcaLevel) {
  const tierIndex = getCurrentWeaponTierIndex();
  const upgradeLevel = getWeaponUpgradeLevel(tierIndex);
  const weaponForcaBonus = WEAPON_TIERS[tierIndex].bonusForca[upgradeLevel - 1];
  const total = forcaLevel + weaponForcaBonus;
  return (getLetalidadeBase() + Math.pow(total, getLetalidadeExponent())) / 100;
}

// Regeneracao: mesma forma, mas o resultado fica em pontos de vida por
// segundo (nao percentagem) - usada por getCurrentHp abaixo.
function computeRegeneracaoPerSecond(energiaLevel) {
  const tierIndex = getCurrentArmorTierIndex();
  const upgradeLevel = getArmorUpgradeLevel(tierIndex);
  const armorBonus = ARMOR_TIERS[tierIndex].bonusEnergia[upgradeLevel - 1];
  const total = energiaLevel + armorBonus;
  return getRegeneracaoBase() + Math.pow(total, getRegeneracaoExponent());
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
// idle). Nunca lutou ainda = comeca cheia. A regeneracao vem da Energia
// (secção 7).
function getCurrentHp(maxHp) {
  const stored = localStorage.getItem(STORAGE_KEY_CURRENT_HP);
  if (stored === null) return maxHp;

  const lastUpdate = Number(localStorage.getItem(STORAGE_KEY_HP_LAST_UPDATE)) || Date.now();
  const elapsedSeconds = Math.max(0, (Date.now() - lastUpdate) / 1000);
  const recovered = Number(stored) + computeRegeneracaoPerSecond(getInvestableStatLevel("energia")) * elapsedSeconds;
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
  const energiaLevel = getInvestableStatLevel("energia");
  const forcaLevel = getInvestableStatLevel("forca");
  const resistenciaLevel = getInvestableStatLevel("resistencia");

  const maxHp = computePlayerVida(energiaLevel);
  statVidaValueEl.textContent = `${Math.round(getCurrentHp(maxHp))}/${maxHp}`;
  statAtaqueValueEl.textContent = computePlayerAtaque(forcaLevel);
  statDefesaValueEl.textContent = computePlayerDefesa(resistenciaLevel);
  statDestrezaValueEl.textContent = `${(computeDestrezaChance(resistenciaLevel) * 100).toFixed(1)}%`;
  statLetalidadeValueEl.textContent = `${(computeLetalidadeChance(forcaLevel) * 100).toFixed(1)}%`;
  statRegeneracaoValueEl.textContent = computeRegeneracaoPerSecond(energiaLevel).toFixed(1);
  hudUnspentPointsValueEl.textContent = getUnspentPoints();
  hudMoedasValueEl.textContent = getMoedas();

  hudLevelEnergiaEl.textContent = energiaLevel;
  hudLevelForcaEl.textContent = forcaLevel;
  hudLevelResistenciaEl.textContent = resistenciaLevel;

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
        showFloatingCombatText(head, computeRegeneracaoPerSecond(getInvestableStatLevel("energia")));
      }
    }, 1000);
  } else if (isFull && hpTickerIntervalId !== null) {
    clearInterval(hpTickerIntervalId);
    hpTickerIntervalId = null;
  }
}

// --- Popups de evolucao de Arma/Escudo/Armadura (gastam moedas, secção 7
// da documentação) --------------------------------------------------------
// Fabrica generica partilhada pelas 3 pecas - cada uma so difere no
// prefixo dos ids DOM, nos tiers/chaves de dados e no nome mostrado.
// Escudo/Armadura tem tiers proprios desde 2026-08-04 (antes tinham um
// bonus fixo unico, sem popup - agora identico a Arma em tudo).
function createEquipmentUpgradeController(config) {
  const idPrefix = config.idPrefix;
  const modalEl = document.getElementById(`${idPrefix}-upgrade-modal`);
  const titleEl = document.getElementById(`${idPrefix}-upgrade-title`);
  const currentPrimaryEl = document.getElementById(`${idPrefix}-upgrade-current-${config.primaryIdSuffix}`);
  const currentSecondaryEl = document.getElementById(`${idPrefix}-upgrade-current-${config.secondaryIdSuffix}`);
  const nextRowEl = document.getElementById(`${idPrefix}-upgrade-next-row`);
  const nextPrimaryEl = document.getElementById(`${idPrefix}-upgrade-next-${config.primaryIdSuffix}`);
  const nextSecondaryEl = document.getElementById(`${idPrefix}-upgrade-next-${config.secondaryIdSuffix}`);
  const maxedEl = document.getElementById(`${idPrefix}-upgrade-maxed`);
  const costRowEl = document.getElementById(`${idPrefix}-upgrade-cost-row`);
  const costEl = document.getElementById(`${idPrefix}-upgrade-cost`);
  const coinsEl = document.getElementById(`${idPrefix}-upgrade-coins`);
  const confirmBtn = document.getElementById(`btn-${idPrefix}-upgrade-confirm`);
  const closeBtn = document.getElementById(`btn-${idPrefix}-upgrade-close`);

  function render() {
    const tierIndex = getCurrentTierIndex(config.tiers);
    const tier = config.tiers[tierIndex];
    const level = getEquipUpgradeLevel(config.storageKey, tierIndex);
    const coins = getMoedas();

    titleEl.textContent = `${config.pieceName} do nível ${tier.unlockLevel} — Melhoria Lv${level}/${EQUIP_MAX_UPGRADE_LEVEL}`;
    currentPrimaryEl.textContent = tier[config.primaryKey][level - 1];
    currentSecondaryEl.textContent = `+${tier[config.secondaryKey][level - 1]}`;
    coinsEl.textContent = coins;

    const cost = getEquipUpgradeCost(config.tiers, tierIndex, level);
    const maxed = cost === undefined;

    nextRowEl.classList.toggle("hidden", maxed);
    maxedEl.classList.toggle("hidden", !maxed);
    costRowEl.classList.toggle("hidden", maxed);
    confirmBtn.classList.toggle("hidden", maxed);

    if (!maxed) {
      nextPrimaryEl.textContent = `${tier[config.primaryKey][level]} (+${tier[config.primaryKey][level] - tier[config.primaryKey][level - 1]})`;
      nextSecondaryEl.textContent = `+${tier[config.secondaryKey][level]} (+${tier[config.secondaryKey][level] - tier[config.secondaryKey][level - 1]})`;
      costEl.textContent = cost;
      confirmBtn.disabled = coins < cost;
      confirmBtn.textContent = coins < cost ? "Moedas insuficientes" : `Evoluir ${config.pieceNameLower} (${cost} moedas)`;
    }
  }

  function open() {
    render();
    modalEl.classList.remove("hidden");
  }

  function close() {
    modalEl.classList.add("hidden");
  }

  function upgrade() {
    const tierIndex = getCurrentTierIndex(config.tiers);
    const level = getEquipUpgradeLevel(config.storageKey, tierIndex);
    const cost = getEquipUpgradeCost(config.tiers, tierIndex, level);
    if (cost === undefined) return; // ja no nivel maximo
    if (getMoedas() < cost) return; // moedas insuficientes

    // Sobe o nivel de melhoria ANTES de gastar as moedas: spendMoedas ja
    // chama renderStatsHud() internamente, e o HUD tem de refletir o
    // status novo, nao o antigo (ordem trocada = HUD sempre um passo
    // atrasado, bug real apanhado ao testar a Arma).
    setEquipUpgradeLevel(config.storageKey, tierIndex, level + 1);
    spendMoedas(cost);

    render();
  }

  confirmBtn.addEventListener("click", upgrade);
  closeBtn.addEventListener("click", close);
  modalEl.addEventListener("click", (event) => {
    if (event.target.id === `${idPrefix}-upgrade-modal`) close();
  });

  return { open, close, render };
}

const weaponUpgradeController = createEquipmentUpgradeController({
  idPrefix: "weapon",
  tiers: WEAPON_TIERS,
  storageKey: STORAGE_KEY_WEAPON_UPGRADE_LEVELS,
  primaryKey: "ataque",
  secondaryKey: "bonusForca",
  primaryIdSuffix: "ataque",
  secondaryIdSuffix: "forca",
  pieceName: "Arma",
  pieceNameLower: "arma",
});

const shieldUpgradeController = createEquipmentUpgradeController({
  idPrefix: "shield",
  tiers: SHIELD_TIERS,
  storageKey: STORAGE_KEY_SHIELD_UPGRADE_LEVELS,
  primaryKey: "defesa",
  secondaryKey: "bonusResistencia",
  primaryIdSuffix: "defesa",
  secondaryIdSuffix: "resistencia",
  pieceName: "Escudo",
  pieceNameLower: "escudo",
});

const armorUpgradeController = createEquipmentUpgradeController({
  idPrefix: "armor",
  tiers: ARMOR_TIERS,
  storageKey: STORAGE_KEY_ARMOR_UPGRADE_LEVELS,
  primaryKey: "vida",
  secondaryKey: "bonusEnergia",
  primaryIdSuffix: "vida",
  secondaryIdSuffix: "energia",
  pieceName: "Armadura",
  pieceNameLower: "armadura",
});

function openWeaponUpgradeModal() { weaponUpgradeController.open(); }
function openShieldUpgradeModal() { shieldUpgradeController.open(); }
function openArmorUpgradeModal() { armorUpgradeController.open(); }

// Gasta 1 ponto a subir o nivel de um status investido - so pelos botoes
// "+" do HUD agora (as 3 pecas de equipamento no modelo 3D abrem os
// popups de moedas acima, ja nao investem pontos por clique direto).
function upgradeEquipmentType(type) {
  if (getUnspentPoints() <= 0) return;

  const levelKey = INVESTABLE_STAT_STORAGE_KEY_BY_TYPE[type];
  localStorage.setItem(levelKey, String(getInvestableStatLevel(type) + 1));
  localStorage.setItem(STORAGE_KEYS_EQUIPMENT.pontosDisponiveis, String(getUnspentPoints() - 1));
  queueProgressSync();

  renderStatsHud();
  renderDebugCharacterInfo();
}

Object.entries(btnHudUpgradeByType).forEach(([type, btn]) => {
  btn.addEventListener("click", () => upgradeEquipmentType(type));
});

renderStatsHud();
