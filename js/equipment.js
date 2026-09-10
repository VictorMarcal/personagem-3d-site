// Sistema de status do jogador (2026-08-05, equipamento passa a ser
// continuo - ver secção 7 da documentação). 3 status "investidos" com
// pontos (Energia/Força/Resistência), cada um a alimentar diretamente o
// seu status principal MAIS um status secundário. As 3 pecas de
// equipamento (Arma/Escudo/Armadura) sao agora uma peca so por tipo, com
// um nivel de melhoria continuo de 1 a 99 (sem tiers, sem posse/drop),
// pago com materiais do mapa (secção 21) - ver computeEquipPrimaryStat/
// computeEquipSecondaryStat/computeEquipUpgradeCost abaixo:
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
const hudLevelEnergiaEl = document.getElementById("hud-level-energia");
const hudLevelForcaEl = document.getElementById("hud-level-forca");
const hudLevelResistenciaEl = document.getElementById("hud-level-resistencia");
const hudWeaponLevelEl = document.getElementById("hud-weapon-level");
const hudShieldLevelEl = document.getElementById("hud-shield-level");
const hudArmorLevelEl = document.getElementById("hud-armor-level");

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

// Peso corporal do jogador (kg), editavel no Perfil - pre-requisito da
// formula de calorias/MET (secção 17 da documentação). Omissão de 70kg
// para quem ainda não preencheu, mesmo padrão de STARTING_UNSPENT_POINTS
// acima (só conta para quem nunca teve esta chave guardada).
const DEFAULT_WEIGHT_KG = 70;

function getPesoKg() {
  return getStoredNumber(STORAGE_KEY_WEIGHT_KG, DEFAULT_WEIGHT_KG);
}

