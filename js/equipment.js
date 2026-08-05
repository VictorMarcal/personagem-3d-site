// Sistema de status do jogador (2026-08-05, equipamento passa a ser
// continuo - ver secção 7 da documentação). 3 status "investidos" com
// pontos (Energia/Força/Resistência), cada um a alimentar diretamente o
// seu status principal MAIS um status secundário. As 3 pecas de
// equipamento (Arma/Escudo/Armadura) sao agora uma peca so por tipo, com
// um nivel de melhoria continuo de 1 a 99 (sem tiers, sem posse/drop),
// gasto em moedas - ver computeEquipPrimaryStat/computeEquipSecondaryStat/
// computeEquipUpgradeCost abaixo:
//   Vida       = PLAYER_BASE_VIDA   + armadura.vida(Lv)   + round(Energia^ENERGIA_EXP)
//   Ataque     = PLAYER_BASE_ATAQUE + arma.ataque(Lv)     + round(Força^FORCA_EXP)
//   Defesa     = PLAYER_BASE_DEFESA + escudo.defesa(Lv)   + round(Resistência^RESISTENCIA_EXP)
//   Regeneração = REGEN_BASE      + (Energia     + armadura.bonusEnergia(Lv))^REGEN_EXP       (bónus vem da Armadura)
//   Letalidade% = LETALIDADE_BASE + (Força       + arma.bonusForca(Lv))^LETALIDADE_EXP        (bónus vem da Arma)
//   Destreza%   = DESTREZA_BASE   + (Resistência + escudo.bonusResistencia(Lv))^DESTREZA_EXP  (bónus vem do Escudo)
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

// Nivel "efetivo" de um status investivel = pontos investidos + bonus
// secundario da peca de equipamento que o governa (2026-08-05, a pedido -
// antes o bonus so entrava na formula do status DERIVADO, Letalidade/
// Destreza/Regeneracao, sem nunca aparecer no numero mostrado ao
// jogador). Usado em todo o lado onde este status e mostrado OU serve de
// base a uma formula (HUD, Perfil, Debug, luta) - so upgradeEquipmentType
// (gastar um ponto) e o snapshot do progress-sync.js continuam a usar o
// valor investido em bruto (getInvestableStatLevel), que e o que
// realmente se incrementa/guarda.
const EQUIP_LEVEL_GETTER_BY_STAT_TYPE = {
  energia: () => getArmorLevel(),
  forca: () => getWeaponLevel(),
  resistencia: () => getShieldLevel(),
};

