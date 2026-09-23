// Login obrigatorio via Supabase Auth - so email+palavra-passe (2026-09-14;
// existiram tambem Google e Apple entre 2026-09-11 e esta data, removidos a
// pedido). A partir daqui o Supabase e a fonte de verdade do progresso
// (personagem.*); o localStorage passa a ser cache/buffer offline. Corre
// antes de main.js e dos restantes ficheiros de jogo, mas o boot real e
// assincrono (ver fim do ficheiro) - por isso pode chamar getters/funcoes
// definidas nesses ficheiros sem problema, uma vez que so o faz depois de
// todos os scripts terem corrido.
//
// O TRIGGER on_auth_user_created (supabase/schema.sql) e disparado por
// QUALQUER insercao em auth.users - bootstrapAfterLogin abaixo nunca olhou
// para o provider, por isso remover Google/Apple nao mexeu em nada deste
// arranque. Quem tinha conta criada por Google/Apple continua a conseguir
// entrar: "Esqueceste a palavra-passe?" com o mesmo email dessa conta define
// uma palavra-passe nova, independente de como a conta foi criada.
const SUPABASE_URL = "https://vnqjaepjfqlhgmlrhzlr.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_5o0ebiPFcC8jKjQbpbok2A_p1ozZMEz";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const authModalEl = document.getElementById("auth-modal");
const landingViewEl = document.querySelector(".landing");
const loginViewEl = document.getElementById("login-view");
const btnLoginBack = document.getElementById("btn-login-back");
const namePickerModalEl = document.getElementById("name-picker-modal");
const namePickerInputEl = document.getElementById("name-picker-input");
const btnNamePickerConfirm = document.getElementById("btn-name-picker-confirm");
const namePickerStatusEl = document.getElementById("name-picker-status");
const siteTitleEl = document.getElementById("site-title");

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

// Landing (apresentação, sempre a vista por omissão) e login (formulário,
// só depois de um "Criar a minha conta"/"Já tenho conta") separados
// (2026-09-22, a pedido - "separa a landing page do login"): antes o cartão
// de login vivia dentro do herói da landing; agora são dois ecrãs dentro do
// mesmo #auth-modal, um de cada vez.
function showLandingView() {
  loginViewEl.classList.add("hidden");
  landingViewEl.classList.remove("hidden");
  authModalEl.scrollTo({ top: 0 });
}

function showLoginView(mode) {
  landingViewEl.classList.add("hidden");
  loginViewEl.classList.remove("hidden");
  setEmailAuthMode(mode);
  authModalEl.scrollTo({ top: 0 });
}

function currentDisplayName() {
  return (currentProfile && currentProfile.display_name) || "Jogador";
}

// URL limpo (sem query/hash) para o redirect do email de recuperacao de
// palavra-passe - se o clique acontecer depois de um erro anterior deixar
// #error=... ou ?error=... na barra de endereco, usar window.location.href
// arrastaria esse lixo para o redirect final e misturava-o com o token novo,
// impedindo o supabase-js de o interpretar.
function cleanRedirectUrl() {
  return window.location.origin + window.location.pathname;
}

// --- Email + palavra-passe (2026-09-11, a pedido) --------------------------
//
// Um formulario so, com DOIS modos (entrar / criar conta) - trocar de modo
// so muda o texto do botao e o que o submit faz, evita duplicar o markup.
const formEmailAuthEl = document.getElementById("form-email-auth");
const emailAuthEmailEl = document.getElementById("email-auth-email");
const emailAuthPasswordEl = document.getElementById("email-auth-password");
const btnEmailAuthSubmit = document.getElementById("btn-email-auth-submit");
const btnEmailAuthToggle = document.getElementById("btn-email-auth-toggle");
const btnEmailAuthForgot = document.getElementById("btn-email-auth-forgot");
const emailAuthStatusEl = document.getElementById("email-auth-status");

let emailAuthMode = "entrar"; // "entrar" | "criar"

function showEmailAuthStatus(text, isError) {
  emailAuthStatusEl.textContent = text;
  emailAuthStatusEl.classList.toggle("auth-status-error", Boolean(isError));
}

function setEmailAuthMode(mode) {
  emailAuthMode = mode;
  btnEmailAuthSubmit.textContent = mode === "criar" ? "Criar conta" : "Entrar";
  btnEmailAuthToggle.textContent = mode === "criar" ? "Já tens conta? Entra" : "Ainda não tens conta? Cria uma";
  showEmailAuthStatus("", false);
}

