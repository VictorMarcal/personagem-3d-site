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
}

// Drop de equipamento por derrotar mini-boss/boss (secção 7 da
// documentação): 7%/10% de chance, mesma regra de nivel +/-15 e "no maximo
// uma peca por evento" de rollEquipmentDrop (js/equipment.js) - pago em
// TODA vitoria, tal como as moedas acima.
const MINIBOSS_EQUIPMENT_DROP_CHANCE = 7;
const BOSS_EQUIPMENT_DROP_CHANCE = 10;

function awardMonsterEquipmentDrop(creature) {
  const chancePercent = creature.isBoss
    ? BOSS_EQUIPMENT_DROP_CHANCE
    : creature.isMiniBoss
    ? MINIBOSS_EQUIPMENT_DROP_CHANCE
    : null;
  if (chancePercent === null) return;

  const drop = rollEquipmentDrop(chancePercent);
  if (drop) showEquipmentDropToast(describeEquipmentDrop(drop));
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

  // Impede duas abas do mesmo telemovel/navegador lutarem contra o mesmo
  // monstro em simultaneo - cada uma pagaria o bonus de "primeira derrota"
  // em separado, duplicando pontos.
  if (!claimTabLock(STORAGE_KEY_BATTLE_TAB_LOCK)) {
    alert("Já tens uma luta em curso noutro separador ou janela.");
    return;
  }

  battleInProgress = true;

  // Entrar em combate revela a Vida da criatura no card, ganhe ou perca
  // a luta - Ataque/Defesa ficam sempre desconhecidos.
  markCreatureEncountered(creature.level);

  // A vida entra na luta com o que tiver recuperado ate agora (nunca cheia
  // por garantia) - lutar com vida parcial e uma escolha do jogador, nao
  // um bloqueio. A recuperacao para de contar assim que a luta comeca
  // (so volta a avancar depois, a partir do valor guardado no fim dela).
  const playerMaxHp = computePlayerVida(getInvestableStatLevel("energia"));
  const playerAtaque = computePlayerAtaque(getInvestableStatLevel("forca"));
  const playerDefesa = computePlayerDefesa(getInvestableStatLevel("resistencia"));
  const playerDestreza = computeDestrezaChance(getInvestableStatLevel("resistencia"));
  const playerLetalidade = computeLetalidadeChance(getInvestableStatLevel("forca"));

  const monsterMaxHp = computeCreatureStatValue("vida", creature);
  const monsterAtaque = computeCreatureStatValue("ataque", creature);
  const monsterDefesa = computeCreatureStatValue("defesa", creature);
  // Monstros nao tem Destreza/Letalidade por agora (fora de escopo) - nunca
  // esquivam nem dao critico, so o jogador tem estas duas mecanicas.
  const monsterDestreza = 0;
  const monsterLetalidade = 0;

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
    refreshTabLock(STORAGE_KEY_BATTLE_TAB_LOCK);

    if (rollDodge(monsterDestreza)) {
      battleLogEl.textContent = `${creature.name} esquivou o teu ataque!`;
    } else if (rollCritico(playerLetalidade)) {
      const critDmg = Math.round(playerAtaque * getLetalidadeMultiplicador());
      monsterHp -= critDmg;
      showFloatingCombatText(monsterHead, -critDmg);
      battleLogEl.textContent = `Crítico! Atacaste ${creature.name}: -${critDmg} Vida`;
    } else {
      const dmgToMonster = computeBattleDamage(playerAtaque, monsterDefesa);
      monsterHp -= dmgToMonster;
      showFloatingCombatText(monsterHead, -dmgToMonster);
      battleLogEl.textContent = `Atacaste ${creature.name}: -${dmgToMonster} Vida`;
    }
    updateBattleBars(playerHp, playerMaxHp, monsterHp, monsterMaxHp);
    await sleep(BATTLE_ROUND_DELAY_MS);

    if (monsterHp <= 0) {
      won = true;
      playerHpPercentAtWin = Math.max(0, (playerHp / playerMaxHp) * 100);
      break;
    }

    if (rollDodge(playerDestreza)) {
      battleLogEl.textContent = `Esquivaste do ataque de ${creature.name}!`;
    } else if (rollCritico(monsterLetalidade)) {
      const critDmg = Math.round(monsterAtaque * getLetalidadeMultiplicador());
      playerHp -= critDmg;
      showFloatingCombatText(head, -critDmg);
      battleLogEl.textContent = `Crítico! ${creature.name} atacou-te: -${critDmg} Vida`;
    } else {
      const dmgToPlayer = computeBattleDamage(monsterAtaque, playerDefesa);
      playerHp -= dmgToPlayer;
      showFloatingCombatText(head, -dmgToPlayer);
      battleLogEl.textContent = `${creature.name} atacou-te: -${dmgToPlayer} Vida`;
    }
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

    awardMonsterCoins(creature);
    awardMonsterEquipmentDrop(creature);
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
  releaseTabLock(STORAGE_KEY_BATTLE_TAB_LOCK);
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
