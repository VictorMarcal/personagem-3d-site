// Monstros aparecem a cada MONSTER_LEVEL_STEP niveis, Bosses a cada
// BOSS_LEVEL_STEP. Ambos usam a mesma formula de status dos equipamentos
// (computeStatValue, definida em equipment.js), com base no nivel a que
// pertencem - sem tratamento especial de dificuldade para os bosses, so
// o intervalo e diferente. Todos os passos/limites sao ajustaveis no
// card de Debug (js/debug.js).
const monstersListEl = document.getElementById("monsters-list");

const STORAGE_KEY_DEFEATED_CREATURES = "personagem.monstrosDerrotados";

function generateCreatures() {
  const monsterStep = getMonsterLevelStep();
  const bossStep = getBossLevelStep();
  const maxLevel = getMaxLevelToGenerate();
  const creatures = [];

  for (let lvl = monsterStep; lvl <= maxLevel; lvl += monsterStep) {
    if (lvl % bossStep === 0) continue; // nivel reservado para o boss
    creatures.push({ level: lvl, name: `Monstro Nível ${lvl}`, isBoss: false });
  }

  for (let lvl = bossStep; lvl <= maxLevel; lvl += bossStep) {
    creatures.push({ level: lvl, name: `Boss Nível ${lvl}`, isBoss: true });
  }

  creatures.sort((a, b) => a.level - b.level || (a.isBoss ? 1 : -1));
  return creatures;
}

function getDefeatedLevels() {
  const raw = localStorage.getItem(STORAGE_KEY_DEFEATED_CREATURES);
  try {
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function isCreatureDefeated(level) {
  return getDefeatedLevels().includes(level);
}

function markCreatureDefeated(level) {
  const defeated = getDefeatedLevels();
  if (!defeated.includes(level)) {
    defeated.push(level);
    localStorage.setItem(STORAGE_KEY_DEFEATED_CREATURES, JSON.stringify(defeated));
  }
}

// Uma criatura so desbloqueia se o personagem ja tiver alcancado o nivel
// dela E a criatura anterior na sequencia ja tiver sido derrotada (a
// primeira da lista nao tem "anterior" a exigir)
function isCreatureUnlocked(creature, characterLevel, creatures, index) {
  if (characterLevel < creature.level) return false;
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
  const characterLevel = getLevelInfo(getLifetimeDistanceM()).level;
  const creatures = generateCreatures();
  const nextIndex = findNextToDefeatIndex(creatures);
  const visible = getVisibleWindow(creatures, nextIndex, VISIBLE_WINDOW_SIZE);

  monstersListEl.innerHTML = "";

  visible.forEach(({ creature, index }) => {
    const unlocked = isCreatureUnlocked(creature, characterLevel, creatures, index);
    const defeated = isCreatureDefeated(creature.level);
    const vidaValue = computeStatValue("vida", creature.level);
    const ataqueValue = computeStatValue("ataque", creature.level);
    const defesaValue = computeStatValue("defesa", creature.level);

    const item = document.createElement("div");
    item.className =
      "monster-item" +
      (unlocked ? "" : " locked") +
      (creature.isBoss ? " boss" : "") +
      (index === nextIndex ? " next-target" : "");

    const header = document.createElement("div");
    header.className = "monster-header";

    const nameEl = document.createElement("span");
    nameEl.className = "monster-name";
    nameEl.textContent = creature.name;
    header.appendChild(nameEl);

    if (creature.isBoss) {
      const badge = document.createElement("span");
      badge.className = "boss-badge";
      badge.textContent = "BOSS";
      header.appendChild(badge);
    }

    if (defeated) {
      const defeatedBadge = document.createElement("span");
      defeatedBadge.className = "defeated-badge";
      defeatedBadge.textContent = "DERROTADO";
      header.appendChild(defeatedBadge);
    }

    item.appendChild(header);

    const detail = document.createElement("div");
    if (unlocked) {
      detail.className = "monster-stats";
      detail.textContent = `Vida: ${vidaValue} · Ataque: ${ataqueValue} · Defesa: ${defesaValue}`;
    } else {
      detail.className = "monster-locked-label";
      detail.textContent = `Bloqueado — nível ${creature.level} necessário`;
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
