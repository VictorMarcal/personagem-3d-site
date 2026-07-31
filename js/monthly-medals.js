// Medalhas mensais (Ouro/Prata/Bronze para o top 3 do leaderboard de cada
// mes de calendario). Depende de globais de js/auth.js (supabaseClient,
// currentUserId, currentDisplayName) e de js/profile.js (formatMonthKey).

function getMonthlyDistanceM() {
  return Number(localStorage.getItem(STORAGE_KEY_MONTHLY_DISTANCE_M)) || 0;
}

function addToMonthlyDistance(deltaM) {
  if (deltaM <= 0) return;
  localStorage.setItem(STORAGE_KEY_MONTHLY_DISTANCE_M, String(getMonthlyDistanceM() + deltaM));
  queueProgressSync();
}

function getMonthReference() {
  return localStorage.getItem(STORAGE_KEY_MONTH_REFERENCE) || formatMonthKey(new Date());
}

function setMonthReference(monthKey) {
  localStorage.setItem(STORAGE_KEY_MONTH_REFERENCE, monthKey);
}

function medalAchievementId(medal, month) {
  return `medal_${medal}_${month.replace("-", "_")}`;
}

// Chamado uma vez por login (js/auth.js). So faz trabalho de verdade
// quando o mes de calendario mudou desde a ultima vez que este jogador
// fez login - senao so reclama medalhas que outra pessoa possa ja ter
// publicado em meu nome.
async function checkMonthlyRollover() {
  if (!currentUserId) return;
  const currentMonthKey = formatMonthKey(new Date());

  const claimOwnMedals = async () => {
    const { data: myMedals } = await supabaseClient
      .from("monthly_medals")
      .select("month, medal, awarded_at")
      .eq("user_id", currentUserId);
    (myMedals || []).forEach((row) => {
      unlockAchievement(medalAchievementId(row.medal, row.month), new Date(row.awarded_at).getTime());
    });
  };

  await claimOwnMedals();

  const { data: own } = await supabaseClient
    .from("leaderboard")
    .select("monthly_distance_m, previous_month_distance_m, month_reference, previous_month_reference")
    .eq("user_id", currentUserId)
    .maybeSingle();

  if (!own || own.month_reference === currentMonthKey) {
    renderAchievementsSummary();
    return;
  }

  const endedMonth = own.month_reference;

  // So publica a "fotografia" do mes que terminou se ainda ninguem o fez
  const { data: existing } = await supabaseClient
    .from("monthly_medals")
    .select("id")
    .eq("month", endedMonth)
    .limit(1);

  if (!existing || existing.length === 0) {
    const { data: allRows } = await supabaseClient
      .from("leaderboard")
      .select("user_id, display_name, monthly_distance_m, month_reference, previous_month_distance_m, previous_month_reference");

    const ranked = (allRows || [])
      .map((r) => ({
        user_id: r.user_id,
        display_name: r.display_name,
        distance:
          r.month_reference === endedMonth
            ? r.monthly_distance_m
            : r.previous_month_reference === endedMonth
              ? r.previous_month_distance_m
              : 0,
      }))
      .filter((r) => r.distance > 0)
      .sort((a, b) => b.distance - a.distance)
      .slice(0, 3);

    const medalOrder = ["gold", "silver", "bronze"];
    const medalRows = ranked.map((r, index) => ({
      month: endedMonth,
      medal: medalOrder[index],
      user_id: r.user_id,
      display_name: r.display_name,
      distance_m: r.distance,
    }));

    if (medalRows.length > 0) {
      await supabaseClient.from("monthly_medals").upsert(medalRows, { onConflict: "month,medal", ignoreDuplicates: true });
    }
  }

  // Roda a minha propria linha: guarda o mes que terminou como "anterior"
  // e reinicia o contador corrente
  await supabaseClient.from("leaderboard").upsert({
    user_id: currentUserId,
    display_name: currentDisplayName(),
    previous_month_distance_m: own.monthly_distance_m,
    previous_month_reference: endedMonth,
    monthly_distance_m: 0,
    month_reference: currentMonthKey,
  });
  localStorage.setItem(STORAGE_KEY_MONTHLY_DISTANCE_M, "0");
  setMonthReference(currentMonthKey);

  // Pode ter acabado de creditar a mim proprio agora mesmo
  await claimOwnMedals();
  renderAchievementsSummary();
}
