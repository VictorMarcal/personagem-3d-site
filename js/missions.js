// Missoes mensais (secção 22, 2026-09-10, a pedido).
//
// 9 missoes por mes, SEM dificuldade (2026-09-21, a pedido - "vamos remover a
// interpretacao de dificuldade de missoes"): uma lista unica, sem etiquetas
// Facil/Media/Dificil nem cores por dificuldade. Cada missao mantem o seu
// alvo e a sua recompensa (as 9 de sempre); por dentro continuam agrupadas em
// tres "grupos" (MISSION_SLOTS: facil/media/dificil) so porque e daqui que
// saem os alvos, as recompensas e os ids ("grupo:tipo", ex. "facil:correr_km")
// ja gravados nas concluidas e nas conquistas - o jogador nunca os ve. Os tipos
// de cada mes sao DETERMINISTAS (gerador semeado no mes, como as minas em
// secção 21): so se guarda o ESTADO.
//
// Estado: { mes, ativas: { "<id>": missao aceite, ... }, concluidas: ["<id>", ...],
// rejeitadaEm: timestamp da ultima desistencia | null }.
//
// Regras (todas a pedido):
//   - Ate MISSION_MAX_ATIVAS (3) missoes ATIVAS ao mesmo tempo, quaisquer das 9.
//   - Desistir de uma missao PERDE o progresso dela e trava a ativacao de
//     QUALQUER missao durante MISSION_REJECT_COOLDOWN_MS (12h) - um so tempo
//     para todas (antes era por dificuldade).
//   - Concluir NAO trava nada.
//   - Cada missao so pode ser concluida uma vez por mes.
//   - O progresso conta a partir do INSTANTE em que se aceita (baseline).
//   - As medalhas contam quantas missoes se concluiram (js/achievements.js).
//
// Depende de: js/resources.js (hashString, mulberry32, RESOURCE_IDS,
// RESOURCE_BY_ID, acumularProducao, warehouseCap, getWarehouseLevel,
// saveResources, getResources), js/experience.js (getLifetimeDistanceM),
// js/hexes.js (getDiscoveredHexCount, unlockedConcelhos), js/profile.js
// (formatMonthKey, MONTH_NAMES_PT), js/equipment.js (showGameToast),
// js/icons.js (icon), js/progress-sync.js (queueProgressSync),
// js/achievements.js (registarMissaoConcluidaVitalicio, 2026-09-16).
// Carrega depois de todos eles.

// Grupos INTERNOS (nao mostrados): de onde vem alvo/recompensa e o prefixo do id.
const MISSION_SLOTS = ["facil", "media", "dificil"];
const MISSION_MAX_ATIVAS = 3;
// 12h desde 2026-09-15 (era 24h) - a pedido, junto com a mudanca para "todas
// as missoes sempre visiveis" (ver cabecalho do ficheiro).
const MISSION_REJECT_COOLDOWN_MS = 12 * 60 * 60 * 1000;

// Pools por GRUPO interno (a antiga dificuldade, hoje invisivel) - exatamente 3 tipos cada, sempre TODOS visiveis ao
// mesmo tempo (ver generateMonthlyMissions/renderMissionSlotBlock), nunca
// sorteados nem escondidos atras de um toggle. "correr_km"/"caminhar_km" sao
// dois tipos irmaos (mesma logica, cada um so conta a sua fatia de distancia
// - ver missionProgress), a pedido via Trello 2026-09-15 para quem caminha
// mais do que corre tambem ter missao de distancia. O terceiro tipo de cada
// dificuldade e o que a torna distinta: facil = hexagonos novos (esforco
// puro de explorar), media = achar uma mina especifica, dificil = desbloquear
// um concelho novo (o objetivo de mapa mais raro).
const MISSION_POOL = {
  facil: ["correr_km", "caminhar_km", "descobre_hex"],
  media: ["correr_km", "caminhar_km", "descobre_mina"],
  dificil: ["correr_km", "caminhar_km", "descobre_concelho"],
};

// 3 dificuldades x 3 tipos cada = 9 missões concluíveis por mês (2026-09-16,
// a pedido - "quero mesmo 9 por mês", antes eram só 3).
const MISSION_TOTAL_TIPOS = MISSION_SLOTS.reduce((soma, slot) => soma + MISSION_POOL[slot].length, 0);