// Anuncio de beta fechada na landing (2026-09-24, a pedido - "deixa esse
// aviso/anuncio no site de que estamos em beta fechado e que temos vagas
// para x pessoas experimentarem"). beta_vagas_restantes() e a mesma funcao
// usada para bloquear "Criar conta" quando esgota - aqui e so para mostrar
// o numero, por isso falhas de rede ficam em silencio (a landing funciona
// na mesma sem o anuncio).
const landingBetaBannerEl = document.getElementById("landing-beta-banner");

async function mostrarAnuncioDeBeta() {
  if (!landingBetaBannerEl) return;
  const { data: vagas, error } = await supabaseClient.rpc("beta_vagas_restantes");
  if (error || typeof vagas !== "number") return;

  landingBetaBannerEl.textContent =
    vagas > 0
      ? `Beta fechada — ${vagas} vaga${vagas === 1 ? "" : "s"} disponíve${vagas === 1 ? "l" : "is"} para experimentar`
      : "Beta fechada — sem vagas disponíveis neste momento";
  landingBetaBannerEl.classList.remove("hidden");
}
mostrarAnuncioDeBeta();

// Botoes da pagina de entrada (index.html, .landing-final): abrem o ecra de
// login/criar conta ja no modo certo, com o cursor no email.
document.querySelectorAll("[data-landing-cta]").forEach((btn) => {
  btn.addEventListener("click", () => {
    showLoginView(btn.dataset.landingCta === "criar" ? "criar" : "entrar");
    emailAuthEmailEl.focus({ preventScroll: true });
  });
});

btnLoginBack.addEventListener("click", showLandingView);

btnEmailAuthToggle.addEventListener("click", () => {
  setEmailAuthMode(emailAuthMode === "criar" ? "entrar" : "criar");
});

// Traducoes das mensagens mais comuns que o Supabase devolve em ingles -
// sem tabela exaustiva, so as que realmente aparecem na pratica (login
// errado, conta duplicada, provider por configurar).
function translateAuthError(error) {
  const msg = (error && error.message) || "";
  if (/invalid login credentials/i.test(msg)) return "Email ou palavra-passe incorretos.";
  if (/user already registered/i.test(msg)) return "Já existe uma conta com este email — tenta entrar.";
  if (/email not confirmed/i.test(msg)) return "Confirma o teu email antes de entrares (vê a caixa de entrada).";
  if (/password should be at least/i.test(msg)) return "A palavra-passe precisa de pelo menos 6 caracteres.";
  if (/unable to validate email address/i.test(msg)) return "Esse email não é válido.";
  if (/provider is not enabled/i.test(msg)) return "Este método de login ainda não está configurado.";
  if (/auth session missing|session.*expired|invalid.*(token|refresh)/i.test(msg)) {
    return "O link de recuperação expirou ou já foi usado. Pede um novo em \"Esqueceste a palavra-passe?\".";
  }
  // Beta fechada (2026-09-24): o Supabase Auth embrulha a exceção real do
  // trigger (handle_new_user) numa mensagem genérica - isto é o "apanha tudo"
  // para quem passar pela verificação prévia (beta_vagas_disponiveis) mas
  // perder a corrida para a última vaga por segundos.
  if (/database error saving new user/i.test(msg)) {
    return "As inscrições da beta estão fechadas por agora — sem vagas.";
  }
  return msg || "Não foi possível continuar. Tenta novamente.";
}

