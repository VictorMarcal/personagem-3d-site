// Duas camadas de criaturas: Mini-Bosses a cada MINIBOSS_LEVEL_STEP niveis,
// Bosses a cada BOSS_LEVEL_STEP (sem monstros "normais" entre elas). Ambas
// usam a mesma formula de status dos equipamentos (computeStatValue,
// definida em equipment.js), com base no nivel a que pertencem - sem
// tratamento especial de dificuldade, so o intervalo e diferente. Niveis de
// boss tem prioridade sobre mini-boss (nunca ha sobreposicao). Passos/
// limites ajustaveis no card de Debug (js/debug.js).
const monstersListEl = document.getElementById("monsters-list");

// STORAGE_KEY_DEFEATED_CREATURES esta definida em js/storage-keys.js

function generateCreatures() {
  const miniBossStep = getMiniBossLevelStep();
  const bossStep = getBossLevelStep();
  const maxLevel = getMaxLevelToGenerate();
  const creatures = [];

  for (let lvl = miniBossStep; lvl <= maxLevel; lvl += miniBossStep) {
    if (lvl % bossStep === 0) continue; // nivel reservado para o boss
    creatures.push({ level: lvl, name: `Mini-Boss Nível ${lvl}`, isBoss: false, isMiniBoss: true });
  }

  for (let lvl = bossStep; lvl <= maxLevel; lvl += bossStep) {
    creatures.push({ level: lvl, name: `Boss Nível ${lvl}`, isBoss: true, isMiniBoss: false });
  }

  creatures.sort((a, b) => a.level - b.level || (a.isBoss ? 1 : -1));
  return creatures;
}

// Mapa { nivel: estrelas } em vez de uma simples lista de niveis - guarda
// tambem o melhor resultado (1-3 estrelas) alcancado contra cada criatura.
function getDefeatedCreaturesMap() {
  const raw = localStorage.getItem(STORAGE_KEY_DEFEATED_CREATURES);
  try {
    const parsed = raw ? JSON.parse(raw) : {};
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed : {};
  } catch (e) {
    return {};
  }
}

function isCreatureDefeated(level) {
  return Object.prototype.hasOwnProperty.call(getDefeatedCreaturesMap(), level);
}

function getCreatureStars(level) {
  return getDefeatedCreaturesMap()[level] || 0;
}

// 1 estrela: venceu com vida < 25%; 2 estrelas: 25%-49%; 3 estrelas: >= 50%
function computeStarsForHp(playerHpPercent) {
  if (playerHpPercent >= 50) return 3;
  if (playerHpPercent >= 25) return 2;
  return 1;
}

// Pode ser re-lutada depois de derrotada - guarda sempre o MELHOR
// resultado (nunca piora as estrelas de uma tentativa anterior).
function markCreatureDefeated(level, stars) {
  const defeated = getDefeatedCreaturesMap();
  const previousStars = defeated[level] || 0;
  if (stars > previousStars) {
    defeated[level] = stars;
    localStorage.setItem(STORAGE_KEY_DEFEATED_CREATURES, JSON.stringify(defeated));
    queueProgressSync();
  }
}

// So desbloqueia sequencialmente por combate - a primeira criatura ja
// comeca desbloqueada, as seguintes so depois da anterior ser derrotada
// (o nivel do personagem ja nao e um requisito)
function isCreatureUnlocked(creature, creatures, index) {
  if (index === 0) return true;
  return isCreatureDefeated(creatures[index - 1].level);
}

// Indice da proxima criatura por derrotar (a primeira ainda nao
// derrotada na sequencia); se estiver tudo derrotado, mostra a ultima
function findNextToDefeatIndex(creatures) {
  const index = creatures.findIndex((creature) => !isCreatureDefeated(creature.level));
  return index === -1 ? creatures.length - 1 : index;
}

