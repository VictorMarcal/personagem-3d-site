// Monstros aparecem a cada MONSTER_LEVEL_STEP niveis, Bosses a cada
// BOSS_LEVEL_STEP. Ambos usam a mesma formula de status dos equipamentos
// (computeStatValue, definida em equipment.js), com base no nivel a que
// pertencem - sem tratamento especial de dificuldade para os bosses, so
// o intervalo e diferente. Todos os passos/limites sao ajustaveis no
// card de Debug (js/debug.js).
const monstersListEl = document.getElementById("monsters-list");

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

// Qualquer criatura (monstro ou boss) exige que o personagem ja tenha
// alcancado o nivel correspondente; os status so ficam visiveis quando
// desbloqueada
function isCreatureUnlocked(creature, characterLevel) {
  return characterLevel >= creature.level;
}

function renderMonsters() {
  const characterLevel = getLevelInfo(getLifetimeDistanceM()).level;
  const creatures = generateCreatures();

  monstersListEl.innerHTML = "";

  creatures.forEach((creature) => {
    const unlocked = isCreatureUnlocked(creature, characterLevel);
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

    monstersListEl.appendChild(item);
  });
}

renderMonsters();
