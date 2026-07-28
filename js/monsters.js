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

function renderMonsters() {
  const characterLevel = getLevelInfo(getLifetimeDistanceM()).level;
  const creatures = generateCreatures();

  monstersListEl.innerHTML = "";

  creatures.forEach((creature, index) => {
    const unlocked = isCreatureUnlocked(creature, characterLevel, creatures, index);
    const defeated = isCreatureDefeated(creature.level);
    const vidaValue = computeStatValue("vida", creature.level);
    const ataqueValue = computeStatValue("ataque", creature.level);
    const defesaValue = computeStatValue("defesa", creature.level);

    const item = document.createElement("div");
    item.className =
      "monster-item" + (unlocked ? "" : " locked") + (creature.isBoss ? " boss" : "");

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

    if (unlocked && !defeated) {
      const battleBtn = document.createElement("button");
      battleBtn.className = "btn-primary btn-battle";
      battleBtn.textContent = "Batalhar";
      battleBtn.addEventListener("click", () => startBattle(creature));
      item.appendChild(battleBtn);
    }

    monstersListEl.appendChild(item);
  });
}

renderMonsters();