// Janela de 5 criaturas centrada na proxima por derrotar, ajustada nos
// limites da lista (inicio/fim) para continuar a mostrar 5 quando possivel
function getVisibleWindow(creatures, centerIndex, windowSize) {
  const half = Math.floor(windowSize / 2);
  let start = centerIndex - half;
  let end = centerIndex + half;

  if (start < 0) {
    end += -start;
    start = 0;
  }
  if (end > creatures.length - 1) {
    start -= end - (creatures.length - 1);
    end = creatures.length - 1;
  }
  start = Math.max(0, start);

  return creatures.slice(start, end + 1).map((creature, i) => ({ creature, index: start + i }));
}

const VISIBLE_WINDOW_SIZE = 5;

// So mexe no scrollLeft do proprio carrossel (nunca no scroll da
// pagina) e so quando o "proximo a derrotar" muda de facto - evita que
// re-renderizacoes frequentes (ex: a cada tick da simulacao de
// distancia) fiquem a repor a posicao e a "saltar" a pagina
let lastCenteredNextIndex = null;

function centerNextTargetInCarousel() {
  const nextTargetEl = monstersListEl.querySelector(".next-target");
  if (!nextTargetEl) return;

  const containerWidth = monstersListEl.clientWidth;
  const targetLeft = nextTargetEl.offsetLeft;
  const targetWidth = nextTargetEl.offsetWidth;

  monstersListEl.scrollLeft = targetLeft - containerWidth / 2 + targetWidth / 2;
}

function renderMonsters() {
  const creatures = generateCreatures();
  const nextIndex = findNextToDefeatIndex(creatures);
  const visible = getVisibleWindow(creatures, nextIndex, VISIBLE_WINDOW_SIZE);

  monstersListEl.innerHTML = "";

  visible.forEach(({ creature, index }) => {
    const unlocked = isCreatureUnlocked(creature, creatures, index);
    const defeated = isCreatureDefeated(creature.level);
    const vidaValue = computeStatValue("vida", creature.level);
    const ataqueValue = computeStatValue("ataque", creature.level);
    const defesaValue = computeStatValue("defesa", creature.level);

    const item = document.createElement("div");
    item.className =
      "monster-item" +
      (unlocked ? "" : " locked") +
      (creature.isBoss ? " boss" : "") +
      (creature.isMiniBoss ? " miniboss" : "") +
      (index === nextIndex ? " next-target" : "");

    const header = document.createElement("div");
    header.className = "monster-header";

    const nameEl = document.createElement("span");
    nameEl.className = "monster-name";
    nameEl.textContent = creature.name;
    header.appendChild(nameEl);

    if (defeated) {
      const defeatedBadge = document.createElement("span");
      defeatedBadge.className = "defeated-badge";
      defeatedBadge.textContent = "DERROTADO";
      header.appendChild(defeatedBadge);
    }

    // Sempre visiveis (cinza/bloqueadas ate derrotar) - o tier (mini-boss
    // vs boss) ja se distingue pela cor da borda do card, sem precisar de
    // badge de texto.
    const starsEl = document.createElement("span");
    starsEl.className = "creature-stars";
    const stars = defeated ? getCreatureStars(creature.level) : 0;
    for (let i = 1; i <= 3; i++) {
      const starEl = document.createElement("span");
      starEl.className = "star " + (i <= stars ? "filled" : "empty");
      starEl.textContent = "★";
      starsEl.appendChild(starEl);
    }
    header.appendChild(starsEl);

    item.appendChild(header);

    const detail = document.createElement("div");
    if (unlocked) {
      detail.className = "monster-stats";
      detail.textContent = `Vida: ${vidaValue} · Ataque: ${ataqueValue} · Defesa: ${defesaValue}`;
    } else {
      detail.className = "monster-locked-label";
      detail.textContent = "Bloqueado — derrota primeiro a criatura anterior";
    }
    item.appendChild(detail);

    if (unlocked) {
      const battleBtn = document.createElement("button");
      battleBtn.className = "btn-primary btn-battle";
      battleBtn.textContent = defeated ? "Lutar novamente" : "Batalhar";
      battleBtn.addEventListener("click", () => startBattle(creature));
      item.appendChild(battleBtn);
    }

    monstersListEl.appendChild(item);
  });

  if (nextIndex !== lastCenteredNextIndex) {
    centerNextTargetInCarousel();
    lastCenteredNextIndex = nextIndex;
  }
}

renderMonsters();
