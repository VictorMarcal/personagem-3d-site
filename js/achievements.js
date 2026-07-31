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

// --- Conquistas de frequencia (dependem de training_sessions, so podem --
// --- ser verificadas quando esses dados chegam - ver js/auth.js e --------
// --- js/profile.js) --------------------------------------------------------

// Maior sequencia de dias distintos treinados, recalculada do zero a cada
// verificacao (nao uma sequencia "atual" que se perderia ao parar).
function computeLongestStreakDays(sessions) {
  const dayKeys = [...new Set(sessions.map((s) => formatDayKey(new Date(s.started_at))))].sort();
  let longest = 0;
  let current = 0;
  let prevEpochDay = null;

  dayKeys.forEach((key) => {
    const [y, m, d] = key.split("-").map(Number);
    const epochDay = Math.floor(Date.UTC(y, m - 1, d) / 86400000);
    current = prevEpochDay !== null && epochDay === prevEpochDay + 1 ? current + 1 : 1;
    longest = Math.max(longest, current);
    prevEpochDay = epochDay;
  });

  return longest;
}

function hasTrainedFullCalendarMonth(sessions) {
  const dayKeys = [...new Set(sessions.map((s) => formatDayKey(new Date(s.started_at))))];
  const countByMonth = new Map();
  dayKeys.forEach((key) => {
    const monthKey = key.slice(0, 7);
    countByMonth.set(monthKey, (countByMonth.get(monthKey) || 0) + 1);
  });

  return [...countByMonth.entries()].some(([monthKey, count]) => {
    const [y, m] = monthKey.split("-").map(Number);
    return count === new Date(y, m, 0).getDate();
  });
}

// Sabado E domingo da mesma semana ISO, ambos com treino
function hasActiveWeekend(sessions) {
  const dayKeys = new Set(sessions.map((s) => formatDayKey(new Date(s.started_at))));
  return sessions.some((s) => {
    const weekStart = getStartOfIsoWeek(new Date(s.started_at));
    const sat = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 5);
    const sun = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 6);
    return dayKeys.has(formatDayKey(sat)) && dayKeys.has(formatDayKey(sun));
  });
}

// Chamado sempre que a lista completa de sessoes de treino do jogador
// esta disponivel (login, ou abertura da aba Perfil) - atualiza a cache
// local da sequencia e desbloqueia os eventos binarios diretamente, depois
// reavalia tudo (checkAndUnlockAchievements sem args apanha a sequencia
// via a cache que acabou de ser atualizada).
function checkFrequencyAchievementsFromSessions(sessions) {
  updateBestStreakDaysIfBetter(computeLongestStreakDays(sessions));

  if (hasTrainedFullCalendarMonth(sessions)) unlockAchievement("month_full", Date.now());
  if (hasActiveWeekend(sessions)) unlockAchievement("weekend_warrior", Date.now());

  checkAndUnlockAchievements();
}

// Descricao gerada a partir do tipo/parametros, em vez de texto escrito a
// mao por conquista (evita repeticao para as ~40 conquistas existentes).
function getAchievementDescription(achievement) {
  switch (achievement.type) {
    case "sessionDistance":
      return `Percorre ${formatDistanceKm(achievement.threshold)} numa única sessão de treino.`;
    case "lifetimeDistance":
      return `Acumula ${formatDistanceKm(achievement.threshold)} de distância ao longo da tua vida.`;
    case "trainingCount":
      return `Completa ${achievement.threshold} treino${achievement.threshold > 1 ? "s" : ""}.`;
    case "streak":
      return `Treina em ${achievement.threshold} dias seguidos.`;
    case "fullMonthTrained":
      return "Treina em todos os dias de um mês de calendário.";
    case "activeWeekend":
      return "Treina no sábado e no domingo da mesma semana.";
    case "bossDefeated":
      return `Derrota o Boss do nível ${achievement.level}.`;
    case "creatureStars":
      return `Vence uma luta com ${achievement.threshold} estrelas (vida acima de 50% no fim).`;
    case "allMiniBossesThreeStars":
      return "Consegue 3 estrelas em todos os mini-bosses.";
    case "allBossesThreeStars":
      return "Consegue 3 estrelas em todos os bosses.";
    case "allCreaturesDefeated":
      return "Derrota todos os mini-bosses e bosses pelo menos uma vez.";
    case "leaderboardRank":
      return "Chega ao 1º lugar do leaderboard (fica desbloqueada para sempre).";
    case "monthlyMedal":
      return "Atribuída automaticamente ao top 3 do leaderboard desse mês.";
    case "pace":
      return `Percorre ${formatDistanceKm(achievement.distanceM)} em menos de ${Math.round(achievement.maxSeconds / 60)} minutos.`;
    case "personalRecord":
      return "Bate o teu próprio recorde de ritmo numa sessão (a partir da 2ª sessão).";
    default:
      return "";
  }
}

