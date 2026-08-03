// Sincronizacao continua do progresso do jogador com o Supabase
// (player_progress + leaderboard). Depende de globais definidas em
// js/auth.js (supabaseClient, currentUserId, readyForSync,
// currentDisplayName) - carrega-se a seguir a esse ficheiro.
const SYNC_PENDING_KEY = "sync.pendingPush";

let syncTimeoutId = null;

// Le o estado atual via os getters ja existentes (equipment/experience/
// monsters/achievements), que a esta altura (chamado sempre de forma
// assincrona) estao garantidamente definidos.
function readLocalProgressSnapshot() {
  return {
    lifetime_distance_m: getLifetimeDistanceM(),
    unspent_points: getUnspentPoints(),
    equip_level_vida: getEquipLevel("vida"),
    equip_level_ataque: getEquipLevel("ataque"),
    equip_level_defesa: getEquipLevel("defesa"),
    last_awarded_level: getLastAwardedLevel(),
    defeated_creatures: getDefeatedCreaturesMap(),
    encountered_creatures: getEncounteredLevels(),
    unlocked_achievements: getUnlockedAchievements(),
    best_session_distance_m: getBestSessionDistanceM(),
    total_trainings_completed: getTotalTrainingsCompleted(),
    best_pace_mps: getBestPaceMps(),
    best_streak_days: getBestStreakDays(),
    discarded_speed_distance_m: getDiscardedSpeedDistanceM(),
  };
}

async function syncProgressToSupabase() {
  if (!currentUserId) return;
  const snapshot = readLocalProgressSnapshot();
  const nowIso = new Date().toISOString();

  const { error: progressError } = await supabaseClient
    .from("player_progress")
    .upsert({ user_id: currentUserId, ...snapshot, updated_at: nowIso });

  const { error: leaderboardError } = await supabaseClient
    .from("leaderboard")
    .upsert({
      user_id: currentUserId,
      display_name: currentDisplayName(),
      lifetime_distance_m: snapshot.lifetime_distance_m,
      monthly_distance_m: getMonthlyDistanceM(),
      month_reference: getMonthReference(),
      updated_at: nowIso,
    });

  if (progressError || leaderboardError) {
    localStorage.setItem(SYNC_PENDING_KEY, "true");
    console.warn("Falha ao sincronizar progresso com o Supabase, tenta de novo mais tarde.", progressError || leaderboardError);
    return;
  }

  localStorage.removeItem(SYNC_PENDING_KEY);
  renderLeaderboardCard();
}

// Debounce de ~400ms: uma rajada de mutacoes (ex: fim de um treino) so
// gera um pedido de rede, com o estado final consolidado.
//
// SYNC_PENDING_KEY e marcado aqui, de imediato e de forma otimista - ANTES
// do debounce sequer disparar - e nao so dentro de syncProgressToSupabase
// quando a rede falha. Sem isto, uma mutacao seguida de um refresh/fecho da
// aba antes dos 400ms (ou da rede) completarem nunca chegava a marcar nada
// como pendente; no arranque seguinte, bootstrapAfterLogin() (js/auth.js)
// hidratava o localStorage a partir do Supabase e apagava essa mutacao em
// silencio, sem qualquer erro visivel - o jogador simplesmente via os
// pontos/nivel voltarem atras. Removido de volta so depois de uma
// sincronizacao com sucesso (syncProgressToSupabase abaixo).
function queueProgressSync() {
  if (!currentUserId || !readyForSync) return;
  localStorage.setItem(SYNC_PENDING_KEY, "true");
  if (syncTimeoutId) clearTimeout(syncTimeoutId);
  syncTimeoutId = setTimeout(syncProgressToSupabase, 400);
}

window.addEventListener("online", () => {
  if (localStorage.getItem(SYNC_PENDING_KEY) === "true") {
    queueProgressSync();
  }
});

async function fetchProgress(userId) {
  const { data, error } = await supabaseClient
    .from("player_progress")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.error("Erro ao carregar progresso:", error);
    return null;
  }
  return data;
}

// Primeira sincronizacao desta conta (em qualquer dispositivo): sobe o
// estado local atual (existente ou vazio, tanto serve) para o Supabase.
async function migrateLocalProgressToSupabase(userId, existingDisplayName) {
  const snapshot = readLocalProgressSnapshot();

  // upsert (nao insert): se uma sincronizacao em segundo plano ja tiver
  // criado esta linha entretanto, isto so a atualiza em vez de falhar por
  // duplicado - a migracao tem de ser segura a repetir.
  await supabaseClient.from("player_progress").upsert({ user_id: userId, ...snapshot });
  await supabaseClient.from("leaderboard").upsert({
    user_id: userId,
    display_name: existingDisplayName || "Jogador",
    lifetime_distance_m: snapshot.lifetime_distance_m,
    monthly_distance_m: getMonthlyDistanceM(),
    month_reference: getMonthReference(),
  });

  return snapshot;
}

// Jogador a repetir login (possivelmente noutro dispositivo): o Supabase
// e a fonte de verdade, sobrescreve o localStorage para o resto do codigo
// continuar a funcionar sem alteracoes.
function hydrateLocalStorageFromProgress(progress) {
  localStorage.setItem(STORAGE_KEY_LIFETIME_M, String(progress.lifetime_distance_m));
  localStorage.setItem(STORAGE_KEYS_EQUIPMENT.pontosDisponiveis, String(progress.unspent_points));
  localStorage.setItem(STORAGE_KEYS_EQUIPMENT.nivelEquipVida, String(progress.equip_level_vida));
  localStorage.setItem(STORAGE_KEYS_EQUIPMENT.nivelEquipAtaque, String(progress.equip_level_ataque));
  localStorage.setItem(STORAGE_KEYS_EQUIPMENT.nivelEquipDefesa, String(progress.equip_level_defesa));
  localStorage.setItem(STORAGE_KEYS_EQUIPMENT.ultimoNivelPremiado, String(progress.last_awarded_level));
  localStorage.setItem(STORAGE_KEY_DEFEATED_CREATURES, JSON.stringify(progress.defeated_creatures || {}));
  localStorage.setItem(STORAGE_KEY_ENCOUNTERED_CREATURES, JSON.stringify(progress.encountered_creatures || []));
  localStorage.setItem(STORAGE_KEY_UNLOCKED_ACHIEVEMENTS, JSON.stringify(progress.unlocked_achievements || {}));
  localStorage.setItem(STORAGE_KEY_BEST_SESSION_DISTANCE_M, String(progress.best_session_distance_m));
  localStorage.setItem(STORAGE_KEY_TOTAL_TRAININGS, String(progress.total_trainings_completed));
  localStorage.setItem(STORAGE_KEY_BEST_PACE_MPS, String(progress.best_pace_mps || 0));
  localStorage.setItem(STORAGE_KEY_BEST_STREAK_DAYS, String(progress.best_streak_days || 0));
  localStorage.setItem(STORAGE_KEY_DISCARDED_SPEED_M, String(progress.discarded_speed_distance_m || 0));
}