// Alvos por tipo e grupo. NUMEROS PROVISORIOS, mesma nota da secção 21:
// derivados do ritmo dos dois jogadores no primeiro mes (~30-40 hexes/semana,
// e a fase em que tudo a volta de casa e novo). A rever quando houver mais
// historico real. caminhar_km comeca com os mesmos alvos de correr_km -
// tambem provisorio, ainda sem historico de ritmo de caminhada dos jogadores.
const MISSION_ALVO = {
  correr_km: { facil: 15, media: 35, dificil: 70 }, // km
  caminhar_km: { facil: 15, media: 35, dificil: 70 }, // km
  descobre_hex: { facil: 8, media: 20, dificil: 45 }, // hexagonos novos
  descobre_mina: { facil: 1, media: 1, dificil: 1 },
  descobre_concelho: { facil: 1, media: 1, dificil: 1 },
};

// Recompensa em UNIDADES de um recurso, por grupo. O recurso concreto
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

// As missoes de um mes, deterministas. Devolve { facil, media, dificil }, cada
// uma um ARRAY com uma missao POR TIPO do pool dessa dificuldade (nao so um
// sorteado) - { slot, tipo, alvo, recurso?, recompensa: { recurso, quantidade } }.
// Ate 2026-09-15 sorteava-se so 1 tipo por dificuldade (com logica extra para
// tentar nao repetir tipo entre dificuldades); mudou a pedido via Trello
// depois do jogador nao ver a missao de caminhada aparecer nesse mes -
// "provavelmente porque temos um limite de 3 missoes... vamos passar a ter
// mais, [uma por tipo]" - mostrar sempre TODOS os tipos evita depender da
// sorte para um tipo aparecer. A recompensa (recurso+quantidade) e sorteada
// uma vez por dificuldade, partilhada por todos os tipos dessa dificuldade
// esse mes (a quantidade so depende da dificuldade, nao do tipo escolhido).
function generateMonthlyMissions(monthKey) {
  const rand = mulberry32(hashString("missoes:" + monthKey));
  const ids = typeof RESOURCE_IDS !== "undefined" ? RESOURCE_IDS : ["ferro", "madeira", "pele", "pedra", "barro"];
  const missoes = {};

  MISSION_SLOTS.forEach((slot) => {
    const pool = MISSION_POOL[slot];
    const recompensaRecurso = ids[Math.floor(rand() * ids.length)];
    missoes[slot] = pool.map((tipo) => {
      const alvoBruto = MISSION_ALVO[tipo][slot];
      const alvo = tipo === "correr_km" || tipo === "caminhar_km" ? alvoBruto * 1000 : alvoBruto; // km -> metros
      const missao = {
        slot,
        tipo,
        alvo,
        recompensa: { recurso: recompensaRecurso, quantidade: MISSION_RECOMPENSA[slot] },
      };
      if (tipo === "descobre_mina") missao.recurso = ids[Math.floor(rand() * ids.length)];
      return missao;
    });
  });

  return missoes;
}

// --- estado -------------------------------------------------------------------

function estadoMissoesVazio(monthKey) {
  return { mes: monthKey, ativas: {}, concluidas: [], rejeitadaEm: null };
}

// Id de uma missao ("grupo:tipo") - o mesmo formato que sempre esteve em
// `concluidas`, por isso nada do que ja esta gravado muda de sentido.
function idDaMissao(slot, tipo) {
  return slot + ":" + tipo;
}

// As 9 missoes do mes numa lista unica, da que rende menos para a que rende
// mais (a ordem e so de apresentacao; dentro da mesma recompensa fica a do
// pool). Cada uma leva o seu `id`.
function todasAsMissoesDoMes(monthKey) {
  const porGrupo = generateMonthlyMissions(monthKey);
  const lista = [];
  MISSION_SLOTS.forEach((slot) => {
    (porGrupo[slot] || []).forEach((m) => lista.push({ ...m, id: idDaMissao(m.slot, m.tipo) }));
  });
  return lista.sort((a, b) => a.recompensa.quantidade - b.recompensa.quantidade);
}

