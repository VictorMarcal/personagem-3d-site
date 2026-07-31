// Sistema de conquistas. Cada uma tem um tipo e uma meta; o progresso e
// calculado a partir de dados ja existentes (monstros derrotados) ou de
// dados proprios (melhor distancia numa so sessao, numero de treinos).
// As conquistas de ritmo (pace) sao eventos binarios verificados no
// momento em que um treino termina.
// STORAGE_KEY_UNLOCKED_ACHIEVEMENTS / STORAGE_KEY_BEST_SESSION_DISTANCE_M /
// STORAGE_KEY_TOTAL_TRAININGS estao definidas em js/storage-keys.js

// Categoria de cada tipo de conquista, usada para agrupar o popup "Ver
// todas" (js/achievements.js renderAchievementsFull). Um lookup por tipo
// em vez de um campo por conquista, ja que type->categoria e sempre 1:1.
const CATEGORY_BY_TYPE = {
  sessionDistance: "Distância",
  lifetimeDistance: "Distância",
  trainingCount: "Frequência",
  streak: "Frequência",
  fullMonthTrained: "Frequência",
  activeWeekend: "Frequência",
  bossDefeated: "Combate",
  creatureStars: "Combate",
  allMiniBossesThreeStars: "Combate",
  allBossesThreeStars: "Combate",
  allCreaturesDefeated: "Combate",
  leaderboardRank: "Liderança",
  monthlyMedal: "Liderança",
  pace: "Ritmo",
  personalRecord: "Ritmo",
};
const CATEGORY_ORDER = ["Distância", "Frequência", "Combate", "Liderança", "Ritmo"];

const STATIC_ACHIEVEMENTS = [
  { id: "dist_1km", name: "1 km seguido", icon: "🏃", type: "sessionDistance", threshold: 1000 },
  { id: "dist_5km", name: "5 km seguidos", icon: "🏃", type: "sessionDistance", threshold: 5000 },
  { id: "dist_10km", name: "10 km seguidos", icon: "🏃", type: "sessionDistance", threshold: 10000 },
  { id: "dist_half_marathon", name: "Meia Maratona", icon: "🥈", type: "sessionDistance", threshold: 21097 },
  { id: "dist_marathon", name: "Maratonista", icon: "🏅", type: "sessionDistance", threshold: 42195 },
  { id: "dist_lifetime_50km", name: "50 km vitalícios", icon: "🌍", type: "lifetimeDistance", threshold: 50000 },
  { id: "dist_lifetime_100km", name: "100 km vitalícios", icon: "🌍", type: "lifetimeDistance", threshold: 100000 },
  { id: "dist_lifetime_500km", name: "500 km vitalícios", icon: "🌍", type: "lifetimeDistance", threshold: 500000 },
  { id: "dist_lifetime_1000km", name: "1000 km vitalícios", icon: "🌍", type: "lifetimeDistance", threshold: 1000000 },
  { id: "trainings_1", name: "1 Treino", icon: "🎯", type: "trainingCount", threshold: 1 },
  { id: "trainings_5", name: "5 Treinos", icon: "🎯", type: "trainingCount", threshold: 5 },
  { id: "trainings_10", name: "10 Treinos", icon: "🎯", type: "trainingCount", threshold: 10 },
  { id: "trainings_25", name: "25 Treinos", icon: "🎯", type: "trainingCount", threshold: 25 },
  { id: "trainings_50", name: "50 Treinos", icon: "🎯", type: "trainingCount", threshold: 50 },
  { id: "streak_3", name: "3 dias seguidos", icon: "🔥", type: "streak", threshold: 3 },
  { id: "streak_7", name: "7 dias seguidos", icon: "🔥", type: "streak", threshold: 7 },
  { id: "streak_30", name: "30 dias seguidos", icon: "🔥", type: "streak", threshold: 30 },
  { id: "month_full", name: "Mês completo", icon: "📅", type: "fullMonthTrained" },
  { id: "weekend_warrior", name: "Fim de semana ativo", icon: "🏖️", type: "activeWeekend" },
  { id: "combat_first_3star", name: "Vitória perfeita", icon: "⭐", type: "creatureStars", threshold: 3 },
  { id: "combat_all_minibosses_3star", name: "Mestre dos Mini-Bosses", icon: "🌟", type: "allMiniBossesThreeStars" },
  { id: "combat_all_bosses_3star", name: "Lenda dos Bosses", icon: "🌟", type: "allBossesThreeStars" },
  { id: "combat_all_defeated", name: "Todas as criaturas derrotadas", icon: "👑", type: "allCreaturesDefeated" },
  { id: "leaderboard_rank1", name: "Nº 1 do Leaderboard", icon: "🥇", type: "leaderboardRank" },
  { id: "pace_5km_25min", name: "5km em menos de 25 min", icon: "⚡", type: "pace", distanceM: 5000, maxSeconds: 25 * 60 },
  { id: "pace_10km_50min", name: "10km em menos de 50 min", icon: "⚡", type: "pace", distanceM: 10000, maxSeconds: 50 * 60 },
  { id: "pace_5km_20min", name: "5km em menos de 20 min", icon: "⚡", type: "pace", distanceM: 5000, maxSeconds: 20 * 60 },
  { id: "pace_10km_45min", name: "10km em menos de 45 min", icon: "⚡", type: "pace", distanceM: 10000, maxSeconds: 45 * 60 },
  { id: "pace_personal_record", name: "Recorde pessoal de ritmo", icon: "🚀", type: "personalRecord" },
];