formEmailAuthEl.addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = emailAuthEmailEl.value.trim();
  const password = emailAuthPasswordEl.value;
  if (!email || password.length < 6) {
    showEmailAuthStatus("Preenche o email e uma palavra-passe com 6+ caracteres.", true);
    return;
  }

  btnEmailAuthSubmit.disabled = true;
  showEmailAuthStatus("", false);

  if (emailAuthMode === "criar") {
    // Beta fechada com limite de contas (2026-09-24, a pedido). A fronteira
    // real é o próprio trigger que cria o perfil (handle_new_user, SQL) -
    // isto só evita o jogador preencher tudo para levar com um erro
    // genérico do Postgres no fim.
    const { data: vagasRestantes, error: erroVagas } = await supabaseClient.rpc("beta_vagas_restantes");
    if (!erroVagas && vagasRestantes <= 0) {
      btnEmailAuthSubmit.disabled = false;
      showEmailAuthStatus("As inscrições da beta estão fechadas por agora — sem vagas.", true);
      return;
    }
    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: cleanRedirectUrl() },
    });
    btnEmailAuthSubmit.disabled = false;
    if (error) {
      showEmailAuthStatus(translateAuthError(error), true);
      return;
    }
    // Com "Confirmar email" ligado no Supabase (a pré-definição), signUp()
    // NAO cria sessao - so depois de o link no email ser clicado. Sem
    // sessao aqui, onAuthStateChange abaixo nunca dispara, por isso o aviso
    // tem de vir deste lado.
    if (!data.session) {
      showEmailAuthStatus("Conta criada! Vai ao teu email e confirma-a para entrares.", false);
      return;
    }
    // "Confirmar email" desligado: ja ha sessao, onAuthStateChange trata do resto.
  } else {
    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
    btnEmailAuthSubmit.disabled = false;
    if (error) showEmailAuthStatus(translateAuthError(error), true);
  }
});

btnEmailAuthForgot.addEventListener("click", async () => {
  const email = emailAuthEmailEl.value.trim();
  if (!email) {
    showEmailAuthStatus("Escreve o teu email em cima e carrega outra vez aqui.", true);
    return;
  }
  btnEmailAuthForgot.disabled = true;
  const { error } = await supabaseClient.auth.resetPasswordForEmail(email, { redirectTo: cleanRedirectUrl() });
  btnEmailAuthForgot.disabled = false;
  showEmailAuthStatus(
    error ? translateAuthError(error) : "Se houver uma conta com este email, foi enviado um link para repor a palavra-passe.",
    Boolean(error)
  );
});

// --- Repor palavra-passe (link recebido por email) -------------------------
//
// Clicar no link do email de recuperacao volta ao site JA com uma sessao de
// recuperacao ativa - o Supabase dispara PASSWORD_RECOVERY em vez de
// SIGNED_IN (ver o listener principal, mais abaixo). So falta escolher a
// palavra-passe nova; a sessao so e tratada como login completo depois de
// updateUser() ter sucesso.
const passwordResetModalEl = document.getElementById("password-reset-modal");
const passwordResetInputEl = document.getElementById("password-reset-input");
const btnPasswordResetConfirm = document.getElementById("btn-password-reset-confirm");
const passwordResetStatusEl = document.getElementById("password-reset-status");

