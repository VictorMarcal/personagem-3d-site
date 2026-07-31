// Login obrigatorio via Google (Supabase Auth). A partir daqui o Supabase
// e a fonte de verdade do progresso (personagem.*); o localStorage passa a
// ser cache/buffer offline. Corre antes de main.js e dos restantes ficheiros
// de jogo, mas o boot real e assincrono (ver fim do ficheiro) - por isso
// pode chamar getters/funcoes definidas nesses ficheiros sem problema, uma
// vez que so o faz depois de todos os scripts terem corrido.
const SUPABASE_URL = "https://vnqjaepjfqlhgmlrhzlr.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_5o0ebiPFcC8jKjQbpbok2A_p1ozZMEz";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const authModalEl = document.getElementById("auth-modal");
const namePickerModalEl = document.getElementById("name-picker-modal");
const namePickerInputEl = document.getElementById("name-picker-input");
const btnNamePickerConfirm = document.getElementById("btn-name-picker-confirm");
const namePickerStatusEl = document.getElementById("name-picker-status");
const characterHudNameEl = document.getElementById("character-hud-name");

let currentUserId = null;
let currentProfile = null;
let bootstrapped = false;
// So true depois do arranque pos-login terminar (perfil carregado e
// progresso migrado/hidratado) - evita que uma sincronizacao em segundo
// plano (ex: GPS a ganhar pontos durante o proprio login) crie a linha em
// player_progress antes do passo de migracao, o que fazia esse passo
// falhar por duplicado e travava o resto do arranque a meio.
let readyForSync = false;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hideAuthModal() {
  authModalEl.classList.add("hidden");
}

function currentDisplayName() {
  return (currentProfile && currentProfile.display_name) || "Jogador";
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

// --- Gate do card de Debug e HUD -------------------------------------------

// Mostra o nome escolhido no popup em vez de "Personagem" no HUD do
// personagem 3D - o leaderboard ja usa currentDisplayName() diretamente.
function applyDisplayNameToHud() {
  if (characterHudNameEl && currentProfile && currentProfile.display_name) {
    characterHudNameEl.textContent = currentProfile.display_name;
  }
}

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

// Cada passo tem o seu proprio try/catch: uma falha (ex: rede instavel no
// telemovel a meio do login) nunca deve impedir os passos seguintes de
// correr - em particular, refreshAllAfterConfigChange() no fim tem de
// correr sempre que o perfil foi carregado, para os cartoes de Monstros/
// Conquistas nunca ficarem vazios por causa de um erro noutro passo.
// migrateLocalProgressToSupabase/hydrateLocalStorageFromProgress vivem em
// js/progress-sync.js; renderLeaderboardCard em js/leaderboard.js - ambos
// carregados antes deste ficheiro correr esta funcao (so acontece de forma
// assincrona, depois de todos os scripts terem executado).
async function bootstrapAfterLogin(user) {
  currentUserId = user.id;

  let profile;
  try {
    profile = await fetchOrWaitForProfile(user.id);
  } catch (err) {
    console.error("Falha ao carregar perfil:", err);
    return;
  }
  currentProfile = profile;

  try {
    const progress = await fetchProgress(user.id);
    if (!progress) {
      await migrateLocalProgressToSupabase(user.id, profile.display_name);
    } else {
      hydrateLocalStorageFromProgress(progress);
    }
  } catch (err) {
    console.error("Falha ao migrar/hidratar progresso:", err);
  }

  if (!profile.display_name) {
    try {
      await promptForDisplayName(user.id);
    } catch (err) {
      console.error("Falha ao guardar nome:", err);
    }
  }

  readyForSync = true;
  applyDisplayNameToHud();

  // Re-renderiza tudo com os dados hidratados/migrados (funcao existente em
  // js/debug.js) - corre sempre, mesmo que os passos acima tenham falhado.
  refreshAllAfterConfigChange();

  try {
    renderLeaderboardCard();
  } catch (err) {
    console.error("Falha ao carregar leaderboard:", err);
  }

  applyAdminGate();

  // Unica busca dedicada so para conquistas: sequencias/mes completo/fim-
  // de-semana ativo dependem do historico completo de sessoes, que de
  // outra forma so seria verificado se a aba Perfil fosse aberta.
  try {
    const { data: sessions } = await supabaseClient
      .from("training_sessions")
      .select("started_at, distance_m, duration_seconds")
      .eq("user_id", user.id)
      .order("started_at");
    if (sessions) checkFrequencyAchievementsFromSessions(sessions);
  } catch (err) {
    console.error("Falha ao verificar conquistas de frequência:", err);
  }

  try {
    await checkMonthlyRollover();
    // Se o mes acabou de virar para este jogador, o leaderboard mensal
    // renderizado acima (antes do rollover) ainda mostraria a distancia
    // zerada/antiga - renderiza de novo para refletir o mes corrente.
    renderLeaderboardCard();
  } catch (err) {
    console.error("Falha ao verificar medalhas mensais:", err);
  }

  if (localStorage.getItem(SYNC_PENDING_KEY) === "true") {
    queueProgressSync();
  }
  flushTrainingSessionQueue();
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
