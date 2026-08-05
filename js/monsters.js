// Duas camadas de criaturas: Mini-Bosses a cada MINIBOSS_LEVEL_STEP niveis,
// Bosses a cada BOSS_LEVEL_STEP (sem monstros "normais" entre elas). Niveis
// de boss tem prioridade sobre mini-boss (nunca ha sobreposicao). Passos/
// limites ajustaveis no card de Debug (js/debug.js).
//
// Cada criatura tem tambem um arquetipo (CREATURE_ARCHETYPES) que multiplica
// os 3 status base (computeStatValue, de equipment.js) de forma desigual -
// em vez de todos os monstros crescerem sempre na mesma proporcao, uns sao
// mais "tanque" (muita Vida/Defesa, pouco Ataque), outros mais agressivos
// (muito Ataque, pouca Defesa), etc. Isto obriga a variar a build consoante
// o adversario, em vez de uma unica distribuicao de pontos servir sempre
// para todos (testado por simulacao antes de implementar).
const monstersListEl = document.getElementById("monsters-list");

const CREATURE_ARCHETYPES = [
  { name: "Equilibrado", mult: { vida: 1.0, ataque: 1.0, defesa: 1.0 } },
  { name: "Tanque", mult: { vida: 1.2, ataque: 0.85, defesa: 1.2 } },
  { name: "Glass Cannon", mult: { vida: 0.8, ataque: 1.35, defesa: 0.7 } },
  { name: "Bruiser", mult: { vida: 1.05, ataque: 1.15, defesa: 0.85 } },
  { name: "Fortaleza", mult: { vida: 0.95, ataque: 0.85, defesa: 1.45 } },
];

// Ataque/Defesa continuam desconhecidos ate se lutar (ver renderMonsters) -
// o arquetipo tambem nao e mostrado ao jogador, so se sente a diferenca a
// lutar, na mesma logica de misterio ja usada para os outros status.
function computeCreatureStatValue(type, creature) {
  return Math.round(computeStatValue(type, creature.level) * creature.archetype.mult[type]);
}

// STORAGE_KEY_DEFEATED_CREATURES esta definida em js/storage-keys.js

// Nomes fixos, por ordem (o 1o mini-boss/boss gerado leva o 1o nome, etc.).
// Tema: obstaculos mentais ao progresso, cada mini-boss e uma forma "menor"
// do boss correspondente (ex: Lethling -> Lethargor). Se o nivel maximo for
// aumentado no Debug para alem de 10 de cada, os extra caem num nome
// generico em vez de partir.
const MINIBOSS_NAMES = ["Lethling", "Vorik", "Exan", "Pregor", "Névon", "Roth", "Confor", "Egor", "Plator", "Discip"];
const BOSS_NAMES = [
  "Lethargor, Senhor da Inércia",
  "Vorath, Devorador de Vontade",
  "Exauron, o Falso Exausto",
  "Pregorath, Rei da Preguiça",
  "Névoris, Ceifador da Esperança",
  "Rothar, Rei da Rotina",
  "Conforth, Tirano do Conforto",
  "Egorath, Imperador do Ego",
  "Platorex, Titã do Platô",
  "Disciplion, Guardião Eterno",
];

function generateCreatures() {
  const miniBossStep = getMiniBossLevelStep();
  const bossStep = getBossLevelStep();
  const maxLevel = getMaxLevelToGenerate();
  const creatures = [];

  let miniBossIndex = 0;
  for (let lvl = miniBossStep; lvl <= maxLevel; lvl += miniBossStep) {
    if (lvl % bossStep === 0) continue; // nivel reservado para o boss
    const name = MINIBOSS_NAMES[miniBossIndex] || `Mini-Boss Nível ${lvl}`;
    creatures.push({ level: lvl, name, isBoss: false, isMiniBoss: true });
    miniBossIndex += 1;
  }

  let bossIndex = 0;
  for (let lvl = bossStep; lvl <= maxLevel; lvl += bossStep) {
    const name = BOSS_NAMES[bossIndex] || `Boss Nível ${lvl}`;
    creatures.push({ level: lvl, name, isBoss: true, isMiniBoss: false });
    bossIndex += 1;
  }

  creatures.sort((a, b) => a.level - b.level || (a.isBoss ? 1 : -1));
  creatures.forEach((creature, index) => {
    creature.archetype = CREATURE_ARCHETYPES[index % CREATURE_ARCHETYPES.length];
  });
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

// Criaturas com que o jogador ja entrou em combate pelo menos uma vez
// (ganhando ou perdendo) - a Vida so e revelada no card depois disto,
// Ataque/Defesa ficam sempre desconhecidos (mistério deliberado).
function getEncounteredLevels() {
  const raw = localStorage.getItem(STORAGE_KEY_ENCOUNTERED_CREATURES);
  try {
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function isCreatureEncountered(level) {
  return getEncounteredLevels().includes(level);
}

function markCreatureEncountered(level) {
  const encountered = getEncounteredLevels();
  if (!encountered.includes(level)) {
    encountered.push(level);
    localStorage.setItem(STORAGE_KEY_ENCOUNTERED_CREATURES, JSON.stringify(encountered));
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

// So mexe no scroll da pagina e so quando o "proximo a derrotar" muda de
// facto - evita que re-renderizacoes frequentes (ex: a cada tick da
// simulacao de distancia) fiquem a repor a posicao e a "saltar" a pagina
let lastCenteredNextIndex = null;

function scrollNextTargetIntoView() {
  const nextTargetEl = monstersListEl.querySelector(".next-target");
  if (!nextTargetEl) return;
  nextTargetEl.scrollIntoView({ block: "center" });
}

// Lista vertical com um card por criatura (todos os mini-bosses/bosses
// gerados, sem janela/limite de itens visiveis).
function renderMonsters() {
  const creatures = generateCreatures();
  const nextIndex = findNextToDefeatIndex(creatures);

  monstersListEl.innerHTML = "";

  creatures.forEach((creature, index) => {
    const unlocked = isCreatureUnlocked(creature, creatures, index);
    const defeated = isCreatureDefeated(creature.level);
    const encountered = isCreatureEncountered(creature.level);
    const vidaValue = computeCreatureStatValue("vida", creature);

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
      // Ataque/Defesa ficam sempre desconhecidos - so a Vida e revelada,
      // e so depois de uma primeira entrada em combate com a criatura.
      detail.textContent = `Vida: ${encountered ? vidaValue : "****"}`;
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
    scrollNextTargetIntoView();
    lastCenteredNextIndex = nextIndex;
  }
}

renderMonsters();
