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
    lifetime_calories_kcal: getLifetimeCaloriesKcal(),
    unspent_points: getUnspentPoints(),
    nivel_energia: getInvestableStatLevel("energia"),
    nivel_forca: getInvestableStatLevel("forca"),
    nivel_resistencia: getInvestableStatLevel("resistencia"),
    nivel_arma: getWeaponLevel(),
    nivel_escudo: getShieldLevel(),
    nivel_armadura: getArmorLevel(),
    last_awarded_level: getLastAwardedLevel(),
    defeated_creatures: getDefeatedCreaturesMap(),
    encountered_creatures: getEncounteredLevels(),
    unlocked_achievements: getUnlockedAchievements(),
    // best_session_distance_m/best_pace_mps (sem mode) continuam a
    // representar especificamente Correr - Caminhar/Bicicleta tem as suas
    // proprias colunas (ver conquistas de distancia/ritmo por modo,
    // secção 10 da documentação).
    best_session_distance_m: getBestSessionDistanceM("correr"),
    best_session_distance_m_caminhar: getBestSessionDistanceM("caminhar"),
    best_session_distance_m_bicicleta: getBestSessionDistanceM("bicicleta"),
    total_trainings_completed: getTotalTrainingsCompleted(),
    best_pace_mps: getBestPaceMps("correr"),
    best_pace_mps_caminhar: getBestPaceMps("caminhar"),
    best_pace_mps_bicicleta: getBestPaceMps("bicicleta"),
    best_streak_days: getBestStreakDays(),
    discarded_speed_distance_m: getDiscardedSpeedDistanceM(),
    // Contador vitalicio de lutas (2026-08-07, secção 10 - mais conquistas)
    total_battles_fought: getTotalBattlesFought(),
    distinct_months_trained: getDistinctMonthsTrained(),
    peso_kg: getPesoKg(),
    best_session_calories_kcal: getBestSessionCaloriesKcal(),
    // Economia de recursos do mapa (secção 21). O par recursos/recursos_desde
    // e um checkpoint + relogio: a producao e sempre derivada de
    // (agora - recursos_desde), por isso os dois sincronizam juntos.
    recursos: typeof getResources === "function" ? getResources() : {},
    recursos_desde: Number(localStorage.getItem(STORAGE_KEY_RESOURCES_SINCE)) || null,
    nivel_fortaleza: typeof getWarehouseLevel === "function" ? getWarehouseLevel() : 1,
    minas_encontradas: typeof getMinasEncontradas === "function" ? [...getMinasEncontradas()] : [],
    hex_visitas: typeof getHexVisits === "function" ? getHexVisits() : {},
    // Missoes mensais (secção 22). getMissionStateRaw NAO faz o rollover de
    // mes (isso escreveria no localStorage a meio do snapshot) - so le.
    missoes_mensais: typeof getMissionStateRaw === "function" ? getMissionStateRaw() : {},
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
      lifetime_calories_kcal: snapshot.lifetime_calories_kcal,
      monthly_distance_m: getMonthlyDistanceM(),
      monthly_calories_kcal: getMonthlyCaloriesKcal(),
      month_reference: getMonthReference(),
      // Copia publica das conquistas (player_progress e privado, RLS so
      // deixa o dono ler a sua propria linha) - usada pelo popup de
      // trofeus de outro jogador no leaderboard (js/leaderboard.js).
      unlocked_achievements: snapshot.unlocked_achievements,
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
    lifetime_calories_kcal: snapshot.lifetime_calories_kcal,
    monthly_distance_m: getMonthlyDistanceM(),
    monthly_calories_kcal: getMonthlyCaloriesKcal(),
    month_reference: getMonthReference(),
    unlocked_achievements: snapshot.unlocked_achievements,
  });

  return snapshot;
}

