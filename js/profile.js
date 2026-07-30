// Aba de Perfil: status/equipamento (so leitura, dados ja existentes) e
// metricas derivadas do historico de sessoes em training_sessions
// (Supabase). Tudo calculado no cliente - o volume de sessoes de um grupo
// de amigos e trivial para reduzir em JS, sem precisar de views/RPC.
//
// Semana = semana ISO (comeca a segunda), mes = mes de calendario, sempre
// em hora local, tal como o resto do jogo ja usa Date/Date.now() local.

const btnNavJogo = document.getElementById("btn-nav-jogo");
const btnNavPerfil = document.getElementById("btn-nav-perfil");
const viewJogoEl = document.getElementById("view-jogo");
const viewPerfilEl = document.getElementById("view-perfil");

function toNum(value) {
  return Number(value) || 0;
}

function getStartOfLocalMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function getStartOfIsoWeek(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay(); // 0 = domingo
  const diff = day === 0 ? 6 : day - 1; // segunda-feira = inicio da semana ISO
  d.setDate(d.getDate() - diff);
  return d;
}

function formatDayKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatMonthKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

const MONTH_NAMES_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function formatMonthLabel(date) {
  return `${MONTH_NAMES_PT[date.getMonth()]} ${date.getFullYear()}`;
}