// Uma conquista por boss, gerada a partir dos mesmos parametros de
// js/monsters.js, para se manterem sempre sincronizados
function generateBossAchievements() {
  const bossStep = getBossLevelStep();
  const maxLevel = getMaxLevelToGenerate();
  const achievements = [];

  for (let lvl = bossStep; lvl <= maxLevel; lvl += bossStep) {
    achievements.push({ id: `boss_${lvl}`, name: `Boss Nível ${lvl}`, icon: "👹", type: "bossDefeated", level: lvl });
  }

  return achievements;
}

const MEDAL_LABEL_BY_TYPE = { gold: "Ouro", silver: "Prata", bronze: "Bronze" };
const MEDAL_ICON_BY_TYPE = { gold: "🥇", silver: "🥈", bronze: "🥉" };
const MONTHLY_MEDAL_ID_PATTERN = /^medal_(gold|silver|bronze)_(\d{4})_(\d{2})$/;

// So aparecem depois de ganhas (js/monthly-medals.js e que as desbloqueia) -
// nao ha "meta" fixa para mostrar antes, ja que depende dos outros jogadores.
function generateMonthlyMedalAchievements() {
  return Object.keys(getUnlockedAchievements())
    .map((id) => ({ id, match: id.match(MONTHLY_MEDAL_ID_PATTERN) }))
    .filter((entry) => entry.match)
    .map(({ id, match }) => {
      const [, medal, year, month] = match;
      return {
        id,
        name: `${MEDAL_LABEL_BY_TYPE[medal]} — ${month}/${year}`,
        icon: MEDAL_ICON_BY_TYPE[medal],
        type: "monthlyMedal",
      };
    });
}

function getAllAchievements() {
  return [...STATIC_ACHIEVEMENTS, ...generateBossAchievements(), ...generateMonthlyMedalAchievements()];
}

function getBestSessionDistanceM() {
  return Number(localStorage.getItem(STORAGE_KEY_BEST_SESSION_DISTANCE_M)) || 0;
}

function updateBestSessionDistanceM(sessionDistanceM) {
  if (sessionDistanceM > getBestSessionDistanceM()) {
    localStorage.setItem(STORAGE_KEY_BEST_SESSION_DISTANCE_M, String(sessionDistanceM));
    queueProgressSync();
  }
}

function getTotalTrainingsCompleted() {
  return Number(localStorage.getItem(STORAGE_KEY_TOTAL_TRAININGS)) || 0;
}

function incrementTotalTrainingsCompleted() {
  localStorage.setItem(STORAGE_KEY_TOTAL_TRAININGS, String(getTotalTrainingsCompleted() + 1));
  queueProgressSync();
}

// Melhor ritmo (m/s) de sempre, numa so sessao - usado so para a conquista
// de recorde pessoal (checkAndUnlockAchievements), nao tem UI propria.
function getBestPaceMps() {
  return Number(localStorage.getItem(STORAGE_KEY_BEST_PACE_MPS)) || 0;
}

