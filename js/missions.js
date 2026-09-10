// Missoes mensais (secção 22, 2026-09-10, a pedido).
//
// Cada mes de calendario tem TRES missoes - uma facil, uma media, uma
// dificil - e cada uma da RECURSOS ao ser concluida. As tres missoes de um
// mes sao DETERMINISTAS: saem de um gerador semeado no proprio mes
// ("2026-09"), tal como as minas saem do osm_id do concelho (secção 21). Nao
// se guarda a missao, so o ESTADO: qual esta aceite, quais ja foram
// concluidas e quando foi a ultima recusa.
//
// Regras (todas a pedido):
//   - So 1 missao aceite de cada vez.
//   - Recusar uma missao trava novas aceitacoes durante 24 h.
//   - Concluir NAO trava nada - aceita-se logo a seguinte.
//   - Concluidas as 3 dentro do mes, espera-se pelo mes seguinte.
//   - O progresso conta a partir do INSTANTE em que se aceita (baseline), nao
//     desde o inicio do mes - recusar/falhar nunca "credita" trabalho antigo.
//
// Depende de: js/resources.js (hashString, mulberry32, RESOURCE_IDS,
// RESOURCE_BY_ID, acumularProducao, warehouseCap, getWarehouseLevel,
// saveResources, getResources), js/experience.js (getLifetimeDistanceM),
// js/hexes.js (getDiscoveredHexCount, unlockedConcelhos), js/profile.js
// (formatMonthKey, MONTH_NAMES_PT), js/equipment.js (showGameToast),
// js/icons.js (icon), js/progress-sync.js (queueProgressSync). Carrega
// depois de todos eles.

const MISSION_SLOTS = ["facil", "media", "dificil"];
const MISSION_SLOT_LABEL = { facil: "Fácil", media: "Média", dificil: "Difícil" };
const MISSION_REJECT_COOLDOWN_MS = 24 * 60 * 60 * 1000;

// Pools por dificuldade. Cada slot escolhe UM tipo, semeado no mes - a
// media pode calhar "corre" num mes e "mina" no outro. Mantem-se sempre
// uma facil de esforco puro (km/hexes), a dificil e que traz os objetivos
// de mapa mais raros (concelho novo).
const MISSION_POOL = {
  facil: ["correr_km", "descobre_hex"],
  media: ["correr_km", "descobre_hex", "descobre_mina"],
  dificil: ["correr_km", "descobre_hex", "descobre_concelho"],
};

// Alvos por tipo e dificuldade. NUMEROS PROVISORIOS, mesma nota da secção 21:
// derivados do ritmo dos dois jogadores no primeiro mes (~30-40 hexes/semana,
// e a fase em que tudo a volta de casa e novo). A rever quando houver mais
// historico real.
const MISSION_ALVO = {
  correr_km: { facil: 15, media: 35, dificil: 70 }, // km
  descobre_hex: { facil: 8, media: 20, dificil: 45 }, // hexagonos novos
  descobre_mina: { facil: 1, media: 1, dificil: 1 },
  descobre_concelho: { facil: 1, media: 1, dificil: 1 },
};

// Recompensa em UNIDADES de um recurso, por dificuldade. O recurso concreto
// e semeado no mes. A quantidade e limitada pelo teto da Fortaleza ao ser
// creditada (como a producao), por isso a dificil so rende tudo com a
// Fortaleza ja subida - de proposito.
const MISSION_RECOMPENSA = { facil: 50, media: 120, dificil: 300 };

function missionMonthKey() {
  return typeof formatMonthKey === "function" ? formatMonthKey(new Date()) : new Date().toISOString().slice(0, 7);
}

function missionMonthLabel(monthKey) {
  const [y, m] = String(monthKey).split("-").map(Number);
  if (!m || typeof MONTH_NAMES_PT === "undefined") return monthKey;
  return `${MONTH_NAMES_PT[m - 1]} de ${y}`;
}

function nextMonthLabel(monthKey) {
  const [y, m] = String(monthKey).split("-").map(Number);
  if (!m || typeof MONTH_NAMES_PT === "undefined") return "o próximo mês";
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return `${MONTH_NAMES_PT[nm - 1]} de ${ny}`;
}