function formatAchievementProgressText(achievement, progress, unlocked) {
  if (unlocked) return "Desbloqueada!";
  if (achievement.type === "sessionDistance" || achievement.type === "lifetimeDistance") {
    return `Progresso: ${formatDistanceKm(progress.current)} / ${formatDistanceKm(progress.target)}`;
  }
  if (progress.target > 1) {
    return `Progresso: ${Math.round(progress.current)} / ${progress.target}`;
  }
  return "Ainda não desbloqueada.";
}

function openAchievementDetail(achievement) {
  const unlocked = isAchievementUnlocked(achievement.id);
  const progress = getAchievementProgress(achievement);

  document.getElementById("achievement-detail-icon").textContent = achievement.icon;
  document.getElementById("achievement-detail-name").textContent = achievement.name;
  document.getElementById("achievement-detail-description").textContent = getAchievementDescription(achievement);
  document.getElementById("achievement-detail-progress").textContent = formatAchievementProgressText(achievement, progress, unlocked);

  document.getElementById("achievement-detail-modal").classList.remove("hidden");
}

function closeAchievementDetail() {
  document.getElementById("achievement-detail-modal").classList.add("hidden");
}

document.getElementById("btn-close-achievement-detail").addEventListener("click", closeAchievementDetail);
document.getElementById("achievement-detail-modal").addEventListener("click", (event) => {
  if (event.target.id === "achievement-detail-modal") closeAchievementDetail();
});

function createAchievementItemEl(achievement) {
  const unlocked = isAchievementUnlocked(achievement.id);

  const item = document.createElement("div");
  item.className = "achievement-item " + (unlocked ? "unlocked" : "locked");
  item.addEventListener("click", () => openAchievementDetail(achievement));

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

// Agrupa por categoria (CATEGORY_BY_TYPE), preservando CATEGORY_ORDER;
// tipos sem categoria conhecida caem em "Outros" no fim.
function groupAchievementsByCategory(list) {
  const grouped = new Map();
  CATEGORY_ORDER.forEach((category) => grouped.set(category, []));

  list.forEach((achievement) => {
    const category = CATEGORY_BY_TYPE[achievement.type] || "Outros";
    if (!grouped.has(category)) grouped.set(category, []);
    grouped.get(category).push(achievement);
  });

  return grouped;
}

// So o popup completo fica organizado por categorias - o resumo pequeno
// (5 conquistas) fica plano, ja que agrupar tao poucos itens em varias
// secções ficaria esparso e contraria o objetivo de relance rápido.
function renderAchievementsFull() {
  const gridEl = document.getElementById("achievements-grid-full");
  gridEl.innerHTML = "";

  groupAchievementsByCategory(getAllAchievements()).forEach((items, category) => {
    if (items.length === 0) return;

    const title = document.createElement("h3");
    title.className = "achievement-category-title";
    title.textContent = category;
    gridEl.appendChild(title);

    const sectionGrid = document.createElement("div");
    sectionGrid.className = "achievements-grid";
    items.forEach((achievement) => sectionGrid.appendChild(createAchievementItemEl(achievement)));
    gridEl.appendChild(sectionGrid);
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
