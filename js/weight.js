// Historico de peso (2026-09-07, a pedido: "histórico de peso com data de
// introdução" + "gráfico que mostra a evolução do peso"). A cadencia minima
// entre alteracoes passou de 15 dias para 24 horas (2026-09-08, a pedido:
// "possibilidade de atualizar o peso a cada 24h").
//
// O peso ATUAL continua onde estava (STORAGE_KEY_WEIGHT_KG, lido por
// getPesoKg() na formula das calorias) - isto e aditivo e nao mexe em nada do
// calculo. O que e novo e a tabela weight_history no Supabase, que guarda
// cada valor com a data em que foi introduzido.
//
// A REGRA DAS 24 HORAS E VALIDADA CONTRA O SERVIDOR, nao contra o
// localStorage: senao bastava limpar os dados do browser (ou abrir noutro
// telemovel) para a contornar. O localStorage aqui e so cache de leitura.
const WEIGHT_MIN_HOURS_BETWEEN = 24;
const WEIGHT_MIN_KG = 20;
const WEIGHT_MAX_KG = 300;
const MS_POR_HORA = 60 * 60 * 1000;

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

// Devolve quantas horas faltam para se poder voltar a alterar. 0 = ja pode.
function horasAteProximaAlteracao() {
  const ultimo = ultimoRegistoPeso();
  if (!ultimo) return 0;
  const passadas = (Date.now() - ultimo.data.getTime()) / MS_POR_HORA;
  return Math.max(0, Math.ceil(WEIGHT_MIN_HOURS_BETWEEN - passadas));
}

// Horas -> texto legivel ("3 horas", "1 hora", "2 dias"): acima de 24 h passa a
// dias, o que ja nao acontece com o limite atual mas fica correto se mudar.
function duracaoEmFalta(horas) {
  if (horas >= 24) {
    const dias = Math.ceil(horas / 24);
    return `${dias} ${dias === 1 ? "dia" : "dias"}`;
  }
  return `${horas} ${horas === 1 ? "hora" : "horas"}`;
}

// Devolve { ok, motivo }. Nunca lanca - quem chama e um handler de clique.
async function registarPeso(kg) {
  if (!Number.isFinite(kg) || kg < WEIGHT_MIN_KG || kg > WEIGHT_MAX_KG) {
    return { ok: false, motivo: `Peso inválido (entre ${WEIGHT_MIN_KG} e ${WEIGHT_MAX_KG} kg).` };
  }
  if (!currentUserId) {
    return { ok: false, motivo: "Precisas de estar ligado para guardar o peso." };
  }

  // Reler do servidor antes de decidir: a cache local pode estar velha (outro
  // telemovel) ou ter sido limpa.
  await loadWeightHistory();
  const faltam = horasAteProximaAlteracao();
  if (faltam > 0) {
    return {
      ok: false,
      motivo: `Só podes alterar o peso a cada ${WEIGHT_MIN_HOURS_BETWEEN} h. Faltam ${duracaoEmFalta(faltam)}.`,
    };
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
  const faltam = horasAteProximaAlteracao();
  const ultimo = ultimoRegistoPeso();

  if (faltam > 0) {
    estado.textContent = `Último registo: ${formatKg(ultimo.kg)} em ${ultimo.data.toLocaleDateString("pt-PT")}. Podes voltar a alterar daqui a ${duracaoEmFalta(faltam)}.`;
    if (input) input.disabled = true;
    if (botao) botao.disabled = true;
  } else {
    estado.textContent = ultimo
      ? `Último registo: ${formatKg(ultimo.kg)} em ${ultimo.data.toLocaleDateString("pt-PT")}. Já podes atualizar.`
      : `Podes registar o teu peso. Depois disso, só a cada ${WEIGHT_MIN_HOURS_BETWEEN} h.`;
    if (input) input.disabled = false;
    if (botao) botao.disabled = false;
  }
}

async function refreshWeightSection() {
  await loadWeightHistory();
  renderWeightHistory();
}
