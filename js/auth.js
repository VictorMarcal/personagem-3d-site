// Login obrigatorio via Google (Supabase Auth). A partir daqui o Supabase
// e a fonte de verdade do progresso (personagem.*); o localStorage passa a
// ser cache/buffer offline. Corre antes de main.js e dos restantes ficheiros
// de jogo, mas o boot real e assincrono (ver fim do ficheiro) - por isso
// pode chamar getters/funcoes definidas nesses ficheiros sem problema, uma
// vez que so o faz depois de todos os scripts terem corrido.
const SUPABASE_URL = "https://vnqjaepjfqlhgmlrhzlr.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_5o0ebiPFcC8jKjQbpbok2A_p1ozZMEz";
const SYNC_PENDING_KEY = "sync.pendingPush";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const authModalEl = document.getElementById("auth-modal");
const namePickerModalEl = document.getElementById("name-picker-modal");
const namePickerInputEl = document.getElementById("name-picker-input");
const btnNamePickerConfirm = document.getElementById("btn-name-picker-confirm");
const namePickerStatusEl = document.getElementById("name-picker-status");
const leaderboardListEl = document.getElementById("leaderboard-list");

let currentUserId = null;
let currentProfile = null;
let bootstrapped = false;
let syncTimeoutId = null;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hideAuthModal() {
  authModalEl.classList.add("hidden");
}

document.getElementById("btn-google-signin").addEventListener("click", () => {
  // URL limpo (sem query/hash) - se o clique acontecer depois de um erro
  // anterior deixar #error=... ou ?error=... na barra de endereco, usar
  // window.location.href arrastaria esse lixo para o redirect final e
  // misturava-o com o token novo, impedindo o supabase-js de o interpretar.
  const cleanRedirectUrl = window.location.origin + window.location.pathname;
  supabaseClient.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: cleanRedirectUrl },
  });
});

// --- Sincronizacao continua com o Supabase -------------------------------

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
    last_awarded_quarters: getLastAwardedQuarters(),
    defeated_levels: getDefeatedLevels(),
    unlocked_achievements: getUnlockedAchievements(),
    best_session_distance_m: getBestSessionDistanceM(),
    total_trainings_completed: getTotalTrainingsCompleted(),
  };
}