function getEffectiveInvestableStatLevel(type) {
  return getInvestableStatLevel(type) + computeEquipSecondaryStat(EQUIP_LEVEL_GETTER_BY_STAT_TYPE[type]());
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

// --- Equipamento continuo (2026-08-05) -----------------------------------
// Substitui por completo o antigo sistema de 10 tiers + posse/drop por
// peca: Arma/Escudo/Armadura sao agora uma peca so por tipo, com um unico
// "nivel de melhoria" continuo de 1 a 99 (sem tiers, sem inventario, sem
// RNG) - sobe-se gastando moedas ate ao maximo de 99, sem depender do
// nivel de personagem (a regra que capava a melhoria ao proprio nivel
// existiu por um dia so e foi removida a pedido).
//
// Formulas (nivel^expoente em vez de base^nivel, mesmo raciocinio de
// "Porquê expoente sobre o nível" ja usado nos status do jogador acima -
// base^nivel cresceria para valores astronomicos por volta do nivel 90,
// ver secção 7 da documentação):
//   primario   = base + round(nivel ^ EQUIP_PRIMARY_EXPONENT)
//   secundario = round(nivel ^ EQUIP_SECONDARY_EXPONENT)
//   custo(nivel) = round(EQUIP_COST_BASE * nivel ^ EQUIP_COST_EXPONENT)   (custo do PASSO nivel-1 -> nivel; nivel 1 e sempre gratis)
const EQUIP_MAX_LEVEL = 99;
const EQUIP_PRIMARY_EXPONENT = 1.2;
const EQUIP_SECONDARY_EXPONENT = 0.5;
const EQUIP_COST_BASE = 10;
const EQUIP_COST_EXPONENT = 1.5;

const WEAPON_BASE_ATAQUE = 5;
const SHIELD_BASE_DEFESA = 2;
const ARMOR_BASE_VIDA = 3;

function computeEquipPrimaryStat(base, level) {
  return base + Math.round(Math.pow(level, EQUIP_PRIMARY_EXPONENT));
}

function computeEquipSecondaryStat(level) {
  return Math.round(Math.pow(level, EQUIP_SECONDARY_EXPONENT));
}

// Custo em moedas do PASSO para chegar a "level" (vindo de level-1) -
// undefined se o nivel pedido nao fizer sentido (0/1, ou acima do maximo).
function computeEquipUpgradeCost(level) {
  if (level <= 1 || level > EQUIP_MAX_LEVEL) return undefined;
  return Math.round(EQUIP_COST_BASE * Math.pow(level, EQUIP_COST_EXPONENT));
}

function getEquipLevel(storageKey) {
  return getStoredNumber(storageKey, 1);
}

function setEquipLevel(storageKey, level) {
  localStorage.setItem(storageKey, String(level));
  queueProgressSync();
}

// --- Arma -----------------------------------------------------------------
function getWeaponLevel() { return getEquipLevel(STORAGE_KEY_WEAPON_LEVEL); }

// --- Escudo -----------------------------------------------------------------
function getShieldLevel() { return getEquipLevel(STORAGE_KEY_SHIELD_LEVEL); }

// --- Armadura -----------------------------------------------------------------
function getArmorLevel() { return getEquipLevel(STORAGE_KEY_ARMOR_LEVEL); }

// Aviso nao-bloqueante generico (moedas, subida de nivel, medalha mensal -
// variant escolhe a cor via CSS .game-toast-<variant>) - mesmo espirito do
// numero flutuante de combate (js/main.js showFloatingCombatText), mas
// fixo no ecra (o treino/luta nao tem uma posicao 3D fixa relevante para
// isto) e com texto em vez de um numero.
function showGameToast(message, variant) {
  const el = document.createElement("div");
  el.className = `game-toast game-toast-${variant}`;
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

function computePlayerVida(energiaLevel) {
  const armorVida = computeEquipPrimaryStat(ARMOR_BASE_VIDA, getArmorLevel());
  return Math.round(getPlayerBaseVida() + armorVida + Math.pow(energiaLevel, getEnergiaExponent()));
}

function computePlayerAtaque(forcaLevel) {
  const weaponAtaque = computeEquipPrimaryStat(WEAPON_BASE_ATAQUE, getWeaponLevel());
  return Math.round(getPlayerBaseAtaque() + weaponAtaque + Math.pow(forcaLevel, getForcaExponent()));
}

function computePlayerDefesa(resistenciaLevel) {
  const shieldDefesa = computeEquipPrimaryStat(SHIELD_BASE_DEFESA, getShieldLevel());
  return Math.round(getPlayerBaseDefesa() + shieldDefesa + Math.pow(resistenciaLevel, getResistenciaExponent()));
}

// Destreza/Letalidade/Regeneracao (sem Foco - cada uma alimentada pelo
// nivel EFETIVO do status que a governa, ja com o bonus secundario da
// peca de equipamento correspondente incluido - ver
// getEffectiveInvestableStatLevel acima, quem chama e que passa o valor
// certo). Destreza/Letalidade: formula "base + nivel^expoente", resultado
// em pontos percentuais - dividido por 100 para dar a fracao (0-1) usada
// nas rolagens de combate (js/battle.js).
function computeDestrezaChance(resistenciaLevel) {
  return (getDestrezaBase() + Math.pow(resistenciaLevel, getDestrezaExponent())) / 100;
}

function computeLetalidadeChance(forcaLevel) {
  return (getLetalidadeBase() + Math.pow(forcaLevel, getLetalidadeExponent())) / 100;
}

// Regeneracao: mesma forma, mas o resultado fica em pontos de vida por
// segundo (nao percentagem) - usada por getCurrentHp abaixo.
function computeRegeneracaoPerSecond(energiaLevel) {
  return getRegeneracaoBase() + Math.pow(energiaLevel, getRegeneracaoExponent());
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

  showGameToast(`Subiste para o nível ${currentLevel}!`, "nivel");
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
  const recovered = Number(stored) + computeRegeneracaoPerSecond(getEffectiveInvestableStatLevel("energia")) * elapsedSeconds;
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
  const energiaLevel = getEffectiveInvestableStatLevel("energia");
  const forcaLevel = getEffectiveInvestableStatLevel("forca");
  const resistenciaLevel = getEffectiveInvestableStatLevel("resistencia");

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
        showFloatingCombatText(head, computeRegeneracaoPerSecond(getEffectiveInvestableStatLevel("energia")));
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
// prefixo dos ids DOM, na base do status primario e no nome mostrado.
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
    const level = config.getLevel();
    const primary = computeEquipPrimaryStat(config.base, level);
    const secondary = computeEquipSecondaryStat(level);
    const coins = getMoedas();

    titleEl.textContent = `${config.pieceName} — Nível ${level}/${EQUIP_MAX_LEVEL}`;
    currentPrimaryEl.textContent = primary;
    currentSecondaryEl.textContent = `+${secondary}`;
    coinsEl.textContent = coins;

    const atMax = level >= EQUIP_MAX_LEVEL;
    const nextLevel = level + 1;
    const canShowNext = !atMax;

    nextRowEl.classList.toggle("hidden", !canShowNext);
    maxedEl.classList.toggle("hidden", !atMax);
    costRowEl.classList.toggle("hidden", !canShowNext);
    confirmBtn.classList.toggle("hidden", !canShowNext);

    if (canShowNext) {
      const nextPrimary = computeEquipPrimaryStat(config.base, nextLevel);
      const nextSecondary = computeEquipSecondaryStat(nextLevel);
      const cost = computeEquipUpgradeCost(nextLevel);
      nextPrimaryEl.textContent = `${nextPrimary} (+${nextPrimary - primary})`;
      nextSecondaryEl.textContent = `+${nextSecondary} (+${nextSecondary - secondary})`;
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
    const level = config.getLevel();
    const nextLevel = level + 1;
    if (nextLevel > EQUIP_MAX_LEVEL) return;

    const cost = computeEquipUpgradeCost(nextLevel);
    if (getMoedas() < cost) return; // moedas insuficientes

    // Sobe o nivel ANTES de gastar as moedas: spendMoedas ja chama
    // renderStatsHud() internamente, e o HUD tem de refletir o status
    // novo, nao o antigo (ordem trocada = HUD sempre um passo atrasado,
    // bug real apanhado ao testar a Arma no sistema anterior de tiers).
    config.setLevel(nextLevel);
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
  base: WEAPON_BASE_ATAQUE,
  getLevel: getWeaponLevel,
  setLevel: (level) => setEquipLevel(STORAGE_KEY_WEAPON_LEVEL, level),
  primaryIdSuffix: "ataque",
  secondaryIdSuffix: "forca",
  pieceName: "Arma",
  pieceNameLower: "arma",
});

const shieldUpgradeController = createEquipmentUpgradeController({
  idPrefix: "shield",
  base: SHIELD_BASE_DEFESA,
  getLevel: getShieldLevel,
  setLevel: (level) => setEquipLevel(STORAGE_KEY_SHIELD_LEVEL, level),
  primaryIdSuffix: "defesa",
  secondaryIdSuffix: "resistencia",
  pieceName: "Escudo",
  pieceNameLower: "escudo",
});

const armorUpgradeController = createEquipmentUpgradeController({
  idPrefix: "armor",
  base: ARMOR_BASE_VIDA,
  getLevel: getArmorLevel,
  setLevel: (level) => setEquipLevel(STORAGE_KEY_ARMOR_LEVEL, level),
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