function isSameMonth(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

// --- Navegacao entre abas ---------------------------------------------

function showView(name) {
  const showingPerfil = name === "perfil";
  viewJogoEl.classList.toggle("hidden", showingPerfil);
  viewPerfilEl.classList.toggle("hidden", !showingPerfil);
  btnNavJogo.classList.toggle("active", !showingPerfil);
  btnNavPerfil.classList.toggle("active", showingPerfil);
  jogoViewVisible = !showingPerfil; // global de js/main.js

  if (showingPerfil) renderProfileTab();
}

btnNavJogo.addEventListener("click", () => showView("jogo"));
btnNavPerfil.addEventListener("click", () => showView("perfil"));

// Chamado por js/training.js depois de confirmar sessoes pendentes no
// Supabase - so vale a pena voltar a renderizar se a aba estiver aberta.
function onTrainingSessionsSynced() {
  if (!viewPerfilEl.classList.contains("hidden")) renderProfileTab();
}

// --- Status/Equipamento (dados ja existentes, so leitura) ---------------

function renderProfileStatusSection() {
  document.getElementById("profile-stat-vida").textContent = computeStatValue("vida", getEquipLevel("vida"));
  document.getElementById("profile-stat-ataque").textContent = computeStatValue("ataque", getEquipLevel("ataque"));
  document.getElementById("profile-stat-defesa").textContent = computeStatValue("defesa", getEquipLevel("defesa"));
  document.getElementById("profile-level-vida").textContent = getEquipLevel("vida");
  document.getElementById("profile-level-ataque").textContent = getEquipLevel("ataque");
  document.getElementById("profile-level-defesa").textContent = getEquipLevel("defesa");
}

// --- Resumo (semana/mes atual + dias distintos) -------------------------

function addSummaryRow(listEl, label, value) {
  const row = document.createElement("div");
  row.className = "profile-summary-row";

  const labelEl = document.createElement("span");
  labelEl.className = "profile-summary-label";
  labelEl.textContent = label;

  const valueEl = document.createElement("span");
  valueEl.className = "profile-summary-value";
  valueEl.textContent = value;

  row.append(labelEl, valueEl);
  listEl.appendChild(row);
}

function renderProfileSummary(sessions) {
  const now = new Date();
  const startOfWeek = getStartOfIsoWeek(now);
  const startOfMonth = getStartOfLocalMonth(now);

  const weekSessions = sessions.filter((s) => new Date(s.started_at) >= startOfWeek);
  const monthSessions = sessions.filter((s) => new Date(s.started_at) >= startOfMonth);

  const weekTotal = weekSessions.reduce((sum, s) => sum + toNum(s.distance_m), 0);
  const weekMax = weekSessions.reduce((max, s) => Math.max(max, toNum(s.distance_m)), 0);
  const monthTotal = monthSessions.reduce((sum, s) => sum + toNum(s.distance_m), 0);
  const monthMax = monthSessions.reduce((max, s) => Math.max(max, toNum(s.distance_m)), 0);
  const distinctDays = new Set(sessions.map((s) => formatDayKey(new Date(s.started_at)))).size;

  const listEl = document.getElementById("profile-summary-list");
  listEl.innerHTML = "";
  addSummaryRow(listEl, "Distância total esta semana", `${Math.round(weekTotal)} m`);
  addSummaryRow(listEl, "Sessão mais longa esta semana", `${Math.round(weekMax)} m`);
  addSummaryRow(listEl, "Distância total este mês", `${Math.round(monthTotal)} m`);
  addSummaryRow(listEl, "Sessão mais longa este mês", `${Math.round(monthMax)} m`);
  addSummaryRow(listEl, "Dias distintos treinados", `${distinctDays}`);
}

// --- Historico agrupado por mes, com os dias dentro de cada mes ---------

// Limitado aos ultimos 24 meses com treino para a lista nao crescer sem
// fim - os graficos abaixo continuam a cobrir a historia completa.
const HISTORY_MAX_MONTHS = 24;

function renderProfileHistory(sessions) {
  const listEl = document.getElementById("profile-history-list");
  listEl.innerHTML = "";

  if (sessions.length === 0) {
    listEl.innerHTML = '<p class="profile-history-empty">Ainda não há treinos registados.</p>';
    return;
  }

  const byDay = new Map();
  sessions.forEach((s) => {
    const date = new Date(s.started_at);
    const key = formatDayKey(date);
    const entry = byDay.get(key) || { date, distance: 0, duration: 0, count: 0 };
    entry.distance += toNum(s.distance_m);
    entry.duration += toNum(s.duration_seconds);
    entry.count += 1;
    byDay.set(key, entry);
  });

  const byMonth = new Map();
  byDay.forEach((entry, dayKey) => {
    const monthKey = formatMonthKey(entry.date);
    if (!byMonth.has(monthKey)) byMonth.set(monthKey, []);
    byMonth.get(monthKey).push({ dayKey, ...entry });
  });

  const monthKeys = Array.from(byMonth.keys()).sort().reverse().slice(0, HISTORY_MAX_MONTHS);

  monthKeys.forEach((monthKey) => {
    const title = document.createElement("p");
    title.className = "profile-history-group-title";
    title.textContent = formatMonthLabel(byMonth.get(monthKey)[0].date);
    listEl.appendChild(title);

    const days = byMonth.get(monthKey).sort((a, b) => (a.dayKey < b.dayKey ? 1 : -1));
    days.forEach((entry) => {
      const row = document.createElement("div");
      row.className = "profile-history-row";

      const label = document.createElement("span");
      label.textContent = entry.count > 1 ? `${entry.dayKey} (${entry.count} treinos)` : entry.dayKey;

      const value = document.createElement("span");
      value.textContent = `${Math.round(entry.distance)} m · ${Math.round(entry.duration / 60)} min`;

      row.append(label, value);
      listEl.appendChild(row);
    });
  });
}

// --- Graficos (SVG desenhado a mao, sem biblioteca) ----------------------

function buildBarChartSvg(entries) {
  const barWidth = 14;
  const gap = 4;
  const chartHeight = 100;
  const maxValue = Math.max(1, ...entries.map((e) => e.value));
  const width = Math.max(1, entries.length * (barWidth + gap) - gap);

  const bars = entries
    .map((entry, i) => {
      const barHeight = Math.max(1, Math.round((entry.value / maxValue) * chartHeight));
      const x = i * (barWidth + gap);
      const y = chartHeight - barHeight;
      return `<rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" fill="#4a90d9" rx="2"><title>${entry.label}: ${Math.round(entry.value)} m</title></rect>`;
    })
    .join("");

  return `<svg viewBox="0 0 ${width} ${chartHeight}" width="${width}" height="${chartHeight}" xmlns="http://www.w3.org/2000/svg">${bars}</svg>`;
}

function sumDistanceInRange(sessions, start, end) {
  return sessions
    .filter((s) => {
      const t = new Date(s.started_at);
      return t >= start && t < end;
    })
    .reduce((sum, s) => sum + toNum(s.distance_m), 0);
}

// --- Navegacao de mes no grafico "Este mes" -------------------------------
//
// Por omissao mostra o mes atual; as setas deixam recuar ate ao mes do
// primeiro treino de sempre. Reposto para o mes atual sempre que a aba
// e reaberta (nao persiste a escolha entre visitas).

let cachedSessions = [];
let selectedMonthCursor = new Date();

const btnMonthChartPrev = document.getElementById("btn-month-chart-prev");
const btnMonthChartNext = document.getElementById("btn-month-chart-next");
const profileMonthChartLabelEl = document.getElementById("profile-month-chart-label");

function getEarliestSessionMonth() {
  if (cachedSessions.length === 0) return getStartOfLocalMonth(new Date());
  return getStartOfLocalMonth(new Date(cachedSessions[0].started_at));
}

function renderMonthChart(sessions, monthCursor) {
  const container = document.getElementById("profile-chart-month");
  const now = new Date();
  const lastDay = isSameMonth(monthCursor, now)
    ? now.getDate()
    : new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 0).getDate();

  const entries = [];
  for (let day = 1; day <= lastDay; day++) {
    const dayStart = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), day);
    const dayEnd = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), day + 1);
    entries.push({ label: String(day), value: sumDistanceInRange(sessions, dayStart, dayEnd) });
  }

  container.innerHTML = buildBarChartSvg(entries);
}