// --- Reconciliacao no arranque (2026-08-14, secção 14.1) -------------------
//
// Antes disto o arranque era TUDO-OU-NADA: ou hidratava do servidor (e
// apagava mutacoes locais por confirmar), ou confiava inteiramente no local
// (e ignorava tudo o que o servidor soubesse de novo). Bug real: as calorias
// vitalicias foram corrigidas por SQL na base de dados, mas o telemovel
// tinha uma mutacao pendente - saltou a hidratacao, continuou a mostrar
// nivel 4 em vez de 10, e o proximo sync bem-sucedido teria APAGADO a
// correcao ao subir o valor local antigo.
//
// A observacao que resolve isto: a esmagadora maioria dos campos de
// progresso SO CRESCE. Para esses, o merge correto nao precisa de saber
// quem escreveu por ultimo - basta o MAXIMO, que e seguro nos dois
// sentidos (treino novo ainda por sincronizar E correcao feita no servidor).
const MONOTONIC_PROGRESS_FIELDS = [
  "lifetime_distance_m",
  "lifetime_calories_kcal",
  "last_awarded_level",
  "best_session_distance_m",
  "best_session_distance_m_caminhar",
  "best_session_distance_m_bicicleta",
  "best_session_calories_kcal",
  "total_trainings_completed",
  "best_pace_mps",
  "best_pace_mps_caminhar",
  "best_pace_mps_bicicleta",
  "best_streak_days",
  "discarded_speed_distance_m",
  "total_battles_fought",
  "distinct_months_trained",
  // Niveis investidos/de equipamento tambem so sobem no jogo normal (gastam
  // pontos/materiais, nunca sao devolvidos). Um reset feito SO por SQL, sem
  // limpar o dispositivo, seria desfeito por isto - e uma operacao de
  // administracao rara, e o custo de nao proteger o caso normal e maior.
  "nivel_energia",
  "nivel_forca",
  "nivel_resistencia",
  "nivel_arma",
  "nivel_escudo",
  "nivel_armadura",
  // Nivel da Fortaleza (armazem): so sobe. (O stock de recursos em si e
  // reconciliado a parte, ver mergeRecursos.)
  "nivel_fortaleza",
];

// Estes sobem E descem (investir pontos), por isso o maximo nao serve - o
// valor mais alto pode ser simplesmente o mais antigo. Aqui mantem-se a
// regra anterior: se ha mutacao local por confirmar, o local e mais
// recente; senao, manda o servidor. `peso_kg` e uma preferencia, mesma
// logica.
const LAST_WRITER_PROGRESS_FIELDS = ["unspent_points", "peso_kg"];

function mergeDefeatedCreatures(local, server) {
  const merged = { ...(server || {}) };
  Object.entries(local || {}).forEach(([level, stars]) => {
    merged[level] = Math.max(Number(merged[level]) || 0, Number(stars) || 0);
  });
  return merged;
}

// Stock de recursos (secção 21): projeta OS DOIS lados para agora
// (checkpoint + taxa x tempo desde o proprio recursos_desde) e fica com o
// maior por recurso. Nunca perde producao offline; pode restaurar recursos
// gastos noutro dispositivo (mesmo compromisso ja aceite nos campos
// monotonicos). O recursos_desde do resultado e "agora" - o valor devolvido
// ja esta projetado ate ca.
function mergeRecursos(localRec, localDesde, serverRec, serverDesde, nivelFortaleza) {
  const now = Date.now();
  const taxa = typeof producaoPorHora === "function" ? producaoPorHora() : {};
  const tecto = typeof warehouseCap === "function" ? warehouseCap(nivelFortaleza || 1) : Infinity;
  const ids = typeof RESOURCE_IDS !== "undefined"
    ? RESOURCE_IDS
    : [...new Set([...Object.keys(localRec || {}), ...Object.keys(serverRec || {})])];

  const projetar = (rec, desde) => {
    const horas = Number.isFinite(desde) && desde > 0 ? Math.max(0, (now - desde) / 3600000) : 0;
    const out = {};
    ids.forEach((id) => {
      const base = Math.max(0, Number(rec && rec[id]) || 0);
      out[id] = Math.min(tecto, base + (Number(taxa[id]) || 0) * horas);
    });
    return out;
  };

  const a = projetar(localRec, Number(localDesde));
  const b = projetar(serverRec, Number(serverDesde));
  const merged = {};
  ids.forEach((id) => { merged[id] = Math.max(a[id], b[id]); });
  return merged;
}

// Missoes mensais (secção 22). Meses diferentes: fica o mais recente (o
// outro dispositivo esta atrasado, ou o mes ja virou). Mesmo mes: uniao das
// concluidas (uma missao feita num dispositivo nao "desconclui"), a ativa de
// qualquer lado que a tenha, e o rejeitadaEm mais recente. Se a ativa ja
// consta das concluidas depois da uniao, larga-se.
function mergeMissoes(local, server) {
  if (!local && !server) return {};
  if (!local || !local.mes) return server || {};
  if (!server || !server.mes) return local;
  if (local.mes !== server.mes) return String(local.mes) > String(server.mes) ? local : server;

  const concluidas = [...new Set([...(local.concluidas || []), ...(server.concluidas || [])])];
  let ativa = local.ativa || server.ativa || null;
  if (ativa && concluidas.includes(ativa.slot)) ativa = null;
  const rejeitadaEm = Math.max(Number(local.rejeitadaEm) || 0, Number(server.rejeitadaEm) || 0) || null;
  return { mes: local.mes, concluidas, ativa, rejeitadaEm };
}

