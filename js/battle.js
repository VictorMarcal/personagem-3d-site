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

  // Entrar em combate revela a Vida da criatura no card, ganhe ou perca
  // a luta - Ataque/Defesa ficam sempre desconhecidos.
  markCreatureEncountered(creature.level);

  // A vida entra na luta com o que tiver recuperado ate agora (nunca cheia
  // por garantia) - lutar com vida parcial e uma escolha do jogador, nao
  // um bloqueio. A recuperacao para de contar assim que a luta comeca
  // (so volta a avancar depois, a partir do valor guardado no fim dela).
  const playerMaxHp = computeStatValue("vida", getEquipLevel("vida"));
  const playerAtaque = computeStatValue("ataque", getEquipLevel("ataque"));
  const playerDefesa = computeStatValue("defesa", getEquipLevel("defesa"));

  const monsterMaxHp = computeCreatureStatValue("vida", creature);
  const monsterAtaque = computeCreatureStatValue("ataque", creature);
  const monsterDefesa = computeCreatureStatValue("defesa", creature);

  let playerHp = getCurrentHp(playerMaxHp);
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
  let playerHpPercentAtWin = 100;

  while (round < BATTLE_MAX_ROUNDS) {
    round += 1;

    const dmgToMonster = computeBattleDamage(playerAtaque, monsterDefesa);
    monsterHp -= dmgToMonster;
    showFloatingCombatText(monsterHead, -dmgToMonster);
    battleLogEl.textContent = `Atacaste ${creature.name}: -${dmgToMonster} Vida`;
    updateBattleBars(playerHp, playerMaxHp, monsterHp, monsterMaxHp);
    await sleep(BATTLE_ROUND_DELAY_MS);

    if (monsterHp <= 0) {
      won = true;
      playerHpPercentAtWin = Math.max(0, (playerHp / playerMaxHp) * 100);
      break;
    }

    const dmgToPlayer = computeBattleDamage(monsterAtaque, playerDefesa);
    playerHp -= dmgToPlayer;
    showFloatingCombatText(head, -dmgToPlayer);
    battleLogEl.textContent = `${creature.name} atacou-te: -${dmgToPlayer} Vida`;
    updateBattleBars(playerHp, playerMaxHp, monsterHp, monsterMaxHp);
    await sleep(BATTLE_ROUND_DELAY_MS);

    if (playerHp <= 0) {
      won = false;
      break;
    }
  }

  if (won) {
    // Estrelas antes desta vitoria (0 se nunca derrotada) - guardado antes
    // de markCreatureDefeated atualizar o mapa, para podermos comparar.
    const previousStars = isCreatureDefeated(creature.level) ? getCreatureStars(creature.level) : 0;
    const stars = computeStarsForHp(playerHpPercentAtWin);
    markCreatureDefeated(creature.level, stars);

    // So paga a diferenca de pontos: se ja tinhas 1 estrela (1 ponto) e
    // agora consegues 3 (3 pontos), recebes so os 2 que faltavam - nunca
    // paga a mesma vitoria duas vezes nem tira pontos se sair pior.
    if (stars > previousStars) {
      const maxPoints = creature.isBoss ? getBossMaxPoints() : creature.isMiniBoss ? getMiniBossMaxPoints() : 0;
      if (maxPoints > 0) {
        const previousPoints = previousStars > 0 ? computeBonusPointsForStars(maxPoints, previousStars) : 0;
        const newPoints = computeBonusPointsForStars(maxPoints, stars);
        awardBonusPoints(newPoints - previousPoints);
      }
    }

    checkAndUnlockAchievements(); // pode ter desbloqueado uma conquista de boss
    battleResultEl.textContent = `Vitória! Derrotaste ${creature.name}.`;
  } else {
    battleResultEl.textContent = `Derrota... ${creature.name} venceu.`;
  }

  // Guarda a vida com que ficou (ganhando ou perdendo) - e a partir daqui
  // que a recuperacao por tempo real comeca a contar.
  setCurrentHp(Math.max(0, playerHp));

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