function renderSelectedMonthChart() {
  const now = new Date();
  const earliest = getEarliestSessionMonth();

  profileMonthChartLabelEl.textContent = isSameMonth(selectedMonthCursor, now)
    ? "Este mês"
    : formatMonthLabel(selectedMonthCursor);
  btnMonthChartPrev.disabled = selectedMonthCursor <= earliest;
  btnMonthChartNext.disabled = isSameMonth(selectedMonthCursor, now);

  renderMonthChart(cachedSessions, selectedMonthCursor);
}

btnMonthChartPrev.addEventListener("click", () => {
  if (btnMonthChartPrev.disabled) return;
  selectedMonthCursor = new Date(selectedMonthCursor.getFullYear(), selectedMonthCursor.getMonth() - 1, 1);
  renderSelectedMonthChart();
});

btnMonthChartNext.addEventListener("click", () => {
  if (btnMonthChartNext.disabled) return;
  selectedMonthCursor = new Date(selectedMonthCursor.getFullYear(), selectedMonthCursor.getMonth() + 1, 1);
  renderSelectedMonthChart();
});

function renderAllMonthsChart(sessions) {
  const container = document.getElementById("profile-chart-all-months");

  if (sessions.length === 0) {
    container.innerHTML = '<p class="profile-history-empty">Sem dados suficientes.</p>';
    return;
  }

  const now = new Date();
  let cursor = getStartOfLocalMonth(new Date(sessions[0].started_at));
  const entries = [];

  while (cursor <= now) {
    const monthStart = cursor;
    const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    entries.push({ label: formatMonthKey(cursor), value: sumDistanceInRange(sessions, monthStart, monthEnd) });
    cursor = monthEnd;
  }

  container.innerHTML = buildBarChartSvg(entries);
}

// --- Orquestrador ---------------------------------------------------------

async function renderProfileTab() {
  renderProfileStatusSection();

  if (!currentUserId) return; // ainda sem sessao confirmada

  const { data: sessions, error } = await supabaseClient
    .from("training_sessions")
    .select("started_at, distance_m, duration_seconds")
    .eq("user_id", currentUserId)
    .order("started_at");

  if (error || !sessions) {
    console.error("Falha ao carregar historico de treinos:", error);
    document.getElementById("profile-history-list").innerHTML =
      '<p class="profile-history-empty">Não foi possível carregar o histórico.</p>';
    return;
  }

  cachedSessions = sessions;
  selectedMonthCursor = new Date();

  renderProfileSummary(sessions);
  renderProfileHistory(sessions);
  renderSelectedMonthChart();
  renderAllMonthsChart(sessions);
}
