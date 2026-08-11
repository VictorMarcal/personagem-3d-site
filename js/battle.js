// Batalha por turnos: o jogador ataca sempre primeiro. Dano = max(piso
// minimo, ataque - percentagem*defesa), garantindo que nunca ha dano
// zero/negativo (evita ciclos infinitos). Ambas as percentagens sao
// ajustaveis no card de Debug.
const battleHudEl = document.getElementById("battle-hud");
const battlePlayerHpFillEl = document.getElementById("battle-player-hp-fill");
const battlePlayerHpTextEl = document.getElementById("battle-player-hp-text");
const battleMonsterHpFillEl = document.getElementById("battle-monster-hp-fill");
const battleMonsterHpTextEl = document.getElementById("battle-monster-hp-text");
const battleMonsterNameEl = document.getElementById("battle-monster-name");

const battlePanelEl = document.getElementById("battle-panel");
const battleLogHeadlineEl = document.getElementById("battle-log-headline");
const battleLogHistoryEl = document.getElementById("battle-log-history");
const battleResultEl = document.getElementById("battle-result");
const battleStatDestrezaEl = document.getElementById("battle-stat-destreza");
const battleStatLetalidadeEl = document.getElementById("battle-stat-letalidade");
const btnBattleBack = document.getElementById("btn-battle-back");
const battleJoystickEl = document.getElementById("battle-joystick");

// Ultima mensagem em destaque (maior, cor conforme o tipo de evento -
// "critico"/"miss"/"normal"), as anteriores empilhadas por baixo como
// historico curto e discreto (2026-08-06, tema "Campo Aberto" - antes so
// existia uma linha, sempre substituida). Reiniciado a cada luta nova em
// startBattle, para o historico da luta anterior nunca vazar para a
// seguinte.
const BATTLE_LOG_HISTORY_MAX = 3;
let battleLogHistory = [];

function setBattleLog(text, variant = "normal") {
  if (battleLogHeadlineEl.textContent) {
    battleLogHistory.unshift(battleLogHeadlineEl.textContent);
    battleLogHistory = battleLogHistory.slice(0, BATTLE_LOG_HISTORY_MAX);
  }
  battleLogHeadlineEl.textContent = text;
  battleLogHeadlineEl.className = `battle-log-headline ${variant}`;
  battleLogHistoryEl.innerHTML = "";
  battleLogHistory.forEach((line) => {
    const p = document.createElement("p");
    p.textContent = line;
    battleLogHistoryEl.appendChild(p);
  });
}

const viewerEl = document.getElementById("viewer");
const characterHudEl = document.getElementById("character-hud");

const BATTLE_ROUND_DELAY_MS = 800;
const BATTLE_MAX_ROUNDS = 500; // rede de seguranca, na pratica nunca deve chegar la

