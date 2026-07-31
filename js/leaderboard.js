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

const MEDAL_EMOJI_BY_RANK = ["🥇", "🥈", "🥉"];
const MEDAL_EMOJI_BY_TYPE = { gold: "🥇", silver: "🥈", bronze: "🥉" };

function createLeaderboardRowEl(row, rank, isOwn, distanceM, medalEmoji) {
  const el = document.createElement("div");
  el.className = "leaderboard-row" + (isOwn ? " own" : "");

  const rankEl = document.createElement("span");
  rankEl.className = "leaderboard-rank";
  rankEl.textContent = medalEmoji ? `${medalEmoji} #${rank}` : `#${rank}`;

  const nameEl = document.createElement("span");
  nameEl.className = "leaderboard-name";
  nameEl.textContent = row.display_name;

  const distEl = document.createElement("span");
  distEl.className = "leaderboard-distance";
  distEl.textContent = formatDistanceKm(distanceM);

  el.append(rankEl, nameEl, distEl);
  return el;
}

// distanceColumn: "lifetime_distance_m" (geral) ou "monthly_distance_m"
// (mensal). Quando monthKey e passado, filtra so as linhas cujo
// month_reference bate com o mes corrente - sem isto, jogadores que ainda
// nao fizeram login desde a virada do mes apareceriam com a distancia do
// mes anterior, que ainda nao foi resetada na sua linha. showMedals poe
// 🥇🥈🥉 nas 3 primeiras posicoes do top (usado so no ranking mensal - o
// geral ja tem a sua propria conquista de "Nº1 do Leaderboard").
async function renderLeaderboardInto(listEl, distanceColumn, monthKey, showMedals) {
  if (!listEl) return null;

  let query = supabaseClient.from("leaderboard").select(`user_id, display_name, ${distanceColumn}`);
  if (monthKey) query = query.eq("month_reference", monthKey);
  const { data: top, error } = await query.order(distanceColumn, { ascending: false }).limit(10);

  if (error || !top) {
    listEl.innerHTML = '<p class="debug-status">Não foi possível carregar o leaderboard.</p>';
    return null;
  }

  listEl.innerHTML = "";
  top.forEach((row, index) => {
    const medal = showMedals ? MEDAL_EMOJI_BY_RANK[index] : null;
    listEl.appendChild(createLeaderboardRowEl(row, index + 1, row.user_id === currentUserId, row[distanceColumn], medal));
  });

  const isOwnInTop = top.some((row) => row.user_id === currentUserId);
  if (isOwnInTop || !currentUserId) return top;

  let allQuery = supabaseClient.from("leaderboard").select(`user_id, display_name, ${distanceColumn}`);
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
        distEl.textContent = formatDistanceKm(m.distance_m);

        el.append(rankEl, nameEl, distEl);
        leaderboardListHistoryEl.appendChild(el);
      });
  });
}

async function renderLeaderboardCard() {
  const top = await renderLeaderboardInto(leaderboardListEl, "lifetime_distance_m");

  // Permanente: uma vez alcancado o #1 geral, a conquista fica desbloqueada
  // mesmo que o jogador caia no ranking depois (unlockAchievement ja e
  // idempotente/so desbloqueia uma vez).
  if (top && top.length > 0 && top[0].user_id === currentUserId) {
    unlockAchievement("leaderboard_rank1", Date.now());
    renderAchievementsSummary();
  }

  await renderLeaderboardInto(leaderboardListMonthlyEl, "monthly_distance_m", formatMonthKey(new Date()), true);
  await renderMedalHistory();
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
