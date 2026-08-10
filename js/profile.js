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

// Mesma funcao/confirmacao ja usada no botao equivalente do Debug
// (js/debug.js) - so admins veem o Debug, mas repor o proprio personagem
// e util para qualquer jogador, por isso fica tambem aqui, fora do gate.
document.getElementById("btn-reset-character-profile").addEventListener("click", resetCharacterAndDistance);

// --- Definicoes: peso corporal (kg), pre-requisito da formula de calorias/
// MET planeada (secção 17 da documentação) - so afeta o que ainda nao
// existe, guardado ja para nao bloquear essa mudanca mais tarde.
const profileWeightInputEl = document.getElementById("profile-weight-input");
const profileWeightStatusEl = document.getElementById("profile-weight-status");

function renderProfileSettings() {
  profileWeightInputEl.value = getPesoKg();
}

document.getElementById("btn-save-weight").addEventListener("click", () => {
  const kg = Number(profileWeightInputEl.value);
  if (!Number.isFinite(kg) || kg < 20 || kg > 300) {
    profileWeightStatusEl.textContent = "Peso inválido (entre 20 e 300 kg).";
    return;
  }
  setPesoKg(kg);
  profileWeightStatusEl.textContent = "Guardado!";
});

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

// getDay(): 0 = domingo, 1 = segunda, ... 6 = sabado.
const WEEKDAY_FULL_NAMES_PT = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];

function formatDayHeaderLabel(date) {
  const weekday = WEEKDAY_FULL_NAMES_PT[date.getDay()];
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yy = String(date.getFullYear()).slice(-2);
  return `${weekday} ${dd}-${mm}-${yy}`;
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
  addSummaryRow(listEl, "Distância total esta semana", formatDistanceKm(weekTotal));
  addSummaryRow(listEl, "Sessão mais longa esta semana", formatDistanceKm(weekMax));
  addSummaryRow(listEl, "Distância total este mês", formatDistanceKm(monthTotal));
  addSummaryRow(listEl, "Sessão mais longa este mês", formatDistanceKm(monthMax));
  addSummaryRow(listEl, "Dias distintos treinados", `${distinctDays}`);
  addSummaryRow(listEl, "Recorde de distância", formatDistanceKm(getBestSessionDistanceM()));
  addSummaryRow(listEl, "Recorde de velocidade", formatSpeedKmh(getBestPaceMps()));
  addSummaryRow(listEl, "Distância anulada por excesso de velocidade", formatDistanceKm(getDiscardedSpeedDistanceM()));
}

// --- Historico agrupado por mes, com os dias dentro de cada mes ---------

// Limitado aos ultimos 24 meses com treino para a lista nao crescer sem
// fim - os graficos abaixo continuam a cobrir a historia completa.
const HISTORY_MAX_MONTHS = 24;

// Formata uma sessao individual para uma linha da lista (2026-08-06, a
// pedido - antes um dia com varios treinos era resumido numa unica linha
// somada, com o modo a aparecer como "Misto" quando havia mais que um).
function formatSessionListItem(s) {
  const distance = toNum(s.distance_m);
  const duration = toNum(s.duration_seconds);
  const avgSpeedMps = duration > 0 ? distance / duration : 0;
  const modeLabel = MODE_LABEL_PT[s.mode] || "Treino";
  return `${modeLabel} — ${formatDistanceKm(distance)} · ${Math.round(duration / 60)} min · ${formatSpeedKmh(avgSpeedMps)}`;
}

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
    const entry = byDay.get(key) || { date, sessions: [] };
    entry.sessions.push(s);
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
    days.forEach((dayEntry) => {
      const dayTitle = document.createElement("p");
      dayTitle.className = "profile-history-day-title";
      dayTitle.textContent = formatDayHeaderLabel(dayEntry.date);
      listEl.appendChild(dayTitle);

      const sessionListEl = document.createElement("ul");
      sessionListEl.className = "profile-history-session-list";

      const daySessions = [...dayEntry.sessions].sort((a, b) => new Date(b.started_at) - new Date(a.started_at));
      daySessions.forEach((s) => {
        const item = document.createElement("li");
        item.textContent = formatSessionListItem(s);
        sessionListEl.appendChild(item);
      });

      listEl.appendChild(sessionListEl);
    });
  });
}

// --- Graficos (SVG desenhado a mao, sem biblioteca) ----------------------

