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
  // render 3D (jogoViewVisible, js/main.js), o ciclo da luta continuava a
  // correr por baixo e resolvia-se sozinho, sem o jogador ver. Desativado
  // enquanto a luta durar, reativado no fim (mesmo padrao do bloqueio entre
  // abas acima, mas dentro da mesma aba).
  document.getElementById("btn-nav-perfil").disabled = true;

  // Entrar em combate revela a Vida da criatura no card, ganhe ou perca
  // a luta - Ataque/Defesa ficam sempre desconhecidos.
  markCreatureEncountered(creature.level);

  // A vida entra na luta com o que tiver recuperado ate agora (nunca cheia
  // por garantia) - lutar com vida parcial e uma escolha do jogador, nao
  // um bloqueio.
  const playerEnergiaLevel = getEffectiveInvestableStatLevel("energia");
  const playerMaxHp = computePlayerVida(playerEnergiaLevel);
  const playerAtaque = computePlayerAtaque(getEffectiveInvestableStatLevel("forca"));
  const playerDefesa = computePlayerDefesa(getEffectiveInvestableStatLevel("resistencia"));
  const playerDestreza = computeDestrezaChance(getEffectiveInvestableStatLevel("resistencia"));
  const playerLetalidade = computeLetalidadeChance(getEffectiveInvestableStatLevel("forca"));

  const monsterMaxHp = computeCreatureStatValue("vida", creature);
  const monsterAtaque = computeCreatureStatValue("ataque", creature);
  const monsterDefesa = computeCreatureStatValue("defesa", creature);
  // Monstros nao tem Destreza/Letalidade por agora (fora de escopo) - nunca
  // esquivam nem dao critico, so o jogador tem estas duas mecanicas.
  const monsterDestreza = 0;
  const monsterLetalidade = 0;

  let playerHp = getCurrentHp(playerMaxHp);
  let monsterHp = monsterMaxHp;

  // Regeneracao passa a decorrer tambem DURANTE a luta, nao so fora dela
  // (2026-08-06, a pedido - antes o relogio de recuperacao ficava
  // completamente parado enquanto battleInProgress, so retomando a partir
  // do valor final quando a luta acabava). Aplicada a cada intervalo real
  // entre acoes (BATTLE_ROUND_DELAY_MS), capada na vida maxima - mesmo
  // "+X" flutuante verde usado fora de combate (showFloatingCombatText,
  // js/main.js), so que aqui tambem soma ao mesmo playerHp que o dano usa.
  // O numero mostrado ja nao e arredondado a um inteiro (2026-08-07,
  // corrigido a pedido - "tenho 2.6 de recuperacao por segundo mas na
  // luta so aparecia +2"): mesma formatacao de fora de combate
  // (showFloatingCombatText usa toFixed(1) para nao-inteiros), agora
  // tambem em luta.
  function tickPlayerRegen() {
    if (playerHp <= 0 || playerHp >= playerMaxHp) return;
    const before = playerHp;
    playerHp = Math.min(playerMaxHp, playerHp + computeRegeneracaoPerSecond(playerEnergiaLevel) * (BATTLE_ROUND_DELAY_MS / 1000));
    const healed = playerHp - before;
    if (healed > 0) showFloatingCombatText(head, healed, "heal");
  }

  // Monstros passam a regenerar tambem (2026-08-07, a pedido) - sem status
  // de Energia proprio, usam uma % da sua Vida MAXIMA por troca de ataques
  // em vez de vida/segundo (MONSTER_REGEN_PERCENT no Debug), nos mesmos
  // momentos que tickPlayerRegen acima.
  function tickMonsterRegen() {
    if (monsterHp <= 0 || monsterHp >= monsterMaxHp) return;
    const before = monsterHp;
    monsterHp = Math.min(monsterMaxHp, monsterHp + monsterMaxHp * (getMonsterRegenPercent() / 100));
    const healed = monsterHp - before;
    if (healed > 0) showFloatingCombatText(monsterHead, healed, "heal");
  }

  characterHudEl.classList.add("hidden");
  btnBattleBack.classList.add("hidden");
  battleResultEl.textContent = "";
  battleMonsterNameEl.textContent = creature.name;
  battleHudEl.classList.remove("hidden");
  battlePanelEl.classList.remove("hidden");

  // Destreza/Letalidade nao mudam durante a luta (fixas no que foi
  // investido ao entrar), por isso so precisam de ser escritas uma vez.
  battleStatDestrezaEl.textContent = `${(playerDestreza * 100).toFixed(1)}%`;
  battleStatLetalidadeEl.textContent = `${(playerLetalidade * 100).toFixed(1)}%`;

  battleLogHistory = [];
  battleLogHeadlineEl.textContent = "";
  battleLogHistoryEl.innerHTML = "";

  viewerEl.classList.add("battle-fullscreen");
  onResize();
  enterBattleView();
  updateBattleBars(playerHp, playerMaxHp, monsterHp, monsterMaxHp);
  setBattleLog("A batalha começou!");
  await sleep(BATTLE_ROUND_DELAY_MS);
  tickPlayerRegen();
  tickMonsterRegen();
  updateBattleBars(playerHp, playerMaxHp, monsterHp, monsterMaxHp);

  let won = false;
  let round = 0;
  let playerHpPercentAtWin = 100;

  while (round < BATTLE_MAX_ROUNDS) {
    round += 1;
    refreshTabLock(STORAGE_KEY_BATTLE_TAB_LOCK);

    const playerLungeOriginX = await lungeOut(character, monster);
    if (rollDodge(monsterDestreza)) {
      showFloatingCombatText(monsterHead, 0, "miss");
      setBattleLog(`${creature.name} esquivou o teu ataque!`, "miss");
    } else if (rollCritico(playerLetalidade)) {
      const critDmg = Math.round(playerAtaque * getLetalidadeMultiplicador());
      monsterHp -= critDmg;
      showFloatingCombatText(monsterHead, -critDmg, "critico");
      setBattleLog(`Crítico! Atacaste ${creature.name}: -${critDmg} Vida`, "critico");
    } else {
      const dmgToMonster = computeBattleDamage(playerAtaque, monsterDefesa);
      monsterHp -= dmgToMonster;
      showFloatingCombatText(monsterHead, -dmgToMonster, "damage");
      setBattleLog(`Atacaste ${creature.name}: -${dmgToMonster} Vida`);
    }
    lungeBack(character, playerLungeOriginX);
    updateBattleBars(playerHp, playerMaxHp, monsterHp, monsterMaxHp);
    await sleep(BATTLE_ROUND_DELAY_MS);
    tickPlayerRegen();
    tickMonsterRegen();
    updateBattleBars(playerHp, playerMaxHp, monsterHp, monsterMaxHp);

    if (monsterHp <= 0) {
      won = true;
      playerHpPercentAtWin = Math.max(0, (playerHp / playerMaxHp) * 100);
      break;
    }

    const monsterLungeOriginX = await lungeOut(monster, character);
    if (rollDodge(playerDestreza)) {
      showFloatingCombatText(head, 0, "miss");
      setBattleLog(`Esquivaste do ataque de ${creature.name}!`, "miss");
    } else if (rollCritico(monsterLetalidade)) {
      const critDmg = Math.round(monsterAtaque * getLetalidadeMultiplicador());
      playerHp -= critDmg;
      showFloatingCombatText(head, -critDmg, "critico");
      setBattleLog(`Crítico! ${creature.name} atacou-te: -${critDmg} Vida`, "critico");
    } else {
      const dmgToPlayer = computeBattleDamage(monsterAtaque, playerDefesa);
      playerHp -= dmgToPlayer;
      showFloatingCombatText(head, -dmgToPlayer, "damage");
      setBattleLog(`${creature.name} atacou-te: -${dmgToPlayer} Vida`);
    }
    lungeBack(monster, monsterLungeOriginX);
    updateBattleBars(playerHp, playerMaxHp, monsterHp, monsterMaxHp);
    await sleep(BATTLE_ROUND_DELAY_MS);
    tickPlayerRegen();
    tickMonsterRegen();
    updateBattleBars(playerHp, playerMaxHp, monsterHp, monsterMaxHp);

    if (playerHp <= 0) {
      won = false;
      break;
    }
  }

  // Conta para a conquista "Guerreiro" (numero total de lutas, ganhas ou
  // perdidas - 2026-08-07) - antes do if/else, aplica-se aos dois casos.
  incrementTotalBattlesFought();

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

    // So paga moedas enquanto ainda nao tinhas 3 estrelas contra esta
    // criatura (2026-08-07, a pedido - antes pagava em TODA vitoria, mesmo
    // repetida, o que incentivava "farmar" um monstro ja dominado so pelo
    // dinheiro). Uma vez a 3 estrelas, re-lutar continua disponivel (para
    // testar builds, ver stats, etc.) mas deixa de rentabilizar.
    if (previousStars < 3) awardMonsterCoins(creature);
    battleResultEl.textContent = `Vitória! Derrotaste ${creature.name}.`;
  } else {
    battleResultEl.textContent = `Derrota... ${creature.name} venceu.`;
  }

  // Fora do if/else porque conquistas como "Guerreiro" (numero de lutas)
  // tem de ser reavaliadas mesmo numa derrota, nao so numa vitoria.
  checkAndUnlockAchievements();

  // Guarda a vida com que ficou (ganhando ou perdendo) - e a partir daqui
  // que a recuperacao por tempo real comeca a contar.
  setCurrentHp(Math.max(0, playerHp));

  btnBattleBack.classList.remove("hidden");
  battleInProgress = false;
  document.getElementById("btn-nav-perfil").disabled = false;
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