// As 3 missoes de um mes, deterministas. Devolve { facil, media, dificil },
// cada uma { slot, tipo, alvo, recurso?, recompensa: { recurso, quantidade } }.
function generateMonthlyMissions(monthKey) {
  const rand = mulberry32(hashString("missoes:" + monthKey));
  const ids = typeof RESOURCE_IDS !== "undefined" ? RESOURCE_IDS : ["ferro", "madeira", "pele", "pedra", "barro"];
  const missoes = {};
  const tiposUsados = new Set();

  MISSION_SLOTS.forEach((slot) => {
    const pool = MISSION_POOL[slot];
    let tipo = pool[Math.floor(rand() * pool.length)];
    // Tenta dar 3 objetivos DIFERENTES no mesmo mes - se este tipo ja saiu
    // noutro slot e o pool tem alternativa por usar, salta para ela.
    if (tiposUsados.has(tipo)) {
      const alt = pool.find((t) => !tiposUsados.has(t));
      if (alt) tipo = alt;
    }
    tiposUsados.add(tipo);
    const alvoBruto = MISSION_ALVO[tipo][slot];
    const alvo = tipo === "correr_km" ? alvoBruto * 1000 : alvoBruto; // km -> metros
    const recompensaRecurso = ids[Math.floor(rand() * ids.length)];
    const missao = {
      slot,
      tipo,
      alvo,
      recompensa: { recurso: recompensaRecurso, quantidade: MISSION_RECOMPENSA[slot] },
    };
    if (tipo === "descobre_mina") missao.recurso = ids[Math.floor(rand() * ids.length)];
    missoes[slot] = missao;
  });

  return missoes;
}

// --- estado -------------------------------------------------------------------

function estadoMissoesVazio(monthKey) {
  return { mes: monthKey, ativa: null, concluidas: [], rejeitadaEm: null };
}

// Leitura PURA, sem efeitos - usada pelo snapshot de sincronizacao, que nao
// pode escrever no localStorage a meio.
function getMissionStateRaw() {
  try {
    const bruto = JSON.parse(localStorage.getItem(STORAGE_KEY_MISSIONS) || "null");
    if (bruto && typeof bruto === "object" && bruto.mes) return bruto;
  } catch (e) {
    /* cai para vazio */
  }
  return estadoMissoesVazio(missionMonthKey());
}

// Leitura COM rollover: se o mes mudou, comeca de novo (missoes novas,
// nada aceite, sem concluidas) e grava ja o estado limpo.
function getMissionState() {
  const estado = getMissionStateRaw();
  const mesAtual = missionMonthKey();
  if (estado.mes !== mesAtual) {
    const novo = estadoMissoesVazio(mesAtual);
    saveMissionState(novo);
    return novo;
  }
  return estado;
}

function saveMissionState(estado) {
  localStorage.setItem(STORAGE_KEY_MISSIONS, JSON.stringify(estado));
  if (typeof queueProgressSync === "function") queueProgressSync();
}

// --- baseline e progresso ---------------------------------------------------

function missionBaseline(tipo, recurso) {
  switch (tipo) {
    case "correr_km":
      // Sem baseline: correr_km e um ACUMULADOR (ativa.progressoM), somado no
      // fim de cada treino APENAS com a fatia de distancia detetada como
      // "correr" dessa sessao. Um baseline sobre getLifetimeDistanceM()
      // contava tambem a caminhada (bug reportado 2026-09-10).
      return {};
    case "descobre_hex":
      return { hex: typeof getDiscoveredHexCount === "function" ? getDiscoveredHexCount() : 0 };
    case "descobre_mina":
      return { minas: typeof getMinasEncontradas === "function" ? [...getMinasEncontradas()] : [] };
    case "descobre_concelho":
      return { concelhos: typeof unlockedConcelhos !== "undefined" ? unlockedConcelhos.map((c) => c.osmId) : [] };
    default:
      return {};
  }
}

// { current, target, done } para a barra e para a verificacao de conclusao.
function missionProgress(ativa) {
  if (!ativa) return { current: 0, target: 1, done: false };
  const base = ativa.baseline || {};
  switch (ativa.tipo) {
    case "correr_km": {
      // Acumulador: so a distancia CORRIDA somada no fim de cada treino
      // (verificarMissaoAtiva). Missoes aceites antes de 2026-09-10 nao tem
      // progressoM - contam a partir de 0 (a caminhada que tinham contado
      // deixa de valer, que e o correto).
      const feito = Math.max(0, Number(ativa.progressoM) || 0);
      return { current: Math.min(feito, ativa.alvo), target: ativa.alvo, done: feito >= ativa.alvo };
    }
    case "descobre_hex": {
      const agora = typeof getDiscoveredHexCount === "function" ? getDiscoveredHexCount() : 0;
      const feito = Math.max(0, agora - (Number(base.hex) || 0));
      return { current: Math.min(feito, ativa.alvo), target: ativa.alvo, done: feito >= ativa.alvo };
    }
    case "descobre_mina": {
      const anteriores = new Set(base.minas || []);
      let feito = 0;
      if (typeof getMinasEncontradas === "function" && typeof todasAsMinas === "function") {
        const recursoPorMina = {};
        todasAsMinas().forEach((m) => { recursoPorMina[m.id] = m.recurso; });
        getMinasEncontradas().forEach((id) => {
          if (!anteriores.has(id) && recursoPorMina[id] === ativa.recurso) feito = 1;
        });
      }
      return { current: feito, target: 1, done: feito >= 1 };
    }
    case "descobre_concelho": {
      const anteriores = new Set(base.concelhos || []);
      let feito = 0;
      if (typeof unlockedConcelhos !== "undefined") {
        feito = unlockedConcelhos.some((c) => !anteriores.has(c.osmId)) ? 1 : 0;
      }
      return { current: feito, target: 1, done: feito >= 1 };
    }
    default:
      return { current: 0, target: 1, done: false };
  }
}

