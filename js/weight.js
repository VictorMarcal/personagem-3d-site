// Historico de peso (2026-09-07, a pedido: "histórico de peso com data de
// introdução" + "gráfico que mostra a evolução do peso"). Sem limite de
// cadencia entre alteracoes (2026-09-12, a pedido: "remove o intervalo de
// tempo para colocar o peso") - podes registar sempre que quiseres.
//
// O peso ATUAL continua onde estava (STORAGE_KEY_WEIGHT_KG, lido por
// getPesoKg() na formula das calorias) - isto e aditivo e nao mexe em nada do
// calculo. O que e novo e a tabela weight_history no Supabase, que guarda
// cada valor com a data em que foi introduzido.
const WEIGHT_MIN_KG = 20;
const WEIGHT_MAX_KG = 300;

let weightHistoryCache = [];

// --- dados ------------------------------------------------------------------

async function loadWeightHistory() {
  if (!currentUserId) return [];
  const { data, error } = await supabaseClient
    .from("weight_history")
    .select("peso_kg, recorded_at")
    .eq("user_id", currentUserId)
    .order("recorded_at", { ascending: true });

  if (error || !data) return weightHistoryCache;
  weightHistoryCache = data.map((r) => ({
    kg: Number(r.peso_kg),
    data: new Date(r.recorded_at),
  }));
  return weightHistoryCache;
}

function ultimoRegistoPeso() {
  return weightHistoryCache.length > 0 ? weightHistoryCache[weightHistoryCache.length - 1] : null;
}

// Devolve { ok, motivo }. Nunca lanca - quem chama e um handler de clique.
async function registarPeso(kg) {
  if (!Number.isFinite(kg) || kg < WEIGHT_MIN_KG || kg > WEIGHT_MAX_KG) {
    return { ok: false, motivo: `Peso inválido (entre ${WEIGHT_MIN_KG} e ${WEIGHT_MAX_KG} kg).` };
  }
  if (!currentUserId) {
    return { ok: false, motivo: "Precisas de estar ligado para guardar o peso." };
  }

  const { error } = await supabaseClient
    .from("weight_history")
    .insert({ user_id: currentUserId, peso_kg: kg });

  if (error) {
    return { ok: false, motivo: "Não foi possível guardar. Tenta outra vez." };
  }

  // O peso atual (usado nas calorias) so muda depois de o registo ficar
  // gravado - se a rede falhar, os dois lados ficam coerentes.
  setPesoKg(kg);
  queueProgressSync();
  await loadWeightHistory();
  return { ok: true };
}

// --- grafico ----------------------------------------------------------------
//
// LINHA e nao barras, ao contrario dos graficos de distancia/calorias: o peso
// e uma serie continua, o que interessa e a FORMA da evolucao, e barras a
// partir do zero sugeririam uma grandeza acumulada que nao existe.
//
// E o eixo dos YY NAO comeca no zero, tambem ao contrario dos outros: numa
// escala de 0 a 90 kg, perder 2 kg era um pixel e nao se via nada. A escala
// ajusta-se ao intervalo real, com uma folga de 1 kg de cada lado.
const WCHART_TOP = 10;
const WCHART_HEIGHT = 100;
const WCHART_LABEL_H = 14;
const WCHART_TOTAL_H = WCHART_TOP + WCHART_HEIGHT + WCHART_LABEL_H;
const WCHART_YAXIS_W = 42;
const WCHART_FOLGA_KG = 1;

function formatKg(kg) {
  return `${kg.toFixed(1)} kg`;
}

