// Sistema de conquistas. Cada uma tem um tipo e uma meta; o progresso e
// calculado a partir de dados ja existentes (monstros derrotados) ou de
// dados proprios (melhor distancia numa so sessao, numero de treinos).
// As conquistas de ritmo (pace) sao eventos binarios verificados no
// momento em que um treino termina.
// STORAGE_KEY_UNLOCKED_ACHIEVEMENTS / STORAGE_KEY_BEST_SESSION_DISTANCE_M /
// STORAGE_KEY_TOTAL_TRAININGS estao definidas em js/storage-keys.js

const STATIC_ACHIEVEMENTS = [
  { id: "dist_1km", name: "1 km seguido", icon: "🏃", type: "sessionDistance", threshold: 1000 },
  { id: "dist_5km", name: "5 km seguidos", icon: "🏃", type: "sessionDistance", threshold: 5000 },
  { id: "dist_10km", name: "10 km seguidos", icon: "🏃", type: "sessionDistance", threshold: 10000 },
  { id: "dist_half_marathon", name: "Meia Maratona", icon: "🥈", type: "sessionDistance", threshold: 21097 },
  { id: "dist_marathon", name: "Maratonista", icon: "🏅", type: "sessionDistance", threshold: 42195 },
  { id: "trainings_1", name: "1 Treino", icon: "🎯", type: "trainingCount", threshold: 1 },
  { id: "trainings_5", name: "5 Treinos", icon: "🎯", type: "trainingCount", threshold: 5 },
  { id: "trainings_10", name: "10 Treinos", icon: "🎯", type: "trainingCount", threshold: 10 },
  { id: "trainings_25", name: "25 Treinos", icon: "🎯", type: "trainingCount", threshold: 25 },
  { id: "trainings_50", name: "50 Treinos", icon: "🎯", type: "trainingCount", threshold: 50 },
  { id: "pace_5km_25min", name: "5km em menos de 25 min", icon: "⚡", type: "pace", distanceM: 5000, maxSeconds: 25 * 60 },
  { id: "pace_10km_50min", name: "10km em menos de 50 min", icon: "⚡", type: "pace", distanceM: 10000, maxSeconds: 50 * 60 },
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

function getAllAchievements() {
  return [...STATIC_ACHIEVEMENTS, ...generateBossAchievements()];
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
    case "pace": {
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