// Migra o formato antigo (uma so `ativa`/`rejeitadaEm` GLOBAL, quando so
// podia haver 1 missao aceite no total) para o novo, por dificuldade
// (2026-09-15 - "deve ser possivel ativar 3 missoes, uma facil uma media uma
// dificil"). Idempotente: um estado ja no formato novo (tem `ativas`) passa
// incolume. Nao escreve no localStorage - quem chama decide se/quando grava
// (getMissionStateRaw e usada pelo snapshot de sincronizacao, que nao pode
// escrever a meio). O cooldown de 24h antigo era global, sem registo de qual
// dificuldade tinha sido recusada - perde-se na migracao (efeito minimo e
// unico) em vez de aplicar as 3 de uma vez, o que seria pior.
function migrarEstadoMissoes(estado) {
  if (!estado || typeof estado !== "object") return estado;

  // Formatos ANTIGOS -> novo. (1) uma so `ativa` global (ate 2026-09-15); (2)
  // `ativas` por dificuldade { facil, media, dificil } e `rejeitadaEm` por
  // dificuldade (ate 2026-09-20). Idempotente: um estado ja no formato novo
  // (`ativas` indexado por id, `rejeitadaEm` numero) passa quase incolume.
  // Nao escreve no localStorage - quem chama decide (getMissionStateRaw e usada
  // pelo snapshot de sincronizacao, que nao pode escrever a meio).
  let ativasPorGrupo = null;
  if (!estado.ativas && estado.ativa) {
    ativasPorGrupo = {};
    if (MISSION_SLOTS.includes(estado.ativa.slot)) ativasPorGrupo[estado.ativa.slot] = estado.ativa;
  } else if (estado.ativas && Object.keys(estado.ativas).some((k) => MISSION_SLOTS.includes(k))) {
    ativasPorGrupo = estado.ativas;
  }

  if (ativasPorGrupo) {
    const ativas = {};
    MISSION_SLOTS.forEach((slot) => {
      const a = ativasPorGrupo[slot];
      if (!a || !a.tipo) return;
      const grupo = a.slot || slot;
      const id = idDaMissao(grupo, a.tipo);
      ativas[id] = { ...a, slot: grupo, id };
    });
    // O cooldown antigo era por dificuldade: fica o mais recente dos tres.
    const rej =
      estado.rejeitadaEm && typeof estado.rejeitadaEm === "object"
        ? Math.max(0, ...MISSION_SLOTS.map((slot) => Number(estado.rejeitadaEm[slot]) || 0))
        : 0;
    return { mes: estado.mes, ativas, concluidas: estado.concluidas || [], rejeitadaEm: rej || null };
  }

  return {
    ...estado,
    ativas: estado.ativas || {},
    concluidas: estado.concluidas || [],
    rejeitadaEm: Number(estado.rejeitadaEm) || null,
  };
}