function formatDataCurta(d) {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function escalaPeso(registos) {
  const valores = registos.map((r) => r.kg);
  let min = Math.min(...valores) - WCHART_FOLGA_KG;
  let max = Math.max(...valores) + WCHART_FOLGA_KG;
  // Um unico registo (ou todos iguais) daria min === max e uma divisao por
  // zero - abre-se uma janela minima a volta do valor.
  if (max - min < 2) {
    const meio = (max + min) / 2;
    min = meio - 1;
    max = meio + 1;
  }
  return { min, max };
}

function buildWeightYAxis(min, max) {
  const marcas = [1, 0.5, 0].map((f) => {
    const y = WCHART_TOP + WCHART_HEIGHT * (1 - f);
    const valor = min + (max - min) * f;
    return `<text x="${WCHART_YAXIS_W - 4}" y="${y + 3}" text-anchor="end" font-size="8">${valor.toFixed(1)}</text>`;
  }).join("");
  return `<svg viewBox="0 0 ${WCHART_YAXIS_W} ${WCHART_TOTAL_H}" width="${WCHART_YAXIS_W}" height="${WCHART_TOTAL_H}" xmlns="http://www.w3.org/2000/svg">${marcas}</svg>`;
}

function buildWeightLineSvg(registos, min, max) {
  const passo = 46;
  const width = Math.max(1, (registos.length - 1) * passo + 20);
  const yDe = (kg) => WCHART_TOP + WCHART_HEIGHT * (1 - (kg - min) / (max - min));
  const xDe = (i) => 10 + i * passo;

  const grelha = [1, 0.5, 0].map((f) => {
    const y = WCHART_TOP + WCHART_HEIGHT * (1 - f);
    return `<line x1="0" y1="${y}" x2="${width}" y2="${y}" class="wchart-grid" />`;
  }).join("");

  const linha = registos.map((r, i) => `${i ? "L" : "M"}${xDe(i)} ${yDe(r.kg).toFixed(1)}`).join(" ");

  const pontos = registos.map((r, i) => {
    const x = xDe(i);
    const y = yDe(r.kg);
    return (
      `<circle cx="${x}" cy="${y.toFixed(1)}" r="3.5" class="wchart-dot"><title>${formatKg(r.kg)} — ${r.data.toLocaleDateString("pt-PT")}</title></circle>` +
      `<text x="${x}" y="${WCHART_TOP + WCHART_HEIGHT + WCHART_LABEL_H - 3}" text-anchor="middle" font-size="8">${formatDataCurta(r.data)}</text>`
    );
  }).join("");

  return (
    `<svg viewBox="0 0 ${width} ${WCHART_TOTAL_H}" width="${width}" height="${WCHART_TOTAL_H}" xmlns="http://www.w3.org/2000/svg">` +
    `${grelha}<path d="${linha}" class="wchart-line" fill="none" />${pontos}</svg>`
  );
}

// --- interface --------------------------------------------------------------

function renderWeightHistory() {
  const grafico = document.getElementById("weight-chart");
  const estado = document.getElementById("weight-lock-status");
  const input = document.getElementById("profile-weight-input");
  const botao = document.getElementById("btn-save-weight");

  if (input) input.value = getPesoKg();

  if (grafico) {
    if (weightHistoryCache.length === 0) {
      grafico.innerHTML = '<p class="weight-empty">Ainda sem registos. Guarda o teu peso para começar o histórico.</p>';
    } else {
      const { min, max } = escalaPeso(weightHistoryCache);
      grafico.innerHTML =
        `<div class="profile-chart-yaxis">${buildWeightYAxis(min, max)}</div>` +
        `<div class="profile-chart-scroll">${buildWeightLineSvg(weightHistoryCache, min, max)}</div>`;
    }
  }

  if (!estado) return;
  const ultimo = ultimoRegistoPeso();

  estado.textContent = ultimo
    ? `Último registo: ${formatKg(ultimo.kg)} em ${ultimo.data.toLocaleDateString("pt-PT")}.`
    : "Podes registar o teu peso quando quiseres.";
  if (input) input.disabled = false;
  if (botao) botao.disabled = false;
}

async function refreshWeightSection() {
  await loadWeightHistory();
  renderWeightHistory();
}

// --- Boas-vindas (2026-09-12, a pedido) --------------------------------------
//
// Todo o jogador novo ve isto uma unica vez, logo a seguir a escolher o nome
// (js/auth.js, promptForDisplayName) - o gate e o mesmo (!profile.display_name
// no primeiro login), por isso corre sempre e so ai. Sem botao de saltar,
// mesmo padrao do nome: sem isto o peso ficava no valor por defeito
// (DEFAULT_WEIGHT_KG, 70 kg) e entrava logo errado na formula das calorias.
const welcomeModalEl = document.getElementById("welcome-modal");
const welcomeWeightInputEl = document.getElementById("welcome-weight-input");
const btnWelcomeConfirm = document.getElementById("btn-welcome-confirm");
const welcomeStatusEl = document.getElementById("welcome-status");

function promptForWelcomeWeight() {
  return new Promise((resolve) => {
    welcomeModalEl.classList.remove("hidden");

    function updateButtonState() {
      const kg = Number(welcomeWeightInputEl.value);
      btnWelcomeConfirm.disabled = !Number.isFinite(kg) || kg < WEIGHT_MIN_KG || kg > WEIGHT_MAX_KG;
    }

    async function onConfirm() {
      const kg = Number(welcomeWeightInputEl.value);
      btnWelcomeConfirm.disabled = true;
      welcomeStatusEl.textContent = "";

      const resultado = await registarPeso(kg);
      if (!resultado.ok) {
        btnWelcomeConfirm.disabled = false;
        welcomeStatusEl.textContent = resultado.motivo;
        return;
      }

      welcomeModalEl.classList.add("hidden");
      btnWelcomeConfirm.removeEventListener("click", onConfirm);
      welcomeWeightInputEl.removeEventListener("input", updateButtonState);
      resolve();
    }

    welcomeWeightInputEl.addEventListener("input", updateButtonState);
    btnWelcomeConfirm.addEventListener("click", onConfirm);
    updateButtonState();
  });
}

// --- Lembrete a cada 15 dias (2026-09-12, a pedido) --------------------------
//
// So verificado DEPOIS do fluxo de boas-vindas em js/auth.js - nunca dispara
// para quem acabou de registar o peso agora mesmo. Ao contrario do popup de
// boas-vindas, este e dispensavel ("Agora não"): ja ha um valor guardado, so
// pode estar desatualizado, e obrigar sempre seria demasiado chato. Se
// dispensado, volta a aparecer no proximo arranque da app enquanto o peso
// continuar sem ser atualizado.
const WEIGHT_REMINDER_DAYS = 15;
const MS_POR_DIA = 24 * 60 * 60 * 1000;
const weightReminderModalEl = document.getElementById("weight-reminder-modal");
const weightReminderInputEl = document.getElementById("weight-reminder-input");
const btnWeightReminderSave = document.getElementById("btn-weight-reminder-save");
const btnWeightReminderDismiss = document.getElementById("btn-weight-reminder-dismiss");
const weightReminderStatusEl = document.getElementById("weight-reminder-status");

function diasDesdeUltimoRegistoPeso() {
  const ultimo = ultimoRegistoPeso();
  return ultimo ? (Date.now() - ultimo.data.getTime()) / MS_POR_DIA : Infinity;
}

function closeWeightReminderModal() {
  weightReminderModalEl.classList.add("hidden");
}

async function checkWeightReminder() {
  await loadWeightHistory();
  if (diasDesdeUltimoRegistoPeso() < WEIGHT_REMINDER_DAYS) return;

  weightReminderInputEl.value = getPesoKg();
  weightReminderStatusEl.textContent = "";
  weightReminderModalEl.classList.remove("hidden");
}

btnWeightReminderDismiss.addEventListener("click", closeWeightReminderModal);

btnWeightReminderSave.addEventListener("click", async () => {
  const kg = Number(weightReminderInputEl.value);
  btnWeightReminderSave.disabled = true;
  const resultado = await registarPeso(kg);
  btnWeightReminderSave.disabled = false;
  if (!resultado.ok) {
    weightReminderStatusEl.textContent = resultado.motivo;
    return;
  }
  closeWeightReminderModal();
});
