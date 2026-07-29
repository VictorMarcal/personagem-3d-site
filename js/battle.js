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
const battleLogEl = document.getElementById("battle-log");
const battleResultEl = document.getElementById("battle-result");
const btnBattleBack = document.getElementById("btn-battle-back");

const viewerEl = document.getElementById("viewer");
const characterHudEl = document.getElementById("character-hud");

const BATTLE_ROUND_DELAY_MS = 550;
const BATTLE_MAX_ROUNDS = 500; // rede de seguranca, na pratica nunca deve chegar la

let battleInProgress = false;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function computeBattleDamage(attackerAtaque, defenderDefesa) {
  const raw = attackerAtaque - getBattleDefensePercent() * defenderDefesa;
  const floor = getBattleFloorPercent() * attackerAtaque;
  return Math.round(Math.max(floor, raw));
}

function updateBattleBars(playerHp, playerMaxHp, monsterHp, monsterMaxHp) {
  const playerPct = Math.max(0, Math.min(100, (playerHp / playerMaxHp) * 100));
  const monsterPct = Math.max(0, Math.min(100, (monsterHp / monsterMaxHp) * 100));

  battlePlayerHpFillEl.style.width = `${playerPct}%`;
  battlePlayerHpTextEl.textContent = `${Math.max(0, Math.round(playerHp))} / ${playerMaxHp}`;

  battleMonsterHpFillEl.style.width = `${monsterPct}%`;
  battleMonsterHpTextEl.textContent = `${Math.max(0, Math.round(monsterHp))} / ${monsterMaxHp}`;
}

async function startBattle(creature) {
  if (battleInProgress) return;
  battleInProgress = true;

  const playerMaxHp = computeStatValue("vida", getEquipLevel("vida"));
  const playerAtaque = computeStatValue("ataque", getEquipLevel("ataque"));
  const playerDefesa = computeStatValue("defesa", getEquipLevel("defesa"));

  const monsterMaxHp = computeStatValue("vida", creature.level);
  const monsterAtaque = computeStatValue("ataque", creature.level);
  const monsterDefesa = computeStatValue("defesa", creature.level);

  let playerHp = playerMaxHp;
  let monsterHp = monsterMaxHp;

  characterHudEl.classList.add("hidden");
  btnBattleBack.classList.add("hidden");
  battleResultEl.textContent = "";
  battleMonsterNameEl.textContent = creature.name;
  battleHudEl.classList.remove("hidden");
  battlePanelEl.classList.remove("hidden");

  viewerEl.classList.add("battle-fullscreen");
  onResize();
  enterBattleView();
  updateBattleBars(playerHp, playerMaxHp, monsterHp, monsterMaxHp);
  battleLogEl.textContent = "A batalha começou!";
  await sleep(BATTLE_ROUND_DELAY_MS);

  let won = false;
  let round = 0;

  while (round < BATTLE_MAX_ROUNDS) {
    round += 1;

    const dmgToMonster = computeBattleDamage(playerAtaque, monsterDefesa);
    monsterHp -= dmgToMonster;
    battleLogEl.textContent = `Atacaste ${creature.name}: -${dmgToMonster} Vida`;
    updateBattleBars(playerHp, playerMaxHp, monsterHp, monsterMaxHp);
    await sleep(BATTLE_ROUND_DELAY_MS);

    if (monsterHp <= 0) {
      won = true;
      break;
    }

    const dmgToPlayer = computeBattleDamage(monsterAtaque, playerDefesa);
    playerHp -= dmgToPlayer;
    battleLogEl.textContent = `${creature.name} atacou-te: -${dmgToPlayer} Vida`;
    updateBattleBars(playerHp, playerMaxHp, monsterHp, monsterMaxHp);
    await sleep(BATTLE_ROUND_DELAY_MS);

    if (playerHp <= 0) {
      won = false;
      break;
    }
  }

  if (won) {
    markCreatureDefeated(creature.level);
    checkAndUnlockAchievements(); // pode ter desbloqueado uma conquista de boss
    battleResultEl.textContent = `Vitória! Derrotaste ${creature.name}.`;
  } else {
    battleResultEl.textContent = `Derrota... ${creature.name} venceu.`;
  }

  btnBattleBack.classList.remove("hidden");
  battleInProgress = false;
}

function endBattle() {
  battleHudEl.classList.add("hidden");
  battlePanelEl.classList.add("hidden");
  characterHudEl.classList.remove("hidden");

  viewerEl.classList.remove("battle-fullscreen");
  onResize();
  exitBattleView();
  renderMonsters(); // pode ter desbloqueado o proximo monstro
}

btnBattleBack.addEventListener("click", endBattle);
