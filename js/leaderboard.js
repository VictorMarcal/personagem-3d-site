// Card publico de leaderboard: top 10 por distancia vitalicia, mais a
// posicao do proprio jogador se nao estiver no top 10. Depende de globais
// definidas em js/auth.js (supabaseClient, currentUserId).
const leaderboardListEl = document.getElementById("leaderboard-list");

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
  distEl.textContent = formatDistanceKm(row.lifetime_distance_m);

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

  // Permanente: uma vez alcancado o #1, a conquista fica desbloqueada
  // mesmo que o jogador caia no ranking depois (unlockAchievement ja e
  // idempotente/so desbloqueia uma vez).
  if (top.length > 0 && top[0].user_id === currentUserId) {
    unlockAchievement("leaderboard_rank1", Date.now());
    renderAchievementsSummary();
  }

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
