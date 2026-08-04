// Card publico de leaderboard: top 10 (geral por distancia vitalicia, ou
// mensal por distancia do mes corrente), mais a posicao do proprio jogador
// se nao estiver no top 10; e um historico de medalhas dos meses ja
// fechados (tabela monthly_medals, preenchida por js/monthly-medals.js).
// Depende de globais definidas em js/auth.js (supabaseClient,
// currentUserId) e de js/profile.js (formatMonthKey, formatMonthLabel).
const leaderboardListEl = document.getElementById("leaderboard-list");
const leaderboardListMonthlyEl = document.getElementById("leaderboard-list-monthly");
const leaderboardListHistoryEl = document.getElementById("leaderboard-list-history");
const btnLeaderboardGeral = document.getElementById("btn-leaderboard-geral");
const btnLeaderboardMensal = document.getElementById("btn-leaderboard-mensal");
const btnLeaderboardHistorico = document.getElementById("btn-leaderboard-historico");

const MEDAL_EMOJI_BY_TYPE = { gold: "🥇", silver: "🥈", bronze: "🥉" };

function createLeaderboardRowEl(row, rank, isOwn, distanceM) {
  const el = document.createElement("div");
  el.className = "leaderboard-row" + (isOwn ? " own" : "");

  const rankEl = document.createElement("span");
  rankEl.className = "leaderboard-rank";
  rankEl.textContent = `#${rank}`;

  // So o nome de OUTRO jogador abre o popup de trofeus - no proprio nao
  // faz sentido (ve sempre os seus troféus no Jogo/Perfil).
  const nameEl = document.createElement("span");
  nameEl.className = "leaderboard-name" + (isOwn ? "" : " leaderboard-name-clickable");
  nameEl.textContent = row.display_name;
  if (!isOwn) {
    nameEl.addEventListener("click", () => openPlayerTrophiesModal(row.display_name, row.unlocked_achievements));
  }

  // Nivel vem sempre da distancia VITALICIA (secção 5), nunca da coluna
  // mostrada na aba Mensal (monthly_distance_m reinicia todos os meses,
  // um "nivel" derivado dela nao corresponderia ao nivel real do jogador) -
  // por isso lifetime_distance_m e sempre pedido a parte (ver renderLeaderboardInto).
  const levelEl = document.createElement("span");
  levelEl.className = "leaderboard-level";
  levelEl.textContent = `Lvl ${getLevelInfo(row.lifetime_distance_m).level}`;

  const distEl = document.createElement("span");
  distEl.className = "leaderboard-distance";
  distEl.textContent = formatXP(distanceM);

  el.append(rankEl, nameEl, levelEl, distEl);
  return el;
}

// distanceColumn: "lifetime_distance_m" (geral) ou "monthly_distance_m"
// (mensal). Quando monthKey e passado, filtra so as linhas cujo
// month_reference bate com o mes corrente - sem isto, jogadores que ainda
// nao fizeram login desde a virada do mes apareceriam com a distancia do
// mes anterior, que ainda nao foi resetada na sua linha. Mesmo aspeto do
// geral em ambas as abas - as medalhas por posicao aparecem so na conquista
// mensal (js/achievements.js) e no historico abaixo, nao aqui.
// lifetime_distance_m e sempre pedido, mesmo na aba Mensal (distanceColumn
// = monthly_distance_m nesse caso) - e a partir dela que o nivel de cada
// linha e calculado (ver createLeaderboardRowEl), nunca da coluna mostrada.
// unlocked_achievements tambem e sempre pedido - popup de trofeus ao
// clicar no nome (openPlayerTrophiesModal abaixo).
function leaderboardSelectColumns(distanceColumn) {
  return distanceColumn === "lifetime_distance_m"
    ? "user_id, display_name, lifetime_distance_m, unlocked_achievements"
    : `user_id, display_name, lifetime_distance_m, unlocked_achievements, ${distanceColumn}`;
}

