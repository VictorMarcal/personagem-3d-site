// Sistema de status do jogador (2026-08-04, revisto para remover Foco -
// ver secção 6/7 da documentação). 3 status "investidos" com pontos
// (Energia/Força/Resistência), cada um a alimentar diretamente o seu
// status principal MAIS um status secundário, mais um bónus do
// equipamento atual (Escudo/Armadura ainda "básicos" fixos, sem sistema de
// moedas - ver getEquipBasico*/getEquipBonus* em js/debug.js; Arma já tem
// uma tabela de 10 niveis, ver WEAPON_TIERS abaixo):
//   Vida       = PLAYER_BASE_VIDA   + equipBasicoVida   + round(Energia^ENERGIA_EXP)
//   Ataque     = PLAYER_BASE_ATAQUE + arma.ataque[Lv]   + round(Força^FORCA_EXP)
//   Defesa     = PLAYER_BASE_DEFESA + equipBasicoDefesa + round(Resistência^RESISTENCIA_EXP)
//   Regeneração = REGEN_BASE      + (Energia     + equipBonusRegeneracao)^REGEN_EXP       (vida/segundo, bónus vem da Armadura)
//   Letalidade% = LETALIDADE_BASE + (Força       + arma.bonusForca[Lv])^LETALIDADE_EXP    (bónus vem da Arma)
//   Destreza%   = DESTREZA_BASE   + (Resistência + equipBonusDestreza)^DESTREZA_EXP       (bónus vem do Escudo)
// computeStatValue (fórmula recursiva antiga) mantém-se só para os
// MONSTROS (js/monsters.js) - não mudaram, ver nota na documentação.
// STORAGE_KEYS_EQUIPMENT esta definida em js/storage-keys.js

const INVESTABLE_STAT_STORAGE_KEY_BY_TYPE = {
  energia: STORAGE_KEYS_EQUIPMENT.nivelEnergia,
  forca: STORAGE_KEYS_EQUIPMENT.nivelForca,
  resistencia: STORAGE_KEYS_EQUIPMENT.nivelResistencia,
};

const STAT_LABEL_BY_TYPE = {
  energia: "Energia",
  forca: "Força",
  resistencia: "Resistência",
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
const btnUpgradeEquip = document.getElementById("btn-upgrade-equip");

const btnHudUpgradeByType = {
  energia: document.getElementById("btn-hud-upgrade-energia"),
  forca: document.getElementById("btn-hud-upgrade-forca"),
  resistencia: document.getElementById("btn-hud-upgrade-resistencia"),
};

let selectedEquipType = null;

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
  return Math.round(getPlayerBaseVida() + getEquipBasicoVida() + Math.pow(energiaLevel, getEnergiaExponent()));
}

// 10 armas, desbloqueadas de 10 em 10 niveis de personagem (1, 10, 20...90),
// cada uma com o seu proprio valor de Ataque e bonus de Forca (alimenta a
// Letalidade - ver computeLetalidadeChance abaixo), melhoraveis ate ao
// nivel de melhoria 9 (indice 8 nos arrays) gastando moedas (custo, por
// PASSO: custo[N] = preco de subir de Lv(N) para Lv(N+1), custo[0] fica a
// 0 porque o Lv1 vem incluido de graca ao desbloquear a arma). Valores
// preenchidos pelo designer (armas_tabela.csv/conquistas_moedas.csv,
// 2026-08-04) - ver secção 7 da documentação.
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
  { unlockLevel: 90, ataque: [90, 92, 95, 96, 97, 99, 101, 103, 105], bonusForca: [9, 9, 10, 10, 11, 11, 12, 12, 13], custo: [0, 500, 900, 1400, 2000, 2700, 3500, 4400, 5400] },
];

const WEAPON_MAX_UPGRADE_LEVEL = 9;