function currentDisplayName() {
  return (currentProfile && currentProfile.display_name) || "Jogador";
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
function queueProgressSync() {
  if (!currentUserId) return;
  if (syncTimeoutId) clearTimeout(syncTimeoutId);
  syncTimeoutId = setTimeout(syncProgressToSupabase, 400);
}

window.addEventListener("online", () => {
  if (localStorage.getItem(SYNC_PENDING_KEY) === "true") {
    queueProgressSync();
  }
});

// --- Leaderboard ----------------------------------------------------------

function createLeaderboardRowEl(row, rank, isOwn) {
  const el = document.createElement("div");
  el.className = "leaderboard-row" + (isOwn ? " own" : "");

  const rankEl = document.createElement("span");
  rankEl.className = "leaderboard-rank";
  rankEl.textContent = `#${rank}`;

  const nameEl = document.createElement("span");
  nameEl.className = "leaderboard-name";
  nameEl.textContent = row.display_name;

  const distEl = document.createElement("span");
  distEl.className = "leaderboard-distance";
  distEl.textContent = `${Math.round(row.lifetime_distance_m)} m`;

  el.append(rankEl, nameEl, distEl);
  return el;
}

async function renderLeaderboardCard() {
  if (!leaderboardListEl) return;

  const { data: top, error } = await supabaseClient
    .from("leaderboard")
    .select("user_id, display_name, lifetime_distance_m")
    .order("lifetime_distance_m", { ascending: false })
    .limit(10);

  if (error || !top) {
    leaderboardListEl.innerHTML = '<p class="debug-status">Não foi possível carregar o leaderboard.</p>';
    return;
  }

  leaderboardListEl.innerHTML = "";
  top.forEach((row, index) => {
    leaderboardListEl.appendChild(createLeaderboardRowEl(row, index + 1, row.user_id === currentUserId));
  });

  const isOwnInTop = top.some((row) => row.user_id === currentUserId);
  if (isOwnInTop || !currentUserId) return;

  const { data: allRows } = await supabaseClient
    .from("leaderboard")
    .select("user_id, display_name, lifetime_distance_m")
    .order("lifetime_distance_m", { ascending: false });

  if (!allRows) return;
  const ownIndex = allRows.findIndex((row) => row.user_id === currentUserId);
  if (ownIndex === -1) return;

  const divider = document.createElement("p");
  divider.className = "leaderboard-divider";
  divider.textContent = "···";
  leaderboardListEl.appendChild(divider);
  leaderboardListEl.appendChild(createLeaderboardRowEl(allRows[ownIndex], ownIndex + 1, true));
}

// --- Gate do card de Debug --------------------------------------------------

function applyAdminGate() {
  if (currentProfile && currentProfile.is_admin) {
    document.getElementById("debug-card").classList.remove("hidden");
  }
}

// --- Primeiro login: perfil, nome, migracao/hidratacao do progresso -------

// O trigger on_auth_user_created cria a linha em profiles no momento do
// signup, mas o cliente pode chegar aqui antes de essa escrita "assentar" -
// tenta algumas vezes com um pequeno intervalo antes de desistir.
async function fetchOrWaitForProfile(userId) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data } = await supabaseClient.from("profiles").select("*").eq("id", userId).maybeSingle();
    if (data) return data;
    await delay(300);
  }
  throw new Error("Perfil não encontrado após várias tentativas.");
}

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

  await supabaseClient.from("player_progress").insert({ user_id: userId, ...snapshot });
  await supabaseClient.from("leaderboard").upsert({
    user_id: userId,
    display_name: existingDisplayName || "Jogador",
    lifetime_distance_m: snapshot.lifetime_distance_m,
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
  localStorage.setItem(STORAGE_KEYS_EQUIPMENT.ultimoQuartoPremiado, String(progress.last_awarded_quarters));
  localStorage.setItem(STORAGE_KEY_DEFEATED_CREATURES, JSON.stringify(progress.defeated_levels || []));
  localStorage.setItem(STORAGE_KEY_UNLOCKED_ACHIEVEMENTS, JSON.stringify(progress.unlocked_achievements || {}));
  localStorage.setItem(STORAGE_KEY_BEST_SESSION_DISTANCE_M, String(progress.best_session_distance_m));
  localStorage.setItem(STORAGE_KEY_TOTAL_TRAININGS, String(progress.total_trainings_completed));
}

// Sem botao de cancelar - so fecha depois de um nome valido e unico ser
// gravado. Resolve a promise so nesse momento.
function promptForDisplayName(userId) {
  return new Promise((resolve) => {
    namePickerModalEl.classList.remove("hidden");

    function updateButtonState() {
      btnNamePickerConfirm.disabled = namePickerInputEl.value.trim().length === 0;
    }

    async function onConfirm() {
      const name = namePickerInputEl.value.trim();
      if (!name) return;

      btnNamePickerConfirm.disabled = true;
      namePickerStatusEl.textContent = "";

      const { error } = await supabaseClient.from("profiles").update({ display_name: name }).eq("id", userId);

      if (error) {
        btnNamePickerConfirm.disabled = false;
        namePickerStatusEl.textContent =
          error.code === "23505" ? "Esse nome já está a ser usado. Tenta outro." : "Não foi possível guardar. Tenta novamente.";
        return;
      }

      currentProfile.display_name = name;
      namePickerModalEl.classList.add("hidden");
      btnNamePickerConfirm.removeEventListener("click", onConfirm);
      namePickerInputEl.removeEventListener("input", updateButtonState);
      resolve();
    }

    namePickerInputEl.addEventListener("input", updateButtonState);
    btnNamePickerConfirm.addEventListener("click", onConfirm);
    updateButtonState();
  });
}

async function bootstrapAfterLogin(user) {
  currentUserId = user.id;

  const profile = await fetchOrWaitForProfile(user.id);
  currentProfile = profile;

  const progress = await fetchProgress(user.id);
  if (!progress) {
    await migrateLocalProgressToSupabase(user.id, profile.display_name);
  } else {
    hydrateLocalStorageFromProgress(progress);
  }

  if (!profile.display_name) {
    await promptForDisplayName(user.id);
  }

  // Re-renderiza tudo com os dados hidratados/migrados (funcao existente em
  // js/debug.js) e so entao mostra o leaderboard e liberta o Debug.
  refreshAllAfterConfigChange();
  renderLeaderboardCard();
  applyAdminGate();

  if (localStorage.getItem(SYNC_PENDING_KEY) === "true") {
    queueProgressSync();
  }
}

supabaseClient.auth.onAuthStateChange((_event, session) => {
  if (!session) return;
  hideAuthModal();
  if (bootstrapped) return;
  bootstrapped = true;
  bootstrapAfterLogin(session.user).catch((err) => {
    console.error("Falha ao preparar sessão após login:", err);
  });
});