let battleInProgress = false;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Fechar/recarregar a aba a meio de uma luta nao gravava nada (vida/moedas/
// pontos so sao persistidos no FIM do combate, ver startBattle abaixo) -
// funcionava como um "abortar gratis", sem qualquer penalizacao, incluindo
// como forma de fugir a uma derrota certa. O aviso nativo do browser (texto
// generico, nao customizavel por nenhum browser moderno - por isso
// event.returnValue fica so a "") obriga a uma confirmacao extra antes de
// sair, reduzindo saidas acidentais e desincentivando o uso deliberado.
window.addEventListener("beforeunload", (event) => {
  if (!battleInProgress) return;
  event.preventDefault();
  event.returnValue = "";
});

// Variacao aleatoria aplicada ao valor final (depois do piso minimo) - se
// fosse antes do piso, builds com defesa forte (dano bruto sempre abaixo
// do piso) acabavam sempre com o mesmo numero exato, sem variacao nenhuma
// visivel. Aplicada depois, ha sempre alguma variacao, venha o dano base
// do calculo bruto ou do piso. DAMAGE_VARIANCE_MIN=0.8 significa que o
// dano final roda entre 80% e 100% do valor base (ex: base 20 -> 16-20).
function computeBattleDamage(attackerAtaque, defenderDefesa) {
  const raw = attackerAtaque - getBattleDefensePercent() * defenderDefesa;
  const floor = getBattleFloorPercent() * attackerAtaque;
  const baseDamage = Math.max(floor, raw);
  const varianceMin = getDamageVarianceMin();
  const variance = varianceMin + Math.random() * (1 - varianceMin);
  return Math.round(baseDamage * variance);
}

// Destreza/Letalidade (secção 6/7 e 9 da documentação) - so o JOGADOR as
// tem por agora, os monstros nao foram atualizados (fora de escopo).
// rollDodge: chance do DEFENSOR esquivar por completo um ataque, testada
// antes de computeBattleDamage - uma esquiva nunca chega a chamar a
// formula de dano, fica sempre em 0. Se nao esquivar, verifica-se depois
// se e um critico (chance de Letalidade do atacante): nesse caso o dano
// ignora a Defesa por completo e nao tem variacao aleatoria - e sempre
// exatamente Ataque x LETALIDADE_MULTIPLICADOR.
function rollDodge(dodgeChance) {
  return Math.random() < dodgeChance;
}

function rollCritico(letalidadeChance) {
  return Math.random() < letalidadeChance;
}

// Moedas por derrotar mini-boss/boss (secção 7 da documentação): intervalo
// aleatorio que sobe linearmente com o nivel da criatura, +5 por mini-boss
// (10 em 10 niveis) e +50 por boss (tambem 10 em 10) - formula direta a
// partir do nivel, sem precisar de um indice separado. Pago em TODA vitoria
// (nao so a primeira - diferente do bonus de pontos por estrelas acima,
// que so paga a diferenca; isto e "loot", conta sempre).
function getMonsterCoinRange(creature) {
  if (creature.isBoss) {
    const tierIndex = (creature.level - 10) / 10;
    return { min: 100 + tierIndex * 50, max: 150 + tierIndex * 50 };
  }
  if (creature.isMiniBoss) {
    const tierIndex = (creature.level - 5) / 10;
    return { min: 5 + tierIndex * 5, max: 15 + tierIndex * 5 };
  }
  return null;
}

function awardMonsterCoins(creature) {
  const range = getMonsterCoinRange(creature);
  if (!range) return;
  const amount = Math.floor(Math.random() * (range.max - range.min + 1)) + range.min;
  addMoedas(amount);
  showGameToast(`+${amount} moedas`, "moedas");
}

function updateBattleBars(playerHp, playerMaxHp, monsterHp, monsterMaxHp) {
  const playerPct = Math.max(0, Math.min(100, (playerHp / playerMaxHp) * 100));
  const monsterPct = Math.max(0, Math.min(100, (monsterHp / monsterMaxHp) * 100));

  battlePlayerHpFillEl.style.width = `${playerPct}%`;
  battlePlayerHpTextEl.textContent = `${Math.max(0, Math.round(playerHp))} / ${playerMaxHp}`;

  battleMonsterHpFillEl.style.width = `${monsterPct}%`;
  battleMonsterHpTextEl.textContent = `${Math.max(0, Math.round(monsterHp))} / ${monsterMaxHp}`;
}

// Estado da luta em curso, lido/escrito por performHeroAttack abaixo -
// precisa de viver fora de startBattle (ao contrario do ciclo antigo) para
// poder ser atualizado a partir do loop de frames de js/main.js
// (updateHeroAutoAttack), disparado de fora da função startBattle.
let currentCreature = null;
let currentPlayerAtaque = 0;
let currentPlayerLetalidade = 0;
let currentMonsterDefesa = 0;
let currentPlayerHp = 0;
let currentPlayerMaxHp = 0;
let currentMonsterHp = 0;
let currentMonsterMaxHp = 0;
let heroAttackInFlight = false;

// Disparo automatico do heroi (2026-08-11, a pedido - "heroi ataca apenas
// quando esta parado"): chamada por js/main.js updateHeroAutoAttack so
// quando o joystick esta parado, o monstro esta no frustrum da camara, e a
// cadencia (HERO_ATTACK_INTERVAL_MS, js/main.js) o permite - esta função
// so trata do dano/animação/log, nunca decide QUANDO disparar.
//
// Sem esquiva do lado do monstro (rollDodge nao chamado) - os monstros
// continuam sem Destreza propria (fora de escopo, secção 9), e sem
// contra-ataque nenhum (modos de comportamento/ataque do monstro ainda
// por definir). Ao chegar a 0 de Vida, o monstro so para de poder ser
// atacado (guarda no topo) - ainda NAO ha vitoria/recompensas/persistencia
// (markCreatureDefeated/awardMonsterCoins/checkAndUnlockAchievements),
// fica para quando o combate for definido por completo.
async function performHeroAttack() {
  if (heroAttackInFlight || !currentCreature || currentMonsterHp <= 0) return;
  heroAttackInFlight = true;

  await shootArrow(bow, monsterBody);

  if (rollCritico(currentPlayerLetalidade)) {
    const critDmg = Math.round(currentPlayerAtaque * getLetalidadeMultiplicador());
    currentMonsterHp = Math.max(0, currentMonsterHp - critDmg);
    showFloatingCombatText(monsterHead, -critDmg, "critico");
    setBattleLog(`Crítico! Flecha certeira em ${currentCreature.name}: -${critDmg} Vida`, "critico");
  } else {
    const dmgToMonster = computeBattleDamage(currentPlayerAtaque, currentMonsterDefesa);
    currentMonsterHp = Math.max(0, currentMonsterHp - dmgToMonster);
    showFloatingCombatText(monsterHead, -dmgToMonster, "damage");
    setBattleLog(`Acertaste uma flecha em ${currentCreature.name}: -${dmgToMonster} Vida`);
  }

  updateBattleBars(currentPlayerHp, currentPlayerMaxHp, currentMonsterHp, currentMonsterMaxHp);

  if (currentMonsterHp <= 0) {
    setBattleLog(`${currentCreature.name} ficou sem Vida! (vitória/recompensas ainda por implementar)`);
  }

  heroAttackInFlight = false;
}

// Ciclo de combate por turnos ORIGINAL fica TEMPORARIAMENTE DESATIVADO
// (2026-08-11): a vista da Masmorra/Arena passou de um palco lateral fixo
// para uma arena top-down onde o heroi anda livremente por joystick
// (secção 9 da documentação, a pedido). O heroi ja ataca sozinho quando
// esta parado com o monstro a vista (performHeroAttack abaixo, chamada
// por js/main.js updateHeroAutoAttack) - mas o monstro continua idle, sem
// atacar nem esquivar (rollDodge nunca chamado do lado dele, os modos de
// comportamento/ataque dele ainda nao foram definidos), e nao ha
// vitoria/recompensas ainda quando a Vida dele chega a 0 (so para de se
// poder atacar - ver performHeroAttack). Sair continua sempre possivel
// (btnBattleBack visivel desde logo, nao so no fim de uma luta resolvida).
async function startBattle(creature) {
  if (battleInProgress) return;

  // Impede duas abas do mesmo telemovel/navegador lutarem contra o mesmo
  // monstro em simultaneo - cada uma pagaria o bonus de "primeira derrota"
  // em separado, duplicando pontos.
  if (!claimTabLock(STORAGE_KEY_BATTLE_TAB_LOCK)) {
    alert("Já tens uma luta em curso noutro separador ou janela.");
    return;
  }

  battleInProgress = true;

  // Trocar para a aba Perfil a meio da luta nao a pausava - so parava o
  // render 3D (jogoViewVisible, js/main.js). Desativado enquanto a luta
  // durar, reativado no fim (mesmo padrao do bloqueio entre abas acima,
  // mas dentro da mesma aba).
  document.getElementById("btn-nav-perfil").disabled = true;

  // Entrar em combate revela a Vida da criatura no card, ganhe ou perca
  // a luta - Ataque/Defesa ficam sempre desconhecidos.
  markCreatureEncountered(creature.level);

  // Estado lido por performHeroAttack (chamada a partir do loop de frames
  // de js/main.js, fora desta função) - ver comentario acima de
  // currentCreature.
  currentCreature = creature;
  currentPlayerAtaque = computePlayerAtaque(getEffectiveInvestableStatLevel("forca"));
  currentPlayerLetalidade = computeLetalidadeChance(getEffectiveInvestableStatLevel("forca"));
  currentMonsterDefesa = computeCreatureStatValue("defesa", creature);
  currentPlayerMaxHp = computePlayerVida(getEffectiveInvestableStatLevel("energia"));
  currentMonsterMaxHp = computeCreatureStatValue("vida", creature);
  currentPlayerHp = getCurrentHp(currentPlayerMaxHp);
  currentMonsterHp = currentMonsterMaxHp;
  heroAttackInFlight = false;

  characterHudEl.classList.add("hidden");
  battleResultEl.textContent = "";
  battleMonsterNameEl.textContent = creature.name;
  battleHudEl.classList.remove("hidden");
  battlePanelEl.classList.remove("hidden");
  battleJoystickEl.classList.remove("hidden");
  // Sem ciclo de combate a resolver-se sozinho, sair fica disponivel logo
  // de entrada (antes so aparecia no fim de uma luta ganha/perdida).
  btnBattleBack.classList.remove("hidden");

  battleStatDestrezaEl.textContent = `${(computeDestrezaChance(getEffectiveInvestableStatLevel("resistencia")) * 100).toFixed(1)}%`;
  battleStatLetalidadeEl.textContent = `${(computeLetalidadeChance(getEffectiveInvestableStatLevel("forca")) * 100).toFixed(1)}%`;

  battleLogHistory = [];
  battleLogHeadlineEl.textContent = "";
  battleLogHistoryEl.innerHTML = "";

  viewerEl.classList.add("battle-fullscreen");
  onResize();
  enterBattleView();
  updateBattleBars(currentPlayerHp, currentPlayerMaxHp, currentMonsterHp, currentMonsterMaxHp);
  setBattleLog("Para de andar para disparares uma flecha.");
}

function endBattle() {
  battleHudEl.classList.add("hidden");
  battlePanelEl.classList.add("hidden");
  battleJoystickEl.classList.add("hidden");
  characterHudEl.classList.remove("hidden");
  currentCreature = null;

  viewerEl.classList.remove("battle-fullscreen");
  onResize();
  exitBattleView();
  renderMonsters(); // pode ter desbloqueado o proximo monstro

  battleInProgress = false;
  document.getElementById("btn-nav-perfil").disabled = false;
  releaseTabLock(STORAGE_KEY_BATTLE_TAB_LOCK);
}

btnBattleBack.addEventListener("click", endBattle);