async function renderLeaderboardInto(listEl, distanceColumn, monthKey) {
  if (!listEl) return null;

  let query = supabaseClient.from("leaderboard").select(leaderboardSelectColumns(distanceColumn));
  if (monthKey) query = query.eq("month_reference", monthKey);
  const { data: top, error } = await query.order(distanceColumn, { ascending: false }).limit(10);

  if (error || !top) {
    listEl.innerHTML = '<p class="debug-status">Não foi possível carregar o leaderboard.</p>';
    return null;
  }

  listEl.innerHTML = "";
  top.forEach((row, index) => {
    listEl.appendChild(createLeaderboardRowEl(row, index + 1, row.user_id === currentUserId, row[distanceColumn]));
  });

  const isOwnInTop = top.some((row) => row.user_id === currentUserId);
  if (isOwnInTop || !currentUserId) return top;

  let allQuery = supabaseClient.from("leaderboard").select(leaderboardSelectColumns(distanceColumn));
  if (monthKey) allQuery = allQuery.eq("month_reference", monthKey);
  const { data: allRows } = await allQuery.order(distanceColumn, { ascending: false });

  if (!allRows) return top;
  const ownIndex = allRows.findIndex((row) => row.user_id === currentUserId);
  if (ownIndex === -1) return top;

  const divider = document.createElement("p");
  divider.className = "leaderboard-divider";
  divider.textContent = "···";
  listEl.appendChild(divider);
  listEl.appendChild(createLeaderboardRowEl(allRows[ownIndex], ownIndex + 1, true, allRows[ownIndex][distanceColumn]));
  return top;
}

// Historico imutavel de medalhas: um cabecalho por mes ja fechado (mais
// recente primeiro), com o ouro/prata/bronze desse mes por baixo. So mostra
// meses que ja tiveram o "fecho" feito por checkMonthlyRollover - o mes
// corrente, ainda em curso, so aparece aqui depois de virar.
async function renderMedalHistory() {
  if (!leaderboardListHistoryEl) return;

  const { data: medals, error } = await supabaseClient
    .from("monthly_medals")
    .select("month, medal, display_name, distance_m")
    .order("month", { ascending: false });

  if (error) {
    leaderboardListHistoryEl.innerHTML = '<p class="debug-status">Não foi possível carregar o histórico.</p>';
    return;
  }

  leaderboardListHistoryEl.innerHTML = "";

  if (!medals || medals.length === 0) {
    leaderboardListHistoryEl.innerHTML = '<p class="debug-status">Ainda não há meses fechados.</p>';
    return;
  }

  const medalRank = { gold: 0, silver: 1, bronze: 2 };
  const months = [...new Set(medals.map((m) => m.month))].sort((a, b) => (a < b ? 1 : -1));

  months.forEach((month) => {
    const header = document.createElement("p");
    header.className = "leaderboard-month-header";
    const [year, monthNum] = month.split("-").map(Number);
    header.textContent = formatMonthLabel(new Date(year, monthNum - 1, 1));
    leaderboardListHistoryEl.appendChild(header);

    medals
      .filter((m) => m.month === month)
      .sort((a, b) => medalRank[a.medal] - medalRank[b.medal])
      .forEach((m) => {
        const el = document.createElement("div");
        el.className = "leaderboard-row";

        const rankEl = document.createElement("span");
        rankEl.className = "leaderboard-rank";
        rankEl.textContent = MEDAL_EMOJI_BY_TYPE[m.medal];

        const nameEl = document.createElement("span");
        nameEl.className = "leaderboard-name";
        nameEl.textContent = m.display_name;

        const distEl = document.createElement("span");
        distEl.className = "leaderboard-distance";
        distEl.textContent = formatXP(m.distance_m);

        el.append(rankEl, nameEl, distEl);
        leaderboardListHistoryEl.appendChild(el);
      });
  });
}