// Leitura PURA, sem efeitos - usada pelo snapshot de sincronizacao, que nao
// pode escrever no localStorage a meio.
function getMissionStateRaw() {
  try {
    const bruto = JSON.parse(localStorage.getItem(STORAGE_KEY_MISSIONS) || "null");
    if (bruto && typeof bruto === "object" && bruto.mes) return migrarEstadoMissoes(bruto);
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
    case "caminhar_km":
      // Sem baseline: correr_km/caminhar_km sao um ACUMULADOR (ativa.progressoM),
      // somado no fim de cada treino APENAS com a fatia de distancia detetada
      // como "correr"/"caminhar" dessa sessao. Um baseline sobre
      // getLifetimeDistanceM() contava os dois modos ao mesmo tempo (bug
      // reportado 2026-09-10).
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

// sessaoAoVivo (opcional): { distanciaPorModo: { correr, caminhar } } da
// sessao de treino EM CURSO (ver reparticaoDaSessao() em js/training.js,
// chamada a cada segundo por updateLiveStatsDisplay enquanto o treino
// decorre) - so serve para MOSTRAR o progresso a subir ao vivo durante o
// treino; o credito real (progressoM) continua a só acontecer no fim
// (verificarMissaoAtiva). Bug corrigido 2026-09-15 (Trello: "estou neste
// momento a correr e a missão não está a incrementar os quilómetros") - sem
// isto, o numero so mudava depois de "Terminar", nunca durante o treino.
//
// { current, target, done } para a barra e para a verificacao de conclusao.
function missionProgress(ativa, sessaoAoVivo) {
  if (!ativa) return { current: 0, target: 1, done: false };
  const base = ativa.baseline || {};
  switch (ativa.tipo) {
    case "correr_km":
    case "caminhar_km": {
      // Acumulador: so a distancia CORRIDA/CAMINHADA somada no fim de cada
      // treino (verificarMissaoAtiva), mais a fatia da sessao em curso (se
      // houver) so para efeitos de mostrador ao vivo. Missoes aceites antes
      // de 2026-09-10 nao tem progressoM - contam a partir de 0 (a
      // caminhada que tinham contado deixa de valer, que e o correto).
      const modo = ativa.tipo === "correr_km" ? "correr" : "caminhar";
      const aoVivo = sessaoAoVivo && sessaoAoVivo.distanciaPorModo ? Number(sessaoAoVivo.distanciaPorModo[modo]) || 0 : 0;
      const feito = Math.max(0, (Number(ativa.progressoM) || 0) + aoVivo);
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

// Cooldown de desistencia, UM SO para todas as missoes (2026-09-21, a pedido;
// de 2026-09-15 a 2026-09-20 era por dificuldade): quem desiste de qualquer
// missao espera MISSION_REJECT_COOLDOWN_MS antes de poder ativar outra.
function missionCooldownRestanteMs(estado) {
  const ts = Number(estado.rejeitadaEm) || 0;
  if (!ts) return 0;
  return Math.max(0, MISSION_REJECT_COOLDOWN_MS - (Date.now() - ts));
}

// Uma missao ja foi concluida este mes se o seu id ("grupo:tipo") estiver em
// concluidas - OU se so o "grupo" (formato antigo, anterior a 2026-09-16,
// quando concluir 1 tipo fechava o grupo todo) la estiver, para nao
// "desconcluir" retroativamente quem ja tinha um grupo fechado esse mes.
function missaoJaConcluida(estado, missao) {
  return estado.concluidas.includes(missao.id) || estado.concluidas.includes(missao.slot);
}

// Uma missao aceita-se se: ainda nao esta ativa nem foi concluida este mes,
// ha menos de MISSION_MAX_ATIVAS ativas (3) e nao se desistiu de nenhuma
// missao ha menos de MISSION_REJECT_COOLDOWN_MS (12h).
function podeAceitarMissao(estado, missao) {
  return (
    !estado.ativas[missao.id] &&
    !missaoJaConcluida(estado, missao) &&
    Object.keys(estado.ativas).length < MISSION_MAX_ATIVAS &&
    missionCooldownRestanteMs(estado) === 0
  );
}

// Uma missao do mes pelo seu id ("grupo:tipo"), com os detalhes gerados.
function missaoPorId(estado, id) {
  return todasAsMissoesDoMes(estado.mes).find((m) => m.id === id) || null;
}

function aceitarMissao(id) {
  const estado = getMissionState();
  const missao = missaoPorId(estado, id);
  if (!missao || !podeAceitarMissao(estado, missao)) return false;
  estado.ativas[id] = {
    id,
    slot: missao.slot,
    tipo: missao.tipo,
    alvo: missao.alvo,
    recurso: missao.recurso || null,
    recompensa: missao.recompensa,
    baseline: missionBaseline(missao.tipo, missao.recurso),
    // Acumulador de distancia, so usado por correr_km/caminhar_km (ver missionProgress).
    progressoM: 0,
    aceiteEm: Date.now(),
  };
  saveMissionState(estado);
  renderMissionsPanel();
  return true;
}

function desistirMissao(id) {
  const estado = getMissionState();
  if (!estado.ativas[id]) return false;
  delete estado.ativas[id];
  estado.rejeitadaEm = Date.now(); // trava a ativacao de QUALQUER missao
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
// missao pode ter mudado. Verifica TODAS as missoes ativas (ate 3).
//
// sessao (opcional): { distanciaPorModo: { correr, caminhar } } da sessao que
// acabou. So correr_km/caminhar_km a usam - cada uma so soma a sua propria
// fatia (correr ou caminhar) ao acumulador.
// Conclui UMA missao: regista-a nas concluidas, liberta um lugar entre as ativas, conta
// para as conquistas, credita a recompensa e da feedback (toast + popup).
// Partilhada pela verificacao de fim de treino e pela AO VIVO (abaixo) - o
// jogador nao pode ficar sem resposta ate carregar em "Terminar" (bug
// reportado 2026-09-21: "o sistema nao valida que uma missao foi concluida,
// nao mostrou popup, nao deu medalha, nao deu feedback").
function concluirMissao(estado, id, ativa) {
  estado.concluidas.push(id);
  delete estado.ativas[id];

  if (typeof registarMissaoConcluidaVitalicio === "function") {
    registarMissaoConcluidaVitalicio(ativa.slot, estado.concluidas.length);
  }

  concederRecompensaMissao(ativa.recompensa);
  if (typeof showGameToast === "function") {
    const r = ativa.recompensa;
    const nome = typeof RESOURCE_BY_ID !== "undefined" && RESOURCE_BY_ID[r.recurso] ? RESOURCE_BY_ID[r.recurso].nome.toLowerCase() : r.recurso;
    showGameToast(`Missão concluída! +${r.quantidade} de ${nome}`, "medalha");
  }
  mostrarMissaoConcluida(ativa);
}

// Popup "Missao concluida" (2026-09-21). Fila: se duas missoes fecham ao mesmo
// tempo mostram-se uma a seguir a outra, cada uma com o seu "Continuar".
const missoesConcluidasPorMostrar = [];

function mostrarMissaoConcluida(ativa) {
  missoesConcluidasPorMostrar.push(ativa);
  const modal = document.getElementById("mission-complete-modal");
  if (modal && modal.classList.contains("hidden")) mostrarProximaMissaoConcluida();
}

function mostrarProximaMissaoConcluida() {
  const modal = document.getElementById("mission-complete-modal");
  if (!modal) return;
  const ativa = missoesConcluidasPorMostrar.shift();
  if (!ativa) {
    modal.classList.add("hidden");
    return;
  }
  const r = ativa.recompensa || {};
  const nomeRecurso = typeof RESOURCE_BY_ID !== "undefined" && RESOURCE_BY_ID[r.recurso] ? RESOURCE_BY_ID[r.recurso].nome : r.recurso;
  const ic = typeof icon === "function" && r.recurso ? icon(r.recurso, 16) : "";
  document.getElementById("mission-complete-goal").textContent = missaoTexto(ativa);
  document.getElementById("mission-complete-reward").innerHTML = r.quantidade
    ? `<span class="wallet-chip">${ic}+${r.quantidade} ${nomeRecurso}</span>`
    : "";
  modal.classList.remove("hidden");
}

function fecharMissaoConcluida() {
  document.getElementById("mission-complete-modal").classList.add("hidden");
  if (missoesConcluidasPorMostrar.length) mostrarProximaMissaoConcluida();
}

(function ligarPopupMissaoConcluida() {
  const botao = document.getElementById("btn-close-mission-complete");
  const modal = document.getElementById("mission-complete-modal");
  if (botao) botao.addEventListener("click", fecharMissaoConcluida);
  if (modal) modal.addEventListener("click", (e) => { if (e.target === modal) fecharMissaoConcluida(); });
})();

function verificarMissaoAtiva(sessao) {
  const estado = getMissionState();
  let mudou = false;

  Object.entries(estado.ativas).forEach(([id, ativa]) => {
    if (sessao && (ativa.tipo === "correr_km" || ativa.tipo === "caminhar_km")) {
      const modo = ativa.tipo === "correr_km" ? "correr" : "caminhar";
      const andou = Number(sessao.distanciaPorModo && sessao.distanciaPorModo[modo]) || 0;
      if (andou > 0) {
        ativa.progressoM = (Number(ativa.progressoM) || 0) + andou;
        mudou = true;
      }
    }

    const prog = missionProgress(ativa);
    if (!prog.done) return;

    mudou = true;
    concluirMissao(estado, id, ativa);
  });

  if (mudou) saveMissionState(estado);
  renderMissionsPanel();
}

// Verificacao AO VIVO (2026-09-21): chamada a cada segundo durante um treino
// (updateLiveMissionProgress, js/training.js) e sempre que algo muda a meio
// (deposito encontrado, concelho aberto). Conclui logo qualquer missao cujo
// progresso (incluindo a fatia da sessao em curso) ja chegou ao alvo. Depois
// de concluida a missao sai das ativas, por isso o fim do treino nao a volta
// a somar.
function verificarMissoesAoVivo(sessaoAoVivo) {
  const estado = getMissionState();
  let mudou = false;
  Object.entries(estado.ativas).forEach(([id, ativa]) => {
    if (!missionProgress(ativa, sessaoAoVivo).done) return;
    mudou = true;
    concluirMissao(estado, id, ativa);
  });
  if (mudou) {
    saveMissionState(estado);
    renderMissionsPanel();
  }
  return mudou;
}

// --- texto ----------------------------------------------------------------

// Ate 2026-09-19 os tipos com alvo numerico levavam "(acumulado)" no texto
// (Trello, 2026-09-14: "nao ha indicacao de que correr 15km sao acumulativos
// ou seguidos"). Removido a pedido em 2026-09-20 - o progresso continua a ser
// cumulativo (ver verificarMissaoAtiva), so o aviso saiu do texto.
function missaoTexto(missao) {
  switch (missao.tipo) {
    case "correr_km":
      return `Corre ${Math.round(missao.alvo / 1000)} km`;
    case "caminhar_km":
      return `Caminha ${Math.round(missao.alvo / 1000)} km`;
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
  if (missao.tipo === "correr_km" || missao.tipo === "caminhar_km") {
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

// Card "Missões Ativas" (2026-09-15, a pedido): as missões aceites (até 3),
// com progresso e Desistir; deixam de aparecer na lista do mês (ver
// renderListaDeMissoes). Omitido por completo quando nenhuma está aceite.
function renderMissoesAtivas(estado, sessaoAoVivo) {
  const ativas = Object.entries(estado.ativas);
  if (!ativas.length) return "";
  const cartoes = ativas
    .map(([id, ativa]) => {
      const prog = missionProgress(ativa, sessaoAoVivo);
      const pct = Math.max(0, Math.min(100, (prog.current / prog.target) * 100));
      return (
        '<div class="mission-card mission-active">' +
        `<p class="mission-line">${missaoRecompensaHtml(ativa.recompensa)}</p>` +
        `<p class="mission-goal">${missaoTexto(ativa)}</p>` +
        `<div class="mission-progress-track"><div class="mission-progress-fill" data-mission-fill="${id}" style="width:${pct}%"></div></div>` +
        `<p class="mission-progress-text" data-mission-progress="${id}">${missaoProgressoTexto(ativa, prog)}</p>` +
        `<button class="btn-mission-desistir mission-btn-ghost" type="button" data-mission-id="${id}">Desistir</button>` +
        "</div>"
      );
    })
    .join("");
  return `<section class="mission-subpanel"><h3 class="mission-subpanel-title">Missões Ativas · ${ativas.length}/${MISSION_MAX_ATIVAS}</h3>${cartoes}</section>`;
}

// Lista das 9 missoes do mes (2026-09-21, sem dificuldade), ordenada pela
// recompensa; as ativas ja estao em "Missões Ativas" e nao repetem aqui. Cada
// uma mostrada tem um de 3 estados:
//   - concluida este mes: cartao apagado, sem botao.
//   - bloqueada: ja ha MISSION_MAX_ATIVAS ativas, ou desistiu-se de uma missao
//     ha menos de 12h (mostra o tempo que falta) - sem botao.
//   - disponivel: botao "Aceitar".
function renderListaDeMissoes(estado) {
  const restante = missionCooldownRestanteMs(estado);
  const cheio = Object.keys(estado.ativas).length >= MISSION_MAX_ATIVAS;

  const cartoes = todasAsMissoesDoMes(estado.mes)
    .filter((m) => !estado.ativas[m.id])
    .map((m) => {
      const cabeca = `<p class="mission-line">${missaoRecompensaHtml(m.recompensa)}</p><p class="mission-goal">${missaoTexto(m)}</p>`;

      if (missaoJaConcluida(estado, m)) {
        return `<div class="mission-card mission-card-locked">${cabeca}<p class="mission-progress-text">Concluída este mês</p></div>`;
      }

      if (cheio || restante > 0) {
        const motivo = restante > 0 ? `Bloqueada (${formatCooldownRestante(restante)})` : `Bloqueada (já tens ${MISSION_MAX_ATIVAS} ativas)`;
        return `<div class="mission-card mission-card-locked">${cabeca}<p class="mission-progress-text">${motivo}</p></div>`;
      }

      return `<div class="mission-card">${cabeca}<button class="mission-btn-accept btn-primary" type="button" data-mission-aceitar="${m.id}">Aceitar</button></div>`;
    })
    .join("");

  return `<section class="mission-subpanel"><h3 class="mission-subpanel-title">Missões do mês</h3>${cartoes}</section>`;
}

// Atualiza SÓ a barra/texto de progresso das missões de distância ativas,
// SEM reconstruir mais nada do painel (bug 2026-09-15: "não é possível
// aceitar missões enquanto estás a treinar" - chamar renderMissionsPanel()
// (que reescreve todo o innerHTML, botões incluídos) a cada segundo durante
// o treino por vezes apagava o botão "Aceitar" a meio de um toque, entre o
// início e o fim do gesto, e o clique nunca chegava a disparar). Só mexe nos
// elementos marcados com data-mission-fill/data-mission-progress - nunca
// recria os cards/botões, por isso um toque em curso nunca é interrompido.
function updateLiveMissionProgress(sessaoAoVivo) {
  // Primeiro valida: se alguma acabou de ficar completa, conclui-a (o painel e
  // redesenhado la dentro) em vez de so deixar a barra a 100 %.
  verificarMissoesAoVivo(sessaoAoVivo);

  const estado = getMissionState();
  Object.entries(estado.ativas).forEach(([id, ativa]) => {
    if (ativa.tipo !== "correr_km" && ativa.tipo !== "caminhar_km" && ativa.tipo !== "descobre_hex") return;
    const prog = missionProgress(ativa, sessaoAoVivo);
    const pct = Math.max(0, Math.min(100, (prog.current / prog.target) * 100));
    const texto = missaoProgressoTexto(ativa, prog);
    document.querySelectorAll(`[data-mission-fill="${id}"]`).forEach((el) => {
      el.style.width = pct + "%";
    });
    document.querySelectorAll(`[data-mission-progress="${id}"]`).forEach((el) => {
      el.textContent = texto;
    });
  });
}

// Dois pontos de montagem (ecrã inicial e ecrã de treino em curso, index.html
// secção "Separador 1") - o painel deixou de desaparecer ao iniciar um treino
// (bug 2026-09-15, "missões desaparecem ao iniciar um treino, não devia"):
// os dois sao renderizados com o mesmo conteudo, so um fica visivel de
// cada vez consoante o `panel-screen` ativo.
// sessaoAoVivo (opcional): repassado a missionProgress - so quem tem um
// treino em curso o passa (js/training.js updateLiveStatsDisplay); todas as
// outras chamadas (aceitar/desistir/fim de treino/arranque) ficam sem ele,
// mostrando so o progresso ja gravado.
function renderMissionsPanel(sessaoAoVivo) {
  const paineis = ["missions-panel", "missions-panel-training"]
    .map((id) => document.getElementById(id))
    .filter(Boolean);
  if (!paineis.length) return;

  const estado = getMissionState();
  const mesLabel = missionMonthLabel(estado.mes);

  const corpo =
    `<p class="mission-help">Podes ter até ${MISSION_MAX_ATIVAS} missões ativas ao mesmo tempo e concluir as ${MISSION_TOTAL_TIPOS} do mês. Desistir perde o progresso e bloqueia novas missões durante ${Math.round(MISSION_REJECT_COOLDOWN_MS / 3600000)} h.</p>` +
    renderMissoesAtivas(estado, sessaoAoVivo) +
    renderListaDeMissoes(estado);

  const html =
    `<div class="mission-head"><span class="mission-title">Missões · ${mesLabel}</span>` +
    `<span class="mission-count">${estado.concluidas.length}/${MISSION_TOTAL_TIPOS}</span></div>` +
    corpo;

  paineis.forEach((painel) => {
    painel.innerHTML = html;

    painel.querySelectorAll(".btn-mission-desistir").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (confirm(`Desistir desta missão? Perdes o progresso e ficas ${Math.round(MISSION_REJECT_COOLDOWN_MS / 3600000)} horas sem poder ativar outra.`)) {
          desistirMissao(btn.dataset.missionId);
        }
      });
    });
    painel.querySelectorAll("[data-mission-aceitar]").forEach((btn) => {
      btn.addEventListener("click", () => aceitarMissao(btn.dataset.missionAceitar));
    });
  });
}

renderMissionsPanel();
