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

// Ciclo de combate por turnos TEMPORARIAMENTE DESATIVADO (2026-08-11): a
// vista da Masmorra/Arena passou de um palco lateral fixo para uma arena
// top-down onde a personagem anda livremente por joystick (secção 9 da
// documentação, a pedido) - falta definir os modos de comportamento/
// ataque do monstro nesta nova vista, por isso entrar numa luta por
// agora so mostra a arena e liberta o movimento; o monstro fica parado,
// sem atacar nem levar dano, e sair e sempre possivel (btnBattleBack fica
// visivel desde logo, nao so no fim de uma luta resolvida). As funcoes de
// calculo de dano/esquiva/critico acima (computeBattleDamage, rollDodge,
// rollCritico, getMonsterCoinRange/awardMonsterCoins) ficam prontas para
// serem religadas quando os modos do monstro forem definidos.
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

  // Mostradas so para referencia (secção 9) - nenhum dano e calculado
  // enquanto o ciclo de combate estiver desativado, ver nota acima.
  const playerMaxHp = computePlayerVida(getEffectiveInvestableStatLevel("energia"));
  const monsterMaxHp = computeCreatureStatValue("vida", creature);
  const playerHp = getCurrentHp(playerMaxHp);

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
  updateBattleBars(playerHp, playerMaxHp, monsterMaxHp, monsterMaxHp);
  setBattleLog("Explora a arena com o joystick - o combate chega em breve.");
}

function endBattle() {
  battleHudEl.classList.add("hidden");
  battlePanelEl.classList.add("hidden");
  battleJoystickEl.classList.add("hidden");
  characterHudEl.classList.remove("hidden");

  viewerEl.classList.remove("battle-fullscreen");
  onResize();
  exitBattleView();
  renderMonsters(); // pode ter desbloqueado o proximo monstro

  battleInProgress = false;
  document.getElementById("btn-nav-perfil").disabled = false;
  releaseTabLock(STORAGE_KEY_BATTLE_TAB_LOCK);
}

btnBattleBack.addEventListener("click", endBattle);