function updateBestPaceMpsIfBetter(paceMps) {
  if (paceMps > getBestPaceMps()) {
    localStorage.setItem(STORAGE_KEY_BEST_PACE_MPS, String(paceMps));
    queueProgressSync();
  }
}

// Maior sequencia de dias distintos treinados alguma vez (nao a sequencia
// "atual" - uma vez alcancada uma sequencia de N dias, a conquista fica
// para sempre, mesmo que a sequencia entretanto se quebre). Cache local
// atualizada de forma assincrona por checkFrequencyAchievementsFromSessions,
// lida aqui de forma sincrona como tudo o resto.
function getBestStreakDays() {
  return Number(localStorage.getItem(STORAGE_KEY_BEST_STREAK_DAYS)) || 0;
}

function updateBestStreakDaysIfBetter(days) {
  if (days > getBestStreakDays()) {
    localStorage.setItem(STORAGE_KEY_BEST_STREAK_DAYS, String(days));
    queueProgressSync();
  }
}

function getUnlockedAchievements() {
  const raw = localStorage.getItem(STORAGE_KEY_UNLOCKED_ACHIEVEMENTS);
  try {
    const parsed = raw ? JSON.parse(raw) : {};
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch (e) {
    return {};
  }
}

function isAchievementUnlocked(id) {
  return Object.prototype.hasOwnProperty.call(getUnlockedAchievements(), id);
}

function unlockAchievement(id, unlockedAt) {
  const unlocked = getUnlockedAchievements();
  if (unlocked[id] === undefined) {
    unlocked[id] = unlockedAt;
    localStorage.setItem(STORAGE_KEY_UNLOCKED_ACHIEVEMENTS, JSON.stringify(unlocked));
    queueProgressSync();
  }
}

// Progresso atual de uma conquista (para a barra), quer ja esteja
// desbloqueada quer nao
function getAchievementProgress(achievement) {
  switch (achievement.type) {
    case "sessionDistance": {
      const best = getBestSessionDistanceM();
      return { current: Math.min(best, achievement.threshold), target: achievement.threshold, met: best >= achievement.threshold };
    }
    case "trainingCount": {
      const total = getTotalTrainingsCompleted();
      return { current: Math.min(total, achievement.threshold), target: achievement.threshold, met: total >= achievement.threshold };
    }
    case "bossDefeated": {
      const met = isCreatureDefeated(achievement.level);
      return { current: met ? 1 : 0, target: 1, met };
    }
    case "lifetimeDistance": {
      const total = getLifetimeDistanceM();
      return { current: Math.min(total, achievement.threshold), target: achievement.threshold, met: total >= achievement.threshold };
    }
    case "streak": {
      const best = getBestStreakDays();
      return { current: Math.min(best, achievement.threshold), target: achievement.threshold, met: best >= achievement.threshold };
    }
    case "creatureStars": {
      const defeated = getDefeatedCreaturesMap();
      const best = Object.values(defeated).reduce((max, stars) => Math.max(max, stars), 0);
      return { current: Math.min(best, achievement.threshold), target: achievement.threshold, met: best >= achievement.threshold };
    }
    case "allMiniBossesThreeStars":
    case "allBossesThreeStars": {
      const wantBoss = achievement.type === "allBossesThreeStars";
      const defeated = getDefeatedCreaturesMap();
      const tier = generateCreatures().filter((c) => (wantBoss ? c.isBoss : c.isMiniBoss));
      const threeStarCount = tier.filter((c) => (defeated[c.level] || 0) >= 3).length;
      return { current: threeStarCount, target: tier.length, met: tier.length > 0 && threeStarCount === tier.length };
    }
    case "allCreaturesDefeated": {
      const total = generateCreatures().length;
      const defeatedCount = Object.keys(getDefeatedCreaturesMap()).length;
      return { current: defeatedCount, target: total, met: total > 0 && defeatedCount === total };
    }
    case "pace":
    case "fullMonthTrained":
    case "activeWeekend":
    case "leaderboardRank":
    case "personalRecord":
    case "monthlyMedal": {
      // Eventos binarios sem "progresso" numerico derivavel a qualquer
      // momento (dependem de historico que so e verificado quando os dados
      // relevantes chegam) - o proprio desbloqueio acontece fora deste
      // switch (checkAndUnlockAchievements, checkFrequencyAchievementsFromSessions,
      // js/leaderboard.js, js/monthly-medals.js).
      const met = isAchievementUnlocked(achievement.id);
      return { current: met ? 1 : 0, target: 1, met };
    }
    default:
      return { current: 0, target: 1, met: false };
  }
}

// Chamado depois de um treino terminar (com dados da sessao) ou de uma
// batalha ser vencida (sem argumentos, so para reavaliar bosses)
function checkAndUnlockAchievements(sessionDistanceM, sessionDurationSeconds) {
  const hasSessionData = typeof sessionDistanceM === "number";
  if (hasSessionData) {
    updateBestSessionDistanceM(sessionDistanceM);
  }

  // Recorde pessoal de ritmo: so pode disparar a partir da 2a sessao (a 1a
  // so serve para estabelecer o "anterior" a bater) - compara antes de
  // atualizar o recorde guardado.
  if (hasSessionData && typeof sessionDurationSeconds === "number" && sessionDurationSeconds > 0) {
    const paceMps = sessionDistanceM / sessionDurationSeconds;
    const previousBestPace = getBestPaceMps();
    if (previousBestPace > 0 && paceMps > previousBestPace) {
      unlockAchievement("pace_personal_record", Date.now());
    }
    updateBestPaceMpsIfBetter(paceMps);
  }

  const now = Date.now();
  getAllAchievements().forEach((achievement) => {
    if (isAchievementUnlocked(achievement.id)) return;

    if (achievement.type === "pace") {
      if (
        hasSessionData &&
        typeof sessionDurationSeconds === "number" &&
        sessionDistanceM >= achievement.distanceM &&
        sessionDurationSeconds <= achievement.maxSeconds
      ) {
        unlockAchievement(achievement.id, now);
      }
      return;
    }

    if (getAchievementProgress(achievement).met) {
      unlockAchievement(achievement.id, now);
    }
  });

  renderAchievementsSummary();
}

function createAchievementItemEl(achievement) {
  const unlocked = isAchievementUnlocked(achievement.id);

  const item = document.createElement("div");
  item.className = "achievement-item " + (unlocked ? "unlocked" : "locked");

  const icon = document.createElement("div");
  icon.className = "achievement-icon";
  icon.textContent = achievement.icon;
  item.appendChild(icon);

  const name = document.createElement("div");
  name.className = "achievement-name";
  name.textContent = achievement.name;
  item.appendChild(name);

  return item;
}

// As 5 mais recentes: desbloqueadas primeiro (mais recente primeiro),
// depois preenche com as mais proximas de desbloquear
function renderAchievementsSummary() {
  const summaryEl = document.getElementById("achievements-summary");
  const unlockedMap = getUnlockedAchievements();
  const all = getAllAchievements();

  const unlockedList = all
    .filter((a) => unlockedMap[a.id] !== undefined)
    .sort((a, b) => unlockedMap[b.id] - unlockedMap[a.id]);

  const lockedList = all
    .filter((a) => unlockedMap[a.id] === undefined)
    .map((a) => ({ achievement: a, progress: getAchievementProgress(a) }))
    .sort((a, b) => b.progress.current / b.progress.target - a.progress.current / a.progress.target)
    .map((entry) => entry.achievement);

  const topFive = [...unlockedList, ...lockedList].slice(0, 5);

  summaryEl.innerHTML = "";
  topFive.forEach((achievement) => {
    summaryEl.appendChild(createAchievementItemEl(achievement));
  });
}

function renderAchievementsFull() {
  const gridEl = document.getElementById("achievements-grid-full");
  gridEl.innerHTML = "";
  getAllAchievements().forEach((achievement) => {
    gridEl.appendChild(createAchievementItemEl(achievement));
  });
}

function openAchievementsModal() {
  renderAchievementsFull();
  document.getElementById("achievements-modal").classList.remove("hidden");
}

function closeAchievementsModal() {
  document.getElementById("achievements-modal").classList.add("hidden");
}

document.getElementById("btn-open-achievements").addEventListener("click", openAchievementsModal);
document.getElementById("btn-close-achievements").addEventListener("click", closeAchievementsModal);

renderAchievementsSummary();