// Popup de trofeus de outro jogador - reutiliza a logica de agrupamento/
// desenho de js/achievements.js, so que a partir de unlocked_achievements
// do leaderboard (publico) em vez do localStorage do proprio jogador, e
// filtrado para mostrar SO as ja desbloqueadas (pedido explicito - nao e
// uma lista de "por desbloquear" de outro jogador, so os trofeus reais
// dele). Sem progresso nem popup de detalhe clicavel (nao temos esses
// dados de outro jogador), ver createAchievementItemEl(achievement,
// unlockedMap, onClick).
function renderPlayerTrophies(unlockedMap) {
  const gridEl = document.getElementById("player-trophies-grid");
  gridEl.innerHTML = "";

  const unlockedOnly = getAllAchievements(unlockedMap).filter((a) => isAchievementUnlocked(a.id, unlockedMap));

  if (unlockedOnly.length === 0) {
    gridEl.innerHTML = '<p class="debug-status">Ainda sem troféus.</p>';
    return;
  }

  groupAchievementsByCategory(unlockedOnly).forEach((items, category) => {
    if (items.length === 0) return;

    const title = document.createElement("h3");
    title.className = "achievement-category-title";
    title.textContent = category;
    gridEl.appendChild(title);

    const sectionGrid = document.createElement("div");
    sectionGrid.className = "achievements-grid";
    items.forEach((achievement) => sectionGrid.appendChild(createAchievementItemEl(achievement, unlockedMap, null)));
    gridEl.appendChild(sectionGrid);
  });
}

function openPlayerTrophiesModal(displayName, unlockedMap) {
  document.getElementById("player-trophies-name").textContent = displayName;
  renderPlayerTrophies(unlockedMap || {});
  document.getElementById("player-trophies-modal").classList.remove("hidden");
}

function closePlayerTrophiesModal() {
  document.getElementById("player-trophies-modal").classList.add("hidden");
}

document.getElementById("btn-close-player-trophies").addEventListener("click", closePlayerTrophiesModal);

async function renderLeaderboardCardNow() {
  await renderLeaderboardInto(leaderboardListEl, "lifetime_distance_m");
  await renderLeaderboardInto(leaderboardListMonthlyEl, "monthly_distance_m", formatMonthKey(new Date()));
  await renderMedalHistory();
}

// renderLeaderboardCard() e chamado de varios pontos (login, depois de
// sincronizar progresso, depois do fecho mensal) sem que os chamadores se
// coordenem entre si. Sem isto, duas chamadas sobrepostas podiam intercalar
// (uma a limpar a lista enquanto a outra ainda estava a acrescentar a linha
// "···" + a propria posicao), duplicando visualmente uma entrada. Encadear
// tudo numa fila garante que cada chamada so comeca depois da anterior
// terminar (com dados sempre atuais no momento em que corre de facto).
let leaderboardRenderQueue = Promise.resolve();

function renderLeaderboardCard() {
  leaderboardRenderQueue = leaderboardRenderQueue.then(renderLeaderboardCardNow, renderLeaderboardCardNow);
  return leaderboardRenderQueue;
}

function showLeaderboardTab(tab) {
  const tabs = {
    geral: { list: leaderboardListEl, btn: btnLeaderboardGeral },
    mensal: { list: leaderboardListMonthlyEl, btn: btnLeaderboardMensal },
    historico: { list: leaderboardListHistoryEl, btn: btnLeaderboardHistorico },
  };
  Object.entries(tabs).forEach(([key, { list, btn }]) => {
    list.classList.toggle("hidden", key !== tab);
    btn.classList.toggle("active", key === tab);
  });
}

btnLeaderboardGeral.addEventListener("click", () => showLeaderboardTab("geral"));
btnLeaderboardMensal.addEventListener("click", () => showLeaderboardTab("mensal"));
btnLeaderboardHistorico.addEventListener("click", () => showLeaderboardTab("historico"));
