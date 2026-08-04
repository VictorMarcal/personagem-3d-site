// Sistema de status do jogador (2026-08-04, revisto para remover Foco -
// ver secção 6/7 da documentação). 3 status "investidos" com pontos
// (Energia/Força/Resistência), cada um a alimentar diretamente o seu
// status principal MAIS um status secundário, mais um bónus fixo do
// equipamento "básico" atual (ainda sem sistema de moedas para o
// melhorar/trocar - ver getEquipBasico*/getEquipBonus* em js/debug.js):
//   Vida       = PLAYER_BASE_VIDA   + equipBasicoVida   + round(Energia^ENERGIA_EXP)
//   Ataque     = PLAYER_BASE_ATAQUE + equipBasicoAtaque + round(Força^FORCA_EXP)
//   Defesa     = PLAYER_BASE_DEFESA + equipBasicoDefesa + round(Resistência^RESISTENCIA_EXP)
//   Regeneração = REGEN_BASE      + (Energia     + equipBonusRegeneracao)^REGEN_EXP       (vida/segundo, bónus vem da Armadura)
//   Letalidade% = LETALIDADE_BASE + (Força       + equipBonusLetalidade)^LETALIDADE_EXP   (bónus vem da Arma)
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

function computePlayerAtaque(forcaLevel) {
  return Math.round(getPlayerBaseAtaque() + getEquipBasicoAtaque() + Math.pow(forcaLevel, getForcaExponent()));
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
  const total = forcaLevel + getEquipBonusLetalidade();
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