function setPesoKg(kg) {
  localStorage.setItem(STORAGE_KEY_WEIGHT_KG, String(kg));
  queueProgressSync();
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
// RNG) - sobe-se com materiais do mapa (secção 21) ate ao maximo de 99,
// sem depender do nivel de personagem (a regra que capava a melhoria ao
// proprio nivel existiu por um dia so e foi removida a pedido).
//
// Formulas (nivel^expoente em vez de base^nivel, mesmo raciocinio de
// "Porquê expoente sobre o nível" ja usado nos status do jogador acima -
// base^nivel cresceria para valores astronomicos por volta do nivel 90,
// ver secção 7 da documentação):
//   primario   = base + round(nivel ^ expoentePrimarioDaPeca)
//   secundario = round(min(1,(nivel-1)/(EQUIP_SECONDARY_RAMP_LEVELS-1)) ^ EQUIP_SECONDARY_EXPONENT * EQUIP_SECONDARY_MAX)
//
// NIVEL MAXIMO = 100 para as 3 pecas (2026-09-11, a pedido - "nivel maximo
// de todos os equipamentos e 100"). Cada peca ganha um modelo 3D novo a
// cada 5 niveis (refreshWeaponModel etc. em js/main.js). O bonus SECUNDARIO
// satura aos 20 niveis (EQUIP_SECONDARY_RAMP_LEVELS) - a partir dai um nivel
// novo so sobe o primario e o visual, e nao ha regressao para quem ja maxou
// aos 20 antes desta mudanca.
const EQUIP_MAX_LEVEL = 100;
const EQUIP_SECONDARY_RAMP_LEVELS = 20;
const EQUIP_SECONDARY_EXPONENT = 0.5;
const EQUIP_SECONDARY_MAX = 20;

// --- Custo de melhoria em MATERIAIS do mapa (secção 21) --------------------
//
// Cada peca tem uma curva por recurso com janela de niveis, mesmo molde da
// Fortaleza (secção 21): `base * fator ^ (nivel_de_origem - entrada)`. A
// necessidade de cada recurso sobe sempre dentro da sua janela e o total
// nunca desce. Arco e Escudo desenhados a pedido (2026-09-11); ARMADURA
// ainda com curva provisoria.
//   Arco:   madeira (corpo - sempre, e sempre a maior) + pele (corda, ate Nv 30) + ferro (pontas, do Nv 30)
//   Escudo: madeira (armacao) + pele (cobertura, ate Nv 30) + ferro (couraca/umbo, do Nv 30 - passa a madeira ~Nv 48, "escudo de ferro com nucleo de madeira")
//   Armadura: pele (base - sempre, a maior) + ferro (placas/rebites - sempre)
const EQUIP_COST_CURVES = {
  arma: [
    { recurso: "madeira", de: 1,  ate: 99, base: 35,  fator: 1.06 },
    { recurso: "pele",    de: 1,  ate: 29, base: 22,  fator: 1.06 },
    { recurso: "ferro",   de: 30, ate: 99, base: 110, fator: 1.065 },
  ],
  escudo: [
    { recurso: "madeira", de: 1,  ate: 99, base: 30,  fator: 1.06 },
    { recurso: "pele",    de: 1,  ate: 29, base: 25,  fator: 1.06 },
    { recurso: "ferro",   de: 30, ate: 99, base: 150, fator: 1.065 },
  ],
  armadura: [
    { recurso: "pele",  de: 1, ate: 99, base: 30, fator: 1.06 },
    { recurso: "ferro", de: 1, ate: 99, base: 20, fator: 1.062 },
  ],
};

// Materiais que uma peca pode chegar a pedir, pela ordem em que aparecem na
// curva (para mostrar o stock no nivel maximo, quando ja nao ha custo).
function equipMateriaisDaPeca(pieceKey) {
  const seen = [];
  (EQUIP_COST_CURVES[pieceKey] || []).forEach((c) => { if (!seen.includes(c.recurso)) seen.push(c.recurso); });
  return seen;
}

const WEAPON_BASE_ATAQUE = 5;
const SHIELD_BASE_DEFESA = 2;
const ARMOR_BASE_VIDA = 3;

// Cada peca tem o seu proprio expoente primario (2026-08-05, a pedido) -
// a Arma cresce mais depressa que o Escudo, que cresce mais depressa que
// a Armadura (nenhuma partilha um valor "generico" entre si).
const WEAPON_PRIMARY_EXPONENT = 1.45;
const SHIELD_PRIMARY_EXPONENT = 1.35;
const ARMOR_PRIMARY_EXPONENT = 1.05;

function computeEquipPrimaryStat(base, level, exponent) {
  return base + Math.round(Math.pow(level, exponent));
}

// Bonus secundario (2026-08-05, a pedido): vai de 0 no nivel 1 a
// EQUIP_SECONDARY_MAX (20) no nivel maximo - normaliza o nivel para 0-1
// antes de aplicar o expoente, em vez de aplicar o expoente diretamente
// ao nivel (que nunca chegaria exatamente a 0 no Lv1 nem a um alvo fixo
// no Lv maximo).
function computeEquipSecondaryStat(level) {
  const progress = Math.min(1, Math.max(0, (level - 1) / (EQUIP_SECONDARY_RAMP_LEVELS - 1)));
  return Math.round(Math.pow(progress, EQUIP_SECONDARY_EXPONENT) * EQUIP_SECONDARY_MAX);
}

// Custo do PASSO para chegar a "level" (vindo de level-1) - undefined se o
// nivel pedido nao fizer sentido. Devolve { recurso: n, ... } e nao um
// numero solto, para quem chama nunca poder esquecer-se de que material se
// trata. Cada peca usa a sua curva em EQUIP_COST_CURVES (janela por recurso).
function computeEquipUpgradeCost(level, pieceKey) {
  if (level <= 1 || level > EQUIP_MAX_LEVEL) return undefined;
  const de = level - 1; // custo do PASSO `de` -> `de + 1`, indexado pelo nivel de ORIGEM
  const custo = {};
  (EQUIP_COST_CURVES[pieceKey] || []).forEach((c) => {
    if (de < c.de || de > c.ate) return;
    custo[c.recurso] = (custo[c.recurso] || 0) + Math.round(c.base * Math.pow(c.fator, de - c.de));
  });
  return Object.keys(custo).length ? custo : undefined;
}

// "120 madeira + 120 ferro"
function formatCustoMateriais(custo) {
  return Object.keys(custo)
    .map((id) => formatRecurso(custo[id]) + " " + RESOURCE_BY_ID[id].nome.toLowerCase())
    .join(" + ");
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

// Aviso nao-bloqueante generico (subida de nivel, conquista, medalha mensal -
// variant escolhe a cor via CSS .game-toast-<variant>) - mesmo espirito do
// numero flutuante de combate (js/main.js showFloatingCombatText), mas
// fixo no ecra (o treino/luta nao tem uma posicao 3D fixa relevante para
// isto) e com texto em vez de um numero.
let gameToastContainerEl = null;

// Criado so quando o primeiro toast aparece (nao existe nenhum no HTML) -
// todos os avisos partilham este container fixo, para se empilharem em vez
// de ficarem todos sobrepostos exatamente na mesma posicao (ver
// #game-toast-container em css/style.css).
function getGameToastContainer() {
  if (!gameToastContainerEl) {
    gameToastContainerEl = document.createElement("div");
    gameToastContainerEl.id = "game-toast-container";
    document.body.appendChild(gameToastContainerEl);
  }
  return gameToastContainerEl;
}

function showGameToast(message, variant) {
  const el = document.createElement("div");
  el.className = `game-toast game-toast-${variant}`;
  el.textContent = message;
  getGameToastContainer().appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

function computePlayerVida(energiaLevel) {
  const armorVida = computeEquipPrimaryStat(ARMOR_BASE_VIDA, getArmorLevel(), ARMOR_PRIMARY_EXPONENT);
  return Math.round(getPlayerBaseVida() + armorVida + Math.pow(energiaLevel, getEnergiaExponent()));
}

function computePlayerAtaque(forcaLevel) {
  const weaponAtaque = computeEquipPrimaryStat(WEAPON_BASE_ATAQUE, getWeaponLevel(), WEAPON_PRIMARY_EXPONENT);
  return Math.round(getPlayerBaseAtaque() + weaponAtaque + Math.pow(forcaLevel, getForcaExponent()));
}

function computePlayerDefesa(resistenciaLevel) {
  const shieldDefesa = computeEquipPrimaryStat(SHIELD_BASE_DEFESA, getShieldLevel(), SHIELD_PRIMARY_EXPONENT);
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

  hudLevelEnergiaEl.textContent = energiaLevel;
  hudLevelForcaEl.textContent = forcaLevel;
  hudLevelResistenciaEl.textContent = resistenciaLevel;

  hudWeaponLevelEl.textContent = getWeaponLevel();
  hudShieldLevelEl.textContent = getShieldLevel();
  hudArmorLevelEl.textContent = getArmorLevel();

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

// --- Popups de evolucao de Arma/Escudo/Armadura (custo em materiais do
// mapa, secção 21) --------------------------------------------------------
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
  const stockEl = document.getElementById(`${idPrefix}-upgrade-stock`);
  const confirmBtn = document.getElementById(`btn-${idPrefix}-upgrade-confirm`);
  const closeBtn = document.getElementById(`btn-${idPrefix}-upgrade-close`);

  function render() {
    const level = config.getLevel();
    const maxLevel = EQUIP_MAX_LEVEL;
    const primary = computeEquipPrimaryStat(config.base, level, config.primaryExponent);
    const secondary = computeEquipSecondaryStat(level);
    const stock = acumularProducao();

    const atMax = level >= maxLevel;
    const nextLevel = level + 1;
    const canShowNext = !atMax;
    const cost = canShowNext ? computeEquipUpgradeCost(nextLevel, config.pieceKey) : null;

    titleEl.textContent = `${config.pieceName} — Nível ${level}/${maxLevel}`;
    currentPrimaryEl.textContent = primary;
    currentSecondaryEl.textContent = `+${secondary}`;
    // Stock dos materiais QUE ESTE UPGRADE PEDE (o arco troca de materiais ao
    // longo dos niveis) - e o que o jogador precisa de comparar com o custo.
    // No nivel maximo cai para os materiais fixos da peca.
    stockEl.textContent = (cost ? Object.keys(cost) : equipMateriaisDaPeca(config.pieceKey))
      .map((id) => formatRecurso(stock[id]) + " " + RESOURCE_BY_ID[id].nome.toLowerCase())
      .join(" · ");

    nextRowEl.classList.toggle("hidden", !canShowNext);
    maxedEl.classList.toggle("hidden", !atMax);
    costRowEl.classList.toggle("hidden", !canShowNext);
    confirmBtn.classList.toggle("hidden", !canShowNext);

    if (canShowNext) {
      const nextPrimary = computeEquipPrimaryStat(config.base, nextLevel, config.primaryExponent);
      const nextSecondary = computeEquipSecondaryStat(nextLevel);
      nextPrimaryEl.textContent = nextPrimary + " (+" + (nextPrimary - primary) + ")";
      nextSecondaryEl.textContent = "+" + nextSecondary + " (+" + (nextSecondary - secondary) + ")";

      // O armazem e o que destranca a evolucao: um upgrade que custe mais do
      // que o tecto NUNCA sera pagavel, e dizer "materiais insuficientes"
      // seria enganador - o jogador ia treinar mais e continuar bloqueado.
      const tecto = warehouseCap(getWarehouseLevel());
      const acimaDoTecto = Object.keys(cost).some((id) => cost[id] > tecto);
      const temMateriais = podePagar(cost);

      // O botao diz sempre "Melhorar": o ESTADO dele e que diz se da.
      // Laranja = ha materiais, cinza desativado = nao ha. A razao vive na
      // linha do custo, por baixo — nao dentro do botao.
      confirmBtn.disabled = !temMateriais;
      confirmBtn.setAttribute("aria-disabled", String(!temMateriais));
      confirmBtn.textContent = "Melhorar";
      costEl.textContent = formatCustoMateriais(cost) +
        (acimaDoTecto ? " — precisas de uma Fortaleza maior" : "");
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

    const cost = computeEquipUpgradeCost(nextLevel, config.pieceKey);
    // pagar() valida e debita numa so operacao - sem isto havia uma janela
    // entre verificar e gastar.
    if (!pagar(cost)) return;

    config.setLevel(nextLevel);
    if (typeof renderStatsHud === "function") renderStatsHud();
    if (typeof renderResourcesPanel === "function") renderResourcesPanel();
    // O arco troca de modelo 3D a cada 5 niveis (js/main.js - so troca de
    // facto quando o indice muda).
    if (config.pieceKey === "arma" && typeof refreshWeaponModel === "function") refreshWeaponModel();

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
  primaryExponent: WEAPON_PRIMARY_EXPONENT,
  getLevel: getWeaponLevel,
  setLevel: (level) => setEquipLevel(STORAGE_KEY_WEAPON_LEVEL, level),
  primaryIdSuffix: "ataque",
  secondaryIdSuffix: "forca",
  pieceKey: "arma",
  pieceName: "Arco",
  pieceNameLower: "arco",
});

const shieldUpgradeController = createEquipmentUpgradeController({
  idPrefix: "shield",
  base: SHIELD_BASE_DEFESA,
  primaryExponent: SHIELD_PRIMARY_EXPONENT,
  getLevel: getShieldLevel,
  setLevel: (level) => setEquipLevel(STORAGE_KEY_SHIELD_LEVEL, level),
  primaryIdSuffix: "defesa",
  secondaryIdSuffix: "resistencia",
  pieceKey: "escudo",
  pieceName: "Escudo",
  pieceNameLower: "escudo",
});

const armorUpgradeController = createEquipmentUpgradeController({
  idPrefix: "armor",
  base: ARMOR_BASE_VIDA,
  primaryExponent: ARMOR_PRIMARY_EXPONENT,
  getLevel: getArmorLevel,
  setLevel: (level) => setEquipLevel(STORAGE_KEY_ARMOR_LEVEL, level),
  primaryIdSuffix: "vida",
  secondaryIdSuffix: "energia",
  pieceKey: "armadura",
  pieceName: "Armadura",
  pieceNameLower: "armadura",
});

function openWeaponUpgradeModal() { weaponUpgradeController.open(); }
function openShieldUpgradeModal() { shieldUpgradeController.open(); }
function openArmorUpgradeModal() { armorUpgradeController.open(); }

// Mini-lista de equipamento pendurada no palco 3D (2026-08-06, a pedido) -
// abre o mesmo popup que tocar na peca certa no modelo, sem depender de
// acertar nela (dificil em mobile, com a camera afastada).
document.getElementById("equipment-mini-weapon").addEventListener("click", openWeaponUpgradeModal);
document.getElementById("equipment-mini-shield").addEventListener("click", openShieldUpgradeModal);
document.getElementById("equipment-mini-armor").addEventListener("click", openArmorUpgradeModal);

// Gasta 1 ponto a subir o nivel de um status investido - so pelos botoes
// "+" do HUD agora (as 3 pecas de equipamento no modelo 3D abrem os
// popups de evolucao por materiais acima, ja nao investem pontos por
// clique direto).
function upgradeEquipmentType(type) {
  if (getUnspentPoints() <= 0) return;

  const levelKey = INVESTABLE_STAT_STORAGE_KEY_BY_TYPE[type];
  localStorage.setItem(levelKey, String(getInvestableStatLevel(type) + 1));
  localStorage.setItem(STORAGE_KEYS_EQUIPMENT.pontosDisponiveis, String(getUnspentPoints() - 1));
  queueProgressSync();

  renderStatsHud();
}

Object.entries(btnHudUpgradeByType).forEach(([type, btn]) => {
  btn.addEventListener("click", () => upgradeEquipmentType(type));
});

renderStatsHud();