function getWeaponTierIndexForLevel(level) {
  let index = 0;
  WEAPON_TIERS.forEach((candidate, i) => {
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
function getCurrentWeaponTierIndex() {
  if (typeof getLevelInfo !== "function" || typeof getLifetimeDistanceM !== "function") {
    return 0;
  }
  return getWeaponTierIndexForLevel(getLevelInfo(getLifetimeDistanceM()).level);
}

// Nivel de melhoria (1-9) de CADA arma ja desbloqueada, guardado por tier -
// nunca se perde ao subir de nivel e desbloquear a arma seguinte (secção 7
// da documentação, decisao explicita: cada arma guarda o seu progresso
// independentemente de estar a ser usada ou nao).
function getWeaponUpgradeLevelsMap() {
  const raw = localStorage.getItem(STORAGE_KEY_WEAPON_UPGRADE_LEVELS);
  try {
    const parsed = raw ? JSON.parse(raw) : {};
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed : {};
  } catch (e) {
    return {};
  }
}

function getWeaponUpgradeLevel(tierIndex) {
  return getWeaponUpgradeLevelsMap()[tierIndex] || 1;
}

function setWeaponUpgradeLevel(tierIndex, level) {
  const map = getWeaponUpgradeLevelsMap();
  map[tierIndex] = level;
  localStorage.setItem(STORAGE_KEY_WEAPON_UPGRADE_LEVELS, JSON.stringify(map));
  queueProgressSync();
}

// Custo em moedas para subir do nivel atual para o seguinte - undefined se
// ja estiver no maximo (Lv9).
function getWeaponUpgradeCost(tierIndex, currentLevel) {
  if (currentLevel >= WEAPON_MAX_UPGRADE_LEVEL) return undefined;
  return WEAPON_TIERS[tierIndex].custo[currentLevel];
}

function computePlayerAtaque(forcaLevel) {
  const tierIndex = getCurrentWeaponTierIndex();
  const upgradeLevel = getWeaponUpgradeLevel(tierIndex);
  const weaponAtaque = WEAPON_TIERS[tierIndex].ataque[upgradeLevel - 1];
  return Math.round(getPlayerBaseAtaque() + weaponAtaque + Math.pow(forcaLevel, getForcaExponent()));
}

function computePlayerDefesa(resistenciaLevel) {
  return Math.round(getPlayerBaseDefesa() + getEquipBasicoDefesa() + Math.pow(resistenciaLevel, getResistenciaExponent()));
}

// Destreza/Letalidade/Regeneracao (sem Foco - cada uma alimentada pelo
// nivel investido no status que a governa + o bonus fixo da peca de
// equipamento correspondente, ver cabecalho do ficheiro).
// Destreza/Letalidade: formulas "base + (nivel+bonus)^expoente", resultado
// em pontos percentuais - dividido por 100 para dar a fracao (0-1) usada
// nas rolagens de combate (js/battle.js).
function computeDestrezaChance(resistenciaLevel) {
  const total = resistenciaLevel + getEquipBonusDestreza();
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
  const total = energiaLevel + getEquipBonusRegeneracao();
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

function hideUpgradeButton() {
  btnUpgradeEquip.classList.add("hidden");
  selectedEquipType = null;
}

// --- Popup de evolucao da Arma (gasta moedas, secção 7 da documentação) --
// Substitui, so para a Arma, o fluxo de "clicar no equipamento -> botao
// pequeno" usado por Escudo/Armadura (selectEquipment/btnUpgradeEquip
// acima) - a Arma ja tem tiers e custo por nivel de melhoria, as outras
// pecas ainda nao (ficam com o fluxo antigo ate terem a sua propria tabela).
const weaponUpgradeModalEl = document.getElementById("weapon-upgrade-modal");
const weaponUpgradeTitleEl = document.getElementById("weapon-upgrade-title");
const weaponUpgradeCurrentAtaqueEl = document.getElementById("weapon-upgrade-current-ataque");
const weaponUpgradeCurrentForcaEl = document.getElementById("weapon-upgrade-current-forca");
const weaponUpgradeNextRowEl = document.getElementById("weapon-upgrade-next-row");
const weaponUpgradeNextAtaqueEl = document.getElementById("weapon-upgrade-next-ataque");
const weaponUpgradeNextForcaEl = document.getElementById("weapon-upgrade-next-forca");
const weaponUpgradeMaxedEl = document.getElementById("weapon-upgrade-maxed");
const weaponUpgradeCostRowEl = document.getElementById("weapon-upgrade-cost-row");
const weaponUpgradeCostEl = document.getElementById("weapon-upgrade-cost");
const weaponUpgradeCoinsEl = document.getElementById("weapon-upgrade-coins");
const btnWeaponUpgradeConfirm = document.getElementById("btn-weapon-upgrade-confirm");
const btnWeaponUpgradeClose = document.getElementById("btn-weapon-upgrade-close");

function renderWeaponUpgradeModal() {
  const tierIndex = getCurrentWeaponTierIndex();
  const tier = WEAPON_TIERS[tierIndex];
  const level = getWeaponUpgradeLevel(tierIndex);
  const coins = getMoedas();

  weaponUpgradeTitleEl.textContent = `Arma do nível ${tier.unlockLevel} — Melhoria Lv${level}/${WEAPON_MAX_UPGRADE_LEVEL}`;
  weaponUpgradeCurrentAtaqueEl.textContent = tier.ataque[level - 1];
  weaponUpgradeCurrentForcaEl.textContent = `+${tier.bonusForca[level - 1]}`;
  weaponUpgradeCoinsEl.textContent = coins;

  const cost = getWeaponUpgradeCost(tierIndex, level);
  const maxed = cost === undefined;

  weaponUpgradeNextRowEl.classList.toggle("hidden", maxed);
  weaponUpgradeMaxedEl.classList.toggle("hidden", !maxed);
  weaponUpgradeCostRowEl.classList.toggle("hidden", maxed);
  btnWeaponUpgradeConfirm.classList.toggle("hidden", maxed);

  if (!maxed) {
    weaponUpgradeNextAtaqueEl.textContent = `${tier.ataque[level]} (+${tier.ataque[level] - tier.ataque[level - 1]})`;
    weaponUpgradeNextForcaEl.textContent = `+${tier.bonusForca[level]} (+${tier.bonusForca[level] - tier.bonusForca[level - 1]})`;
    weaponUpgradeCostEl.textContent = cost;
    btnWeaponUpgradeConfirm.disabled = coins < cost;
    btnWeaponUpgradeConfirm.textContent = coins < cost ? "Moedas insuficientes" : `Evoluir arma (${cost} moedas)`;
  }
}

function openWeaponUpgradeModal() {
  renderWeaponUpgradeModal();
  weaponUpgradeModalEl.classList.remove("hidden");
}

function closeWeaponUpgradeModal() {
  weaponUpgradeModalEl.classList.add("hidden");
}

function upgradeCurrentWeapon() {
  const tierIndex = getCurrentWeaponTierIndex();
  const level = getWeaponUpgradeLevel(tierIndex);
  const cost = getWeaponUpgradeCost(tierIndex, level);
  if (cost === undefined) return; // ja no nivel maximo

  if (getMoedas() < cost) return; // moedas insuficientes

  // Sobe o nivel de melhoria ANTES de gastar as moedas: spendMoedas ja
  // chama renderStatsHud() internamente, e o HUD tem de refletir o Ataque/
  // Letalidade do nivel novo, nao do antigo (ordem trocada = HUD sempre um
  // passo atrasado, bug real apanhado ao testar).
  setWeaponUpgradeLevel(tierIndex, level + 1);
  spendMoedas(cost);

  renderWeaponUpgradeModal();
}

btnWeaponUpgradeConfirm.addEventListener("click", upgradeCurrentWeapon);
btnWeaponUpgradeClose.addEventListener("click", closeWeaponUpgradeModal);
weaponUpgradeModalEl.addEventListener("click", (event) => {
  if (event.target.id === "weapon-upgrade-modal") closeWeaponUpgradeModal();
});

// Chamado ao clicar/tocar num equipamento no personagem 3D (o raycast que
// identifica qual foi tocado esta em js/main.js) - corpo->Energia,
// espada->Forca, escudo->Resistencia.
function selectEquipment(type) {
  selectedEquipType = type;

  const points = getUnspentPoints();
  btnUpgradeEquip.textContent = points > 0 ? `Upgrade ${STAT_LABEL_BY_TYPE[type]}` : "Sem pontos";
  btnUpgradeEquip.disabled = points <= 0;
  btnUpgradeEquip.classList.remove("hidden");
}

// Gasta 1 ponto a subir o nivel de um status investido; partilhado pelo
// fluxo de clicar no personagem 3D e pelos botoes "+" do HUD
function upgradeEquipmentType(type) {
  if (getUnspentPoints() <= 0) return;

  const levelKey = INVESTABLE_STAT_STORAGE_KEY_BY_TYPE[type];
  localStorage.setItem(levelKey, String(getInvestableStatLevel(type) + 1));
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