// true entre abrir o link de recuperacao e a palavra-passe ficar definida:
// nesse intervalo TODOS os eventos de sessao do Supabase (incluindo o
// USER_UPDATED que updateUser dispara) sao ignorados pelo listener principal -
// a sessao de recuperacao nao e um login, ver onAuthStateChange mais abaixo.
// Ja arranca a true se o URL traz type=recovery: o supabase-js emite SIGNED_IN
// ANTES de PASSWORD_RECOVERY para um link de recuperacao, e sem isto esse
// primeiro evento arrancava o jogo por baixo do popup de nova palavra-passe.
// Le-se de forma sincrona, antes de o supabase-js limpar o #hash do endereco.
let passwordRecoveryEmFluxo = /[#&?]type=recovery\b/.test(window.location.hash + window.location.search);

function openPasswordResetModal() {
  authModalEl.classList.add("hidden");
  passwordResetModalEl.classList.remove("hidden");
}

btnPasswordResetConfirm.addEventListener("click", async () => {
  const novaPassword = passwordResetInputEl.value;
  passwordResetStatusEl.classList.remove("auth-status-error");
  if (novaPassword.length < 6) {
    passwordResetStatusEl.textContent = "A palavra-passe precisa de pelo menos 6 caracteres.";
    passwordResetStatusEl.classList.add("auth-status-error");
    return;
  }
  btnPasswordResetConfirm.disabled = true;
  passwordResetStatusEl.textContent = "";
  const { data, error } = await supabaseClient.auth.updateUser({ password: novaPassword });
  btnPasswordResetConfirm.disabled = false;
  if (error) {
    // Bug real (2026-09-14): esta mensagem antes ficava em texto simples,
    // sem cor nem destaque (CSS so tinha a regra para o form de email) -
    // quem via isto achava que "nao tinha acontecido nada" em vez de ver um
    // erro. Ver .auth-status-error em css/campo-aberto-v6.css.
    passwordResetStatusEl.textContent = translateAuthError(error);
    passwordResetStatusEl.classList.add("auth-status-error");
    return;
  }
  // Palavra-passe definida: NAO entra no jogo (2026-09-21, a pedido - "assim
  // que a nova passe e definida... deveria saltar para a pagina de login
  // novamente"). Termina a sessao de recuperacao SO NESTE APARELHO
  // (scope "local" - o "global", que e a pre-definicao, desligava tambem os
  // outros telemoveis do jogador, mesmo a meio de um treino) e volta ao login
  // com o email ja preenchido, para entrar com a palavra-passe nova.
  const emailDaConta = data && data.user ? data.user.email : "";
  try {
    await supabaseClient.auth.signOut({ scope: "local" });
  } catch (err) {
    console.error("Falha ao terminar a sessão de recuperação:", err);
  }
  passwordRecoveryEmFluxo = false;
  passwordResetInputEl.value = "";
  passwordResetModalEl.classList.add("hidden");
  authModalEl.classList.remove("hidden");
  showLoginView("entrar");
  if (emailDaConta) emailAuthEmailEl.value = emailDaConta;
  emailAuthPasswordEl.value = "";
  showEmailAuthStatus("Palavra-passe alterada! Entra com a nova palavra-passe.", false);
});

// --- HUD ------------------------------------------------------------------

// Mostra o nome escolhido no lugar do nome da app ("Bootlands", antes "Personagem 3D") no cabecalho (2026-08-06,
// a pedido - antes ficava so num span sr-only, nunca visivel) - o leaderboard
// ja usa currentDisplayName() diretamente.
function applyDisplayNameToHud() {
  if (siteTitleEl && currentProfile && currentProfile.display_name) {
    siteTitleEl.textContent = currentProfile.display_name;
  }
}

// O card de Debug era a unica coisa que este gate mostrava; foi removido em
// 2026-08-14 (ver cabecalho de js/game-config.js). `is_admin` continua em
// profiles e continua a ser a fronteira real de seguranca nas politicas RLS
// - so deixou de haver UI dependente dele.
function applyAdminGate() {}

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
// correr - em particular, refreshAllUi() no fim tem de
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
      // RECONCILIA sempre, em vez de escolher um dos lados (2026-08-14,
      // secção 14.1). Antes era tudo-ou-nada: com uma mutacao local por
      // confirmar saltava-se a hidratacao por completo e confiava-se no
      // dispositivo - o que significava ignorar qualquer alteracao feita do
      // lado do servidor. Bug real: calorias corrigidas por SQL nunca
      // chegavam ao telemovel (mostrava nivel 4 em vez de 10) e o sync
      // seguinte teria apagado a correcao. reconcileProgressWithServer faz
      // o merge campo a campo (maximo nos campos que so crescem, uniao nas
      // colecoes) - nenhum dos lados perde informacao.
      const merged = reconcileProgressWithServer(progress);
      // Marca para subir o resultado do merge, para o servidor convergir
      // tambem (o sync efetivo so dispara quando readyForSync fica true,
      // mais abaixo). Sem isto, o que o dispositivo soubesse de novo ficava
      // so no dispositivo ate a proxima mutacao qualquer.
      if (mergedDiffersFromServer(merged, progress)) {
        localStorage.setItem(SYNC_PENDING_KEY, "true");
      }
    }
  } catch (err) {
    console.error("Falha ao migrar/hidratar progresso:", err);
  }

  // Hidrata a distancia mensal ja aqui, o mais cedo possivel - ANTES de
  // checkFrequencyAchievementsFromSessions/readyForSync mais abaixo, que
  // podem desbloquear uma conquista ou atualizar uma sequencia e disparar
  // queueProgressSync(). Sem isto, esse sync sobe o valor LOCAL da
  // distancia mensal (ainda por hidratar, tipicamente 0/desatualizado)
  // para o leaderboard ANTES de checkMonthlyRollover (mais abaixo) ter a
  // oportunidade de a ler do servidor - apagando o valor real em
  // definitivo. Bug real encontrado em 2026-08-04 (restaurar uma sessao
  // de treino a mao fez o best_streak_days subir, disparando um sync a
  // meio do login que reverteu a distancia mensal para 0).
  try {
    await hydrateMonthlyDistanceFromServer();
  } catch (err) {
    console.error("Falha ao hidratar distância mensal:", err);
  }

  if (!profile.display_name) {
    try {
      await promptForDisplayName(user.id);
    } catch (err) {
      console.error("Falha ao guardar nome:", err);
    }
    try {
      if (typeof promptForWelcomeWeight === "function") await promptForWelcomeWeight();
    } catch (err) {
      console.error("Falha ao guardar peso inicial:", err);
    }
  }

  // Lembrete de peso a cada 15 dias (secção 20): nunca dispara logo a seguir
  // ao passo de boas-vindas acima, porque o peso acabou de ser registado.
  try {
    if (typeof checkWeightReminder === "function") await checkWeightReminder();
  } catch (err) {
    console.error("Falha ao verificar lembrete de peso:", err);
  }

  readyForSync = true;
  applyDisplayNameToHud();

  // Re-renderiza tudo com os dados hidratados/migrados (funcao existente em
  // js/debug.js) - corre sempre, mesmo que os passos acima tenham falhado.
  refreshAllUi();

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
      .select("started_at, distance_m, duration_seconds, calories_kcal")
      .eq("user_id", user.id)
      .order("started_at");
    if (sessions) checkFrequencyAchievementsFromSessions(sessions);
    // As calorias vitalicias/mensais nunca podem passar da soma das sessoes
    // (js/progress-sync.js). Se corrigiu algo, redesenha XP/nivel/leaderboard.
    if (sessions && corrigirCaloriasComSessoes(sessions)) {
      refreshAllUi();
      renderLeaderboardCard();
    }
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

  // Territorios descobertos (secção 18) - o Supabase e a fonte de verdade,
  // a cache local pode estar vazia (dispositivo novo) ou desatualizada.
  // Try/catch proprio, como o resto do arranque: uma falha aqui nao pode
  // impedir o jogo de arrancar.
  try {
    await hydrateHexesFromSupabase();
  } catch (err) {
    console.error("Falha ao carregar territórios descobertos:", err);
  }

  // Fixa um checkpoint de recursos AGORA (secção 21): a esta altura os
  // hexagonos/minas/concelhos ja estao hidratados, por isso producaoPorHora
  // ja da a taxa certa. Sem isto, um jogador que so OLHA para a Economia
  // (nunca paga nada) nunca empurrava o stock para o servidor.
  try {
    // Nao fixa checkpoint enquanto houver depositos encontrados sem concelho
    // carregado (dispositivo novo, cache de regioes ainda vazia): a producao
    // estaria subestimada e o checkpoint apagava as horas em falta (2026-09-19).
    if (typeof acumularProducao === "function" && (typeof depositosPorResolver !== "function" || depositosPorResolver() === 0)) {
      acumularProducao();
    }
  } catch (err) {
    console.error("Falha ao fixar checkpoint de recursos:", err);
  }

  // Os niveis da Fortaleza e da Arma podem ter vindo do servidor - troca os
  // modelos 3D da torre e do arco se calharem noutra faixa de 5 (js/main.js).
  try {
    if (typeof refreshTowerModel === "function") refreshTowerModel();
    if (typeof refreshWeaponModel === "function") refreshWeaponModel();
  } catch (err) {
    console.error("Falha ao atualizar os modelos 3D:", err);
  }

  // Missoes mensais (secção 22): o estado pode ter vindo do servidor
  // (concluidas noutro dispositivo) ou o mes ter mudado - reavalia e
  // redesenha o painel do separador Treinar.
  try {
    if (typeof verificarMissaoAtiva === "function") verificarMissaoAtiva();
  } catch (err) {
    console.error("Falha ao verificar missões mensais:", err);
  }
}

supabaseClient.auth.onAuthStateChange((event, session) => {
  // PASSWORD_RECOVERY: ha sessao, mas ainda NAO e um login - o jogador
  // seguiu o link do email so para repor a palavra-passe (fluxo acima,
  // btnPasswordResetConfirm). So depois de a definir e que se arranca o
  // jogo com esta sessao.
  if (event === "PASSWORD_RECOVERY") {
    passwordRecoveryEmFluxo = true;
    openPasswordResetModal();
    return;
  }
  if (passwordRecoveryEmFluxo) return;
  if (!session) return;
  hideAuthModal();
  if (bootstrapped) return;
  bootstrapped = true;
  bootstrapAfterLogin(session.user).catch((err) => {
    console.error("Falha ao preparar sessão após login:", err);
  });
});