// Alturas partilhadas entre o eixo dos YY e as barras, para as linhas de
// grelha e os rotulos de km baterem certo com o topo real de cada barra.
// CHART_TOP_PADDING da espaco para o texto do valor mais alto (topo) nao
// ficar cortado no limite superior do SVG - sem isto, o "ascender" da
// fonte (acima da linha de base) ficava fora do viewBox e era cortado.
const CHART_TOP_PADDING = 10;
const CHART_HEIGHT = 100;
const CHART_LABEL_HEIGHT = 14;
const CHART_TOTAL_HEIGHT = CHART_TOP_PADDING + CHART_HEIGHT + CHART_LABEL_HEIGHT;
const CHART_YAXIS_WIDTH = 42;
// 3 marcas (topo/meio/zero) - suficiente para dar escala sem sobrecarregar
// um grafico ja pequeno; posicoes fixas em px (independentes do maxValue).
const CHART_YAXIS_TICK_FRACTIONS = [1, 0.5, 0];

function chartTickY(fraction) {
  return CHART_TOP_PADDING + CHART_HEIGHT * (1 - fraction);
}

// Eixo dos YY: coluna fixa (nao acompanha o scroll horizontal das barras -
// ver .profile-chart-yaxis/.profile-chart-scroll em css/style.css), para
// os rotulos de km ficarem sempre visiveis mesmo com muitas barras (ex: o
// grafico "todos os meses" ou um mes com 31 dias).
function buildYAxisSvg(maxValue) {
  const labels = CHART_YAXIS_TICK_FRACTIONS.map((fraction) => {
    const y = chartTickY(fraction);
    const value = maxValue * fraction;
    return `<text x="${CHART_YAXIS_WIDTH - 4}" y="${y + 3}" text-anchor="end" font-size="8" fill="#888">${formatDistanceKm(value)}</text>`;
  }).join("");

  return `<svg viewBox="0 0 ${CHART_YAXIS_WIDTH} ${CHART_TOTAL_HEIGHT}" width="${CHART_YAXIS_WIDTH}" height="${CHART_TOTAL_HEIGHT}" xmlns="http://www.w3.org/2000/svg">${labels}</svg>`;
}

function buildBarChartSvg(entries, maxValue) {
  const barWidth = 14;
  const gap = 4;
  const width = Math.max(1, entries.length * (barWidth + gap) - gap);

  // Linhas de grelha tenues, alinhadas com as marcas do eixo dos YY, para
  // ser facil ler a que valor corresponde o topo de cada barra.
  const gridLines = CHART_YAXIS_TICK_FRACTIONS.map((fraction) => {
    const y = chartTickY(fraction);
    return `<line x1="0" y1="${y}" x2="${width}" y2="${y}" stroke="#2a2a30" stroke-width="1" />`;
  }).join("");

  const bars = entries
    .map((entry, i) => {
      const barHeight = Math.max(1, Math.round((entry.value / maxValue) * CHART_HEIGHT));
      const x = i * (barWidth + gap);
      const y = CHART_TOP_PADDING + (CHART_HEIGHT - barHeight);
      const labelX = x + barWidth / 2;
      return (
        `<rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" fill="#4a90d9" rx="2"><title>${entry.label}: ${formatDistanceKm(entry.value)}</title></rect>` +
        `<text x="${labelX}" y="${CHART_TOP_PADDING + CHART_HEIGHT + CHART_LABEL_HEIGHT - 3}" text-anchor="middle" font-size="8" fill="#888">${entry.label}</text>`
      );
    })
    .join("");

  return `<svg viewBox="0 0 ${width} ${CHART_TOTAL_HEIGHT}" width="${width}" height="${CHART_TOTAL_HEIGHT}" xmlns="http://www.w3.org/2000/svg">${gridLines}${bars}</svg>`;
}

// Junta o eixo (fixo) com as barras (scroll horizontal) - container.innerHTML
// e substituido por isto em vez de so pelas barras, nas 3 chamadas abaixo.
function buildChartWithAxis(entries) {
  const maxValue = Math.max(1, ...entries.map((e) => e.value));
  return (
    `<div class="profile-chart-yaxis">${buildYAxisSvg(maxValue)}</div>` +
    `<div class="profile-chart-scroll">${buildBarChartSvg(entries, maxValue)}</div>`
  );
}

function sumDistanceInRange(sessions, start, end) {
  return sessions
    .filter((s) => {
      const t = new Date(s.started_at);
      return t >= start && t < end;
    })
    .reduce((sum, s) => sum + toNum(s.distance_m), 0);
}

// --- Navegacao de semana no grafico "Esta semana" -------------------------
//
// Mesmo padrao da navegacao de mes, mas por semana ISO (comeca a segunda).
// Por omissao mostra a semana atual; as setas deixam recuar ate a semana
// do primeiro treino de sempre.

let cachedSessions = [];
let selectedWeekCursor = getStartOfIsoWeek(new Date());