// --- regras -----------------------------------------------------------------

function missionCooldownRestanteMs(estado) {
  if (!estado.rejeitadaEm) return 0;
  return Math.max(0, MISSION_REJECT_COOLDOWN_MS - (Date.now() - Number(estado.rejeitadaEm)));
}

function podeAceitarMissao(estado) {
  return !estado.ativa && estado.concluidas.length < MISSION_SLOTS.length && missionCooldownRestanteMs(estado) === 0;
}

// Slots ainda por concluir este mes, com os detalhes gerados.
function missoesDisponiveis(estado) {
  const geradas = generateMonthlyMissions(estado.mes);
  return MISSION_SLOTS.filter((slot) => !estado.concluidas.includes(slot)).map((slot) => geradas[slot]);
}

function aceitarMissao(slot) {
  const estado = getMissionState();
  if (!podeAceitarMissao(estado) || estado.concluidas.includes(slot)) return false;
  const missao = generateMonthlyMissions(estado.mes)[slot];
  if (!missao) return false;
  estado.ativa = {
    slot: missao.slot,
    tipo: missao.tipo,
    alvo: missao.alvo,
    recurso: missao.recurso || null,
    recompensa: missao.recompensa,
    baseline: missionBaseline(missao.tipo, missao.recurso),
    // Acumulador de distancia corrida, so usado por correr_km (ver missionProgress).
    progressoM: 0,
    aceiteEm: Date.now(),
  };
  saveMissionState(estado);
  renderMissionsPanel();
  return true;
}

function desistirMissao() {
  const estado = getMissionState();
  if (!estado.ativa) return false;
  estado.ativa = null;
  estado.rejeitadaEm = Date.now();
  saveMissionState(estado);
  renderMissionsPanel();
  return true;
}

// Credita a recompensa: fixa a producao ate agora (checkpoint), soma o
// premio e volta a gravar. Limitado ao teto da Fortaleza, como a producao.
function concederRecompensaMissao(recompensa) {
  if (!recompensa || typeof acumularProducao !== "function") return;
  const stock = acumularProducao();
  const tecto = typeof warehouseCap === "function" ? warehouseCap(getWarehouseLevel()) : Infinity;
  stock[recompensa.recurso] = Math.min(tecto, (Number(stock[recompensa.recurso]) || 0) + recompensa.quantidade);
  if (typeof saveResources === "function") saveResources(stock);
  if (typeof renderResourcesPanel === "function") renderResourcesPanel();
  if (typeof renderWallet === "function") renderWallet();
  if (typeof renderEquipmentCards === "function") renderEquipmentCards();
}

// Chamada no fim de um treino (com `sessao`), no arranque pos-login e quando
// as regioes sao recalculadas (sem `sessao`) - sempre que o progresso de uma
// missao pode ter mudado.
//
// sessao (opcional): { distanciaPorModo: { correr, caminhar } } da sessao que
// acabou. So a missao correr_km a usa - soma a fatia CORRIDA ao acumulador.
function verificarMissaoAtiva(sessao) {
  const estado = getMissionState();
  if (!estado.ativa) {
    renderMissionsPanel();
    return;
  }

  if (sessao && estado.ativa.tipo === "correr_km") {
    const correu = Number(sessao.distanciaPorModo && sessao.distanciaPorModo.correr) || 0;
    if (correu > 0) {
      estado.ativa.progressoM = (Number(estado.ativa.progressoM) || 0) + correu;
      saveMissionState(estado);
    }
  }

  const prog = missionProgress(estado.ativa);
  if (!prog.done) {
    renderMissionsPanel();
    return;
  }

  const concluida = estado.ativa;
  estado.concluidas.push(concluida.slot);
  estado.ativa = null;
  saveMissionState(estado);

  concederRecompensaMissao(concluida.recompensa);
  if (typeof showGameToast === "function") {
    const r = concluida.recompensa;
    const nome = typeof RESOURCE_BY_ID !== "undefined" && RESOURCE_BY_ID[r.recurso] ? RESOURCE_BY_ID[r.recurso].nome.toLowerCase() : r.recurso;
    showGameToast(`Missão concluída! +${r.quantidade} de ${nome}`, "medalha");
  }
  renderMissionsPanel();
}

// --- texto ----------------------------------------------------------------