// Multiplicadores por hexagono (hexId -> {m, d}): por hexagono, fica o
// registo com a visita mais recente (d, dia ISO); empate -> multiplicador
// mais alto. Uniao das chaves - uma visita num dispositivo nao desaparece.
function mergeHexVisitas(local, server) {
  const merged = { ...(server || {}) };
  Object.entries(local || {}).forEach(([hexId, reg]) => {
    const atual = merged[hexId];
    if (!atual) { merged[hexId] = reg; return; }
    const maisRecente = String(reg.d) > String(atual.d);
    const mesmoDiaMaiorMult = reg.d === atual.d && (Number(reg.m) || 0) > (Number(atual.m) || 0);
    if (maisRecente || mesmoDiaMaiorMult) merged[hexId] = reg;
  });
  return merged;
}

// Reconcilia o estado local com o do servidor e devolve o resultado, ja
// escrito no localStorage. Corre em TODOS os arranques.
function reconcileProgressWithServer(serverProgress) {
  const local = readLocalProgressSnapshot();
  const localHasPendingChanges = localStorage.getItem(SYNC_PENDING_KEY) === "true";
  const merged = { ...serverProgress };

  MONOTONIC_PROGRESS_FIELDS.forEach((field) => {
    merged[field] = Math.max(Number(local[field]) || 0, Number(serverProgress[field]) || 0);
  });

  LAST_WRITER_PROGRESS_FIELDS.forEach((field) => {
    if (localHasPendingChanges) merged[field] = local[field];
    else if (serverProgress[field] == null) merged[field] = local[field];
  });

  // Colecoes: uniao, nunca substituicao - uma conquista desbloqueada num
  // dispositivo nao pode desaparecer por o outro nao a conhecer.
  merged.defeated_creatures = mergeDefeatedCreatures(local.defeated_creatures, serverProgress.defeated_creatures);
  merged.encountered_creatures = [
    ...new Set([...(local.encountered_creatures || []), ...(serverProgress.encountered_creatures || [])]),
  ].sort((a, b) => a - b);
  merged.unlocked_achievements = {
    ...(serverProgress.unlocked_achievements || {}),
    ...(local.unlocked_achievements || {}),
  };

  // Economia de recursos (secção 21). nivel_fortaleza ja foi feito acima
  // (monotonico); e ele que decide o tecto no merge do stock.
  merged.recursos = mergeRecursos(
    local.recursos, local.recursos_desde,
    serverProgress.recursos, serverProgress.recursos_desde,
    merged.nivel_fortaleza
  );
  merged.recursos_desde = Date.now(); // o stock acima ja esta projetado ate agora
  merged.minas_encontradas = [
    ...new Set([...(local.minas_encontradas || []), ...(serverProgress.minas_encontradas || [])]),
  ];
  merged.hex_visitas = mergeHexVisitas(local.hex_visitas, serverProgress.hex_visitas);
  merged.missoes_mensais = mergeMissoes(local.missoes_mensais, serverProgress.missoes_mensais);

  hydrateLocalStorageFromProgress(merged);
  return merged;
}

// O merge trouxe alguma coisa que o servidor ainda nao tem? Compara so os
// campos que o snapshot local produz - a linha do servidor traz colunas
// extra (user_id, updated_at, colunas geradas) que nao interessam aqui.
function mergedDiffersFromServer(merged, serverProgress) {
  return Object.keys(readLocalProgressSnapshot()).some(
    (field) => JSON.stringify(merged[field]) !== JSON.stringify(serverProgress[field])
  );
}