const btnWeekChartPrev = document.getElementById("btn-week-chart-prev");
const btnWeekChartNext = document.getElementById("btn-week-chart-next");
const profileWeekChartLabelEl = document.getElementById("profile-week-chart-label");

const WEEKDAY_NAMES_PT = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

function isSameIsoWeek(a, b) {
  return getStartOfIsoWeek(a).getTime() === getStartOfIsoWeek(b).getTime();
}

function formatWeekLabel(weekStart) {
  const weekEnd = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 6);
  const fmt = (d) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
  return `${fmt(weekStart)} - ${fmt(weekEnd)}`;
}

function getEarliestSessionWeek() {
  if (cachedSessions.length === 0) return getStartOfIsoWeek(new Date());
  return getStartOfIsoWeek(new Date(cachedSessions[0].started_at));
}

function renderWeekChart(sessions, weekCursor) {
  const container = document.getElementById("profile-chart-week");
  const now = new Date();
  const lastDayIndex = isSameIsoWeek(weekCursor, now) ? now.getDay() === 0 ? 6 : now.getDay() - 1 : 6;

  const entries = [];
  for (let i = 0; i <= lastDayIndex; i++) {
    const dayStart = new Date(weekCursor.getFullYear(), weekCursor.getMonth(), weekCursor.getDate() + i);
    const dayEnd = new Date(weekCursor.getFullYear(), weekCursor.getMonth(), weekCursor.getDate() + i + 1);
    entries.push({ label: WEEKDAY_NAMES_PT[i], value: sumDistanceInRange(sessions, dayStart, dayEnd) });
  }

  container.innerHTML = buildChartWithAxis(entries);
}

function renderSelectedWeekChart() {
  const now = new Date();
  const earliest = getEarliestSessionWeek();

  profileWeekChartLabelEl.textContent = isSameIsoWeek(selectedWeekCursor, now)
    ? "Esta semana"
    : formatWeekLabel(selectedWeekCursor);
  btnWeekChartPrev.disabled = selectedWeekCursor <= earliest;
  btnWeekChartNext.disabled = isSameIsoWeek(selectedWeekCursor, now);

  renderWeekChart(cachedSessions, selectedWeekCursor);
}

btnWeekChartPrev.addEventListener("click", () => {
  if (btnWeekChartPrev.disabled) return;
  selectedWeekCursor = new Date(selectedWeekCursor.getFullYear(), selectedWeekCursor.getMonth(), selectedWeekCursor.getDate() - 7);
  renderSelectedWeekChart();
});

btnWeekChartNext.addEventListener("click", () => {
  if (btnWeekChartNext.disabled) return;
  selectedWeekCursor = new Date(selectedWeekCursor.getFullYear(), selectedWeekCursor.getMonth(), selectedWeekCursor.getDate() + 7);
  renderSelectedWeekChart();
});

// --- Navegacao de mes no grafico "Este mes" -------------------------------
//
// Por omissao mostra o mes atual; as setas deixam recuar ate ao mes do
// primeiro treino de sempre. Reposto para o mes atual sempre que a aba
// e reaberta (nao persiste a escolha entre visitas).

let selectedMonthCursor = getStartOfLocalMonth(new Date());

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

  container.innerHTML = buildChartWithAxis(entries);
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
    entries.push({ label: MONTH_NAMES_PT[cursor.getMonth()].slice(0, 3), value: sumDistanceInRange(sessions, monthStart, monthEnd) });
    cursor = monthEnd;
  }

  container.innerHTML = buildChartWithAxis(entries);
}

// --- Orquestrador ---------------------------------------------------------

async function renderProfileTab() {
  if (!currentUserId) return; // ainda sem sessao confirmada

  const { data: sessions, error } = await supabaseClient
    .from("training_sessions")
    .select("started_at, distance_m, mode, duration_seconds")
    .eq("user_id", currentUserId)
    .order("started_at");

  if (error || !sessions) {
    console.error("Falha ao carregar historico de treinos:", error);
    document.getElementById("profile-history-list").innerHTML =
      '<p class="profile-history-empty">Não foi possível carregar o histórico.</p>';
    return;
  }

  cachedSessions = sessions;
  selectedWeekCursor = getStartOfIsoWeek(new Date());
  selectedMonthCursor = getStartOfLocalMonth(new Date());

  renderProfileSettings();
  renderProfileSummary(sessions);
  renderProfileHistory(sessions);
  renderSelectedWeekChart();
  renderSelectedMonthChart();
  renderAllMonthsChart(sessions);
  checkFrequencyAchievementsFromSessions(sessions);
}