function missaoTexto(missao) {
  switch (missao.tipo) {
    case "correr_km":
      return `Corre ${Math.round(missao.alvo / 1000)} km`;
    case "descobre_hex":
      return `Descobre ${missao.alvo} hexágonos novos`;
    case "descobre_mina": {
      const nome = typeof RESOURCE_BY_ID !== "undefined" && RESOURCE_BY_ID[missao.recurso] ? RESOURCE_BY_ID[missao.recurso].nome.toLowerCase() : missao.recurso;
      return `Encontra uma mina de ${nome}`;
    }
    case "descobre_concelho":
      return "Desbloqueia um concelho novo";
    default:
      return "Missão";
  }
}

function missaoRecompensaHtml(recompensa) {
  const ic = typeof icon === "function" ? icon(recompensa.recurso, 15) : "";
  return `<span class="mission-reward">${ic}+${recompensa.quantidade}</span>`;
}

function missaoProgressoTexto(missao, prog) {
  if (missao.tipo === "correr_km") {
    return `${(prog.current / 1000).toFixed(1)} / ${Math.round(prog.target / 1000)} km`;
  }
  if (missao.tipo === "descobre_hex") {
    return `${Math.floor(prog.current)} / ${prog.target} hexágonos`;
  }
  return prog.done ? "Concluída" : "Por concluir";
}

function formatCooldownRestante(ms) {
  const horas = Math.floor(ms / 3600000);
  const minutos = Math.ceil((ms % 3600000) / 60000);
  if (horas >= 1) return `${horas}h${minutos > 0 ? " " + minutos + "min" : ""}`;
  return `${minutos} min`;
}

// --- UI -------------------------------------------------------------------

function renderMissionsPanel() {
  const painel = document.getElementById("missions-panel");
  if (!painel) return;

  const estado = getMissionState();
  const mesLabel = missionMonthLabel(estado.mes);

  let corpo = "";

  if (estado.ativa) {
    const prog = missionProgress(estado.ativa);
    const pct = Math.max(0, Math.min(100, (prog.current / prog.target) * 100));
    corpo =
      '<div class="mission-card mission-active">' +
      `<p class="mission-line"><span class="mission-chip mission-chip-${estado.ativa.slot}">${MISSION_SLOT_LABEL[estado.ativa.slot]}</span>` +
      `${missaoRecompensaHtml(estado.ativa.recompensa)}</p>` +
      `<p class="mission-goal">${missaoTexto(estado.ativa)}</p>` +
      `<div class="mission-progress-track"><div class="mission-progress-fill" style="width:${pct}%"></div></div>` +
      `<p class="mission-progress-text">${missaoProgressoTexto(estado.ativa, prog)}</p>` +
      '<button id="btn-mission-desistir" class="mission-btn-ghost" type="button">Desistir</button>' +
      "</div>";
  } else if (estado.concluidas.length >= MISSION_SLOTS.length) {
    corpo = `<p class="mission-empty">As três missões de ${mesLabel} estão concluídas. Novas missões em ${nextMonthLabel(estado.mes)}.</p>`;
  } else {
    const restante = missionCooldownRestanteMs(estado);
    if (restante > 0) {
      corpo = `<p class="mission-empty">Recusaste uma missão. Podes aceitar outra daqui a ${formatCooldownRestante(restante)}.</p>`;
    } else {
      corpo =
        '<p class="mission-help">Aceita uma de cada vez. O progresso conta a partir do momento em que aceitas.</p>' +
        missoesDisponiveis(estado)
          .map(
            (m) =>
              '<div class="mission-card">' +
              `<p class="mission-line"><span class="mission-chip mission-chip-${m.slot}">${MISSION_SLOT_LABEL[m.slot]}</span>${missaoRecompensaHtml(m.recompensa)}</p>` +
              `<p class="mission-goal">${missaoTexto(m)}</p>` +
              `<button class="mission-btn-accept btn-primary" type="button" data-mission-slot="${m.slot}">Aceitar</button>` +
              "</div>"
          )
          .join("");
    }
  }

  painel.innerHTML =
    `<div class="mission-head"><span class="mission-title">Missões · ${mesLabel}</span>` +
    `<span class="mission-count">${estado.concluidas.length}/${MISSION_SLOTS.length}</span></div>` +
    corpo;

  const btnDesistir = document.getElementById("btn-mission-desistir");
  if (btnDesistir) {
    btnDesistir.addEventListener("click", () => {
      if (confirm("Desistir desta missão? Ficas 24 horas sem poder aceitar outra.")) desistirMissao();
    });
  }
  painel.querySelectorAll("[data-mission-slot]").forEach((btn) => {
    btn.addEventListener("click", () => aceitarMissao(btn.dataset.missionSlot));
  });
}

renderMissionsPanel();