// Jogador a repetir login (possivelmente noutro dispositivo): escreve o
// estado (ja reconciliado, ver acima) no localStorage, para o resto do
// codigo continuar a funcionar sem alteracoes.
function hydrateLocalStorageFromProgress(progress) {
  localStorage.setItem(STORAGE_KEY_LIFETIME_M, String(progress.lifetime_distance_m));
  localStorage.setItem(STORAGE_KEY_LIFETIME_KCAL, String(progress.lifetime_calories_kcal || 0));
  localStorage.setItem(STORAGE_KEYS_EQUIPMENT.pontosDisponiveis, String(progress.unspent_points));
  localStorage.setItem(STORAGE_KEYS_EQUIPMENT.nivelEnergia, String(progress.nivel_energia || 0));
  localStorage.setItem(STORAGE_KEYS_EQUIPMENT.nivelForca, String(progress.nivel_forca || 0));
  localStorage.setItem(STORAGE_KEYS_EQUIPMENT.nivelResistencia, String(progress.nivel_resistencia || 0));
  localStorage.setItem(STORAGE_KEY_WEAPON_LEVEL, String(progress.nivel_arma || 1));
  localStorage.setItem(STORAGE_KEY_SHIELD_LEVEL, String(progress.nivel_escudo || 1));
  localStorage.setItem(STORAGE_KEY_ARMOR_LEVEL, String(progress.nivel_armadura || 1));
  localStorage.setItem(STORAGE_KEYS_EQUIPMENT.ultimoNivelPremiado, String(progress.last_awarded_level));
  localStorage.setItem(STORAGE_KEY_DEFEATED_CREATURES, JSON.stringify(progress.defeated_creatures || {}));
  localStorage.setItem(STORAGE_KEY_ENCOUNTERED_CREATURES, JSON.stringify(progress.encountered_creatures || []));
  localStorage.setItem(STORAGE_KEY_UNLOCKED_ACHIEVEMENTS, JSON.stringify(progress.unlocked_achievements || {}));
  localStorage.setItem(STORAGE_KEY_BEST_SESSION_DISTANCE_M, String(progress.best_session_distance_m));
  localStorage.setItem(STORAGE_KEY_BEST_SESSION_DISTANCE_M_CAMINHAR, String(progress.best_session_distance_m_caminhar || 0));
  localStorage.setItem(STORAGE_KEY_BEST_SESSION_DISTANCE_M_BICICLETA, String(progress.best_session_distance_m_bicicleta || 0));
  localStorage.setItem(STORAGE_KEY_TOTAL_TRAININGS, String(progress.total_trainings_completed));
  localStorage.setItem(STORAGE_KEY_BEST_PACE_MPS, String(progress.best_pace_mps || 0));
  localStorage.setItem(STORAGE_KEY_BEST_PACE_MPS_CAMINHAR, String(progress.best_pace_mps_caminhar || 0));
  localStorage.setItem(STORAGE_KEY_BEST_PACE_MPS_BICICLETA, String(progress.best_pace_mps_bicicleta || 0));
  localStorage.setItem(STORAGE_KEY_BEST_STREAK_DAYS, String(progress.best_streak_days || 0));
  localStorage.setItem(STORAGE_KEY_DISCARDED_SPEED_M, String(progress.discarded_speed_distance_m || 0));
  localStorage.setItem(STORAGE_KEY_TOTAL_BATTLES, String(progress.total_battles_fought || 0));
  localStorage.setItem(STORAGE_KEY_DISTINCT_MONTHS_TRAINED, String(progress.distinct_months_trained || 0));
  localStorage.setItem(STORAGE_KEY_WEIGHT_KG, String(progress.peso_kg || DEFAULT_WEIGHT_KG));
  localStorage.setItem(STORAGE_KEY_BEST_SESSION_CALORIES_KCAL, String(progress.best_session_calories_kcal || 0));

  // Economia de recursos do mapa (secção 21).
  localStorage.setItem(STORAGE_KEY_RESOURCES, JSON.stringify(progress.recursos || {}));
  if (Number.isFinite(Number(progress.recursos_desde)) && Number(progress.recursos_desde) > 0) {
    localStorage.setItem(STORAGE_KEY_RESOURCES_SINCE, String(Number(progress.recursos_desde)));
  } else {
    localStorage.removeItem(STORAGE_KEY_RESOURCES_SINCE);
  }
  localStorage.setItem(STORAGE_KEY_WAREHOUSE_LEVEL, String(progress.nivel_fortaleza || 1));
  localStorage.setItem(STORAGE_KEY_MINES, JSON.stringify(progress.minas_encontradas || []));
  localStorage.setItem(STORAGE_KEY_HEX_VISITS, JSON.stringify(progress.hex_visitas || {}));

  // Missoes mensais (secção 22). Objeto vazio => remove a chave, para o
  // proximo getMissionState() gerar o estado limpo do mes corrente.
  if (progress.missoes_mensais && progress.missoes_mensais.mes) {
    localStorage.setItem(STORAGE_KEY_MISSIONS, JSON.stringify(progress.missoes_mensais));
  } else {
    localStorage.removeItem(STORAGE_KEY_MISSIONS);
  }
}
