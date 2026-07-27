// Monstros aparecem a cada 3 niveis, Bosses a cada 10. Ambos usam a mesma
// formula de status dos equipamentos (computeStatValue, definida em
// equipment.js), com base no nivel a que pertencem - sem tratamento
// especial de dificuldade para os bosses, so o intervalo e diferente.
const MONSTER_LEVEL_STEP = 3;
const BOSS_LEVEL_STEP = 10;

// Lista gerada ate este nivel; simples de aumentar mais tarde
const MAX_LEVEL_TO_GENERATE = 60;

const monstersListEl = document.getElementById("monsters-list");

function generateCreatures() {
  const creatures = [];

  for (let lvl = MONSTER_LEVEL_STEP; lvl <= MAX_LEVEL_TO_GENERATE; lvl += MONSTER_LEVEL_STEP) {
    if (lvl % BOSS_LEVEL_STEP === 0) continue; // nivel reservado para o boss
    creatures.push({ level: lvl, name: `Monstro Nível ${lvl}`, isBoss: false });
  }

  for (let lvl = BOSS_LEVEL_STEP; lvl <= MAX_LEVEL_TO_GENERATE; lvl += BOSS_LEVEL_STEP) {
    creatures.push({ level: lvl, name: `Boss Nível ${lvl}`, isBoss: true });
  }

  creatures.sort((a, b) => a.level - b.level || (a.isBoss ? 1 : -1));
  return creatures;
}

// Bosses estao sempre desbloqueados; monstros normais exigem que o
// personagem ja tenha alcancado o nivel correspondente
function isCreatureUnlocked(creature, characterLevel) {
  return creature.isBoss || characterLevel >= creature.level;
}

function renderMonsters() {
  const characterLevel = getLevelInfo(getLifetimeDistanceM()).level;
  const creatures = generateCreatures();

  monstersListEl.innerHTML = "";

  creatures.forEach((creature) => {
    const unlocked = isCreatureUnlocked(creature, characterLevel);
    const statValue = computeStatValue(creature.level);

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
      detail.textContent = `Vida: ${statValue} · Ataque: ${statValue} · Defesa: ${statValue}`;
    } else {
      detail.className = "monster-locked-label";
      detail.textContent = `Bloqueado — nível ${creature.level} necessário`;
    }
    item.appendChild(detail);

    monstersListEl.appendChild(item);
  });
}

renderMonsters();
