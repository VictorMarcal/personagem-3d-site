// Missoes mensais (secção 22, 2026-09-10, a pedido).
//
// 9 missoes por mes: 3 dificuldades (facil, media, dificil) x 3 tipos cada
// (MISSION_POOL). TODAS AS 9 ESTAO SEMPRE VISIVEIS (2026-09-15, a pedido -
// "todas as missões estão sempre visíveis", sem lista escondida nem toggle),
// organizadas em 3 sub-paineis, um por dificuldade. Dentro de um sub-painel,
// aceitar um tipo BLOQUEIA os outros 2 tipos DESSA MESMA dificuldade (as
// outras duas dificuldades nao sao afetadas - pode haver ate 3 missoes
// ativas ao mesmo tempo, uma por dificuldade). Os tipos de cada mes sao
// DETERMINISTAS: saem de um gerador semeado no proprio mes ("2026-09"), tal
// como as minas saem do osm_id do concelho (secção 21). Nao se guarda a
// missao, so o ESTADO: qual esta aceite em CADA dificuldade, quais ja foram
// concluidas e quando foi a ultima recusa de CADA dificuldade.
//
// Regras (todas a pedido):
//   - Ate 1 missao ATIVA POR DIFICULDADE (3 no total, uma facil, uma media,
//     uma dificil) - dificuldades diferentes nao se bloqueiam entre si.
//   - Desistir de uma missao PERDE o progresso dela (progressoM volta a 0 -
//     a proxima que se aceite nessa dificuldade comeca do zero) e trava
//     novas aceitacoes NESSA dificuldade durante 12h - nao afeta as outras
//     duas.
//   - Concluir NAO trava nada - aceita-se logo a seguinte dessa dificuldade
//     (2026-09-16, a pedido - "quero mesmo 9 por mes": ate entao, concluir
//     UM tipo de uma dificuldade bloqueava OS OUTROS 2 tipos dessa mesma
//     dificuldade ate ao mes seguinte; agora cada TIPO tem o seu proprio
//     registo de conclusao, por isso os 3 tipos de cada dificuldade podem
//     ser concluidos no mesmo mes - 9 missoes no total, nao 3).
//   - Cada TIPO so pode ser concluido uma vez por mes - so no mes seguinte
//     volta a estar disponivel (ver tipoJaConcluido()).
//   - O progresso conta a partir do INSTANTE em que se aceita (baseline), nao
//     desde o inicio do mes - recusar/falhar nunca "credita" trabalho antigo.
//
// Depende de: js/resources.js (hashString, mulberry32, RESOURCE_IDS,
// RESOURCE_BY_ID, acumularProducao, warehouseCap, getWarehouseLevel,
// saveResources, getResources), js/experience.js (getLifetimeDistanceM),
// js/hexes.js (getDiscoveredHexCount, unlockedConcelhos), js/profile.js
// (formatMonthKey, MONTH_NAMES_PT), js/equipment.js (showGameToast),
// js/icons.js (icon), js/progress-sync.js (queueProgressSync),
// js/achievements.js (registarMissaoConcluidaVitalicio, 2026-09-16).
// Carrega
// depois de todos eles.

const MISSION_SLOTS = ["facil", "media", "dificil"];
const MISSION_SLOT_LABEL = { facil: "Fácil", media: "Média", dificil: "Difícil" };
// 12h desde 2026-09-15 (era 24h) - a pedido, junto com a mudanca para "todas
// as missoes sempre visiveis" (ver cabecalho do ficheiro).
const MISSION_REJECT_COOLDOWN_MS = 12 * 60 * 60 * 1000;

// Pools por dificuldade - exatamente 3 tipos cada, sempre TODOS visiveis ao
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

// Alvos por tipo e dificuldade. NUMEROS PROVISORIOS, mesma nota da secção 21:
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
  return {
    mes: monthKey,
    ativas: { facil: null, media: null, dificil: null },
    concluidas: [],
    rejeitadaEm: { facil: null, media: null, dificil: null },
  };
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
  if (!estado || typeof estado !== "object" || estado.ativas) return estado;
  const ativas = { facil: null, media: null, dificil: null };
  if (estado.ativa && MISSION_SLOTS.includes(estado.ativa.slot)) {
    ativas[estado.ativa.slot] = estado.ativa;
  }
  return {
    mes: estado.mes,
    ativas,
    concluidas: estado.concluidas || [],
    rejeitadaEm: { facil: null, media: null, dificil: null },
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

// Cooldown de recusa, POR DIFICULDADE desde 2026-09-15 (era global) - recusar
// a facil so trava a facil, media e dificil continuam livres.
function missionCooldownRestanteMs(estado, slot) {
  const ts = estado.rejeitadaEm && estado.rejeitadaEm[slot];
  if (!ts) return 0;
  return Math.max(0, MISSION_REJECT_COOLDOWN_MS - (Date.now() - Number(ts)));
}

// Um TIPO especifico ja foi concluido este mes se o seu "slot:tipo" estiver
// em concluidas - OU se so o "slot" (formato antigo, anterior a 2026-09-16,
// quando concluir 1 tipo bloqueava a dificuldade toda) la estiver, para nao
// "desconcluir" retroativamente quem ja tinha uma dificuldade fechada esse
// mes sob a regra antiga.
function tipoJaConcluido(estado, slot, tipo) {
  return estado.concluidas.includes(slot) || estado.concluidas.includes(slot + ":" + tipo);
}

// Um TIPO aceita-se se: a dificuldade nao tem outro tipo ja ativo, esse
// TIPO especifico nao foi concluido este mes, e a dificuldade nao esta em
// cooldown de recusa - independente do estado das OUTRAS duas dificuldades.
function podeAceitarMissao(estado, slot, tipo) {
  return !estado.ativas[slot] && !tipoJaConcluido(estado, slot, tipo) && missionCooldownRestanteMs(estado, slot) === 0;
}

// Todos os tipos de UMA dificuldade este mes, com os detalhes gerados.
function tiposDisponiveis(estado, slot) {
  return generateMonthlyMissions(estado.mes)[slot] || [];
}

function aceitarMissao(slot, tipo) {
  const estado = getMissionState();
  if (!podeAceitarMissao(estado, slot, tipo)) return false;
  const missao = tiposDisponiveis(estado, slot).find((m) => m.tipo === tipo);
  if (!missao) return false;
  estado.ativas[slot] = {
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

function desistirMissao(slot) {
  const estado = getMissionState();
  if (!estado.ativas[slot]) return false;
  estado.ativas[slot] = null;
  estado.rejeitadaEm[slot] = Date.now();
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
// missao pode ter mudado. Verifica as 3 dificuldades independentemente
// (2026-09-15 - podem estar as 3 ativas ao mesmo tempo).
//
// sessao (opcional): { distanciaPorModo: { correr, caminhar } } da sessao que
// acabou. So correr_km/caminhar_km a usam - cada uma so soma a sua propria
// fatia (correr ou caminhar) ao acumulador.
function verificarMissaoAtiva(sessao) {
  const estado = getMissionState();
  let mudou = false;

  MISSION_SLOTS.forEach((slot) => {
    const ativa = estado.ativas[slot];
    if (!ativa) return;

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

    estado.concluidas.push(slot + ":" + ativa.tipo);
    estado.ativas[slot] = null;
    mudou = true;

    if (typeof registarMissaoConcluidaVitalicio === "function") {
      registarMissaoConcluidaVitalicio(slot, estado.concluidas.length);
    }

    concederRecompensaMissao(ativa.recompensa);
    if (typeof showGameToast === "function") {
      const r = ativa.recompensa;
      const nome = typeof RESOURCE_BY_ID !== "undefined" && RESOURCE_BY_ID[r.recurso] ? RESOURCE_BY_ID[r.recurso].nome.toLowerCase() : r.recurso;
      showGameToast(`Missão concluída! +${r.quantidade} de ${nome}`, "medalha");
    }
  });

  if (mudou) saveMissionState(estado);
  renderMissionsPanel();
}

// --- texto ----------------------------------------------------------------

// "(acumulado)" so nos tipos com alvo numerico, onde faz sentido perguntar
// "tenho de fazer isto de uma vez?" - descobre_mina/descobre_concelho sao um
// evento unico (achar UMA mina, desbloquear UM concelho), nao ha ambiguidade
// nenhuma a desfazer nesses. Fica no PROPRIO texto da missao (nao so num
// aviso a parte) para aparecer sempre - antes e depois de aceitar (bug
// reportado via Trello, 2026-09-14: o aviso a parte so aparecia no ecra de
// aceitar, quem ja tinha a missao aceite nunca chegava a ve-lo).
function missaoTexto(missao) {
  switch (missao.tipo) {
    case "correr_km":
      return `Corre ${Math.round(missao.alvo / 1000)} km (acumulado)`;
    case "caminhar_km":
      return `Caminha ${Math.round(missao.alvo / 1000)} km (acumulado)`;
    case "descobre_hex":
      return `Descobre ${missao.alvo} hexágonos novos (acumulado)`;
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

// Card "Missões Ativas" (2026-09-15, a pedido: "as missões que foram
// escolhidas passam para um novo card... e saem dos cards onde estavam") -
// junta as missões aceites das 3 dificuldades num só sítio, com progresso e
// Desistir; deixam de aparecer no sub-painel da sua dificuldade (ver
// renderMissionSlotBlock). Omitido por completo quando nenhuma está aceite.
function renderMissoesAtivas(estado, sessaoAoVivo) {
  const cartoes = MISSION_SLOTS.map((slot) => {
    const ativa = estado.ativas[slot];
    if (!ativa) return "";
    const prog = missionProgress(ativa, sessaoAoVivo);
    const pct = Math.max(0, Math.min(100, (prog.current / prog.target) * 100));
    return (
      `<div class="mission-card mission-active mission-card-${slot}">` +
      `<p class="mission-line">${missaoRecompensaHtml(ativa.recompensa)}</p>` +
      `<p class="mission-goal">${missaoTexto(ativa)}</p>` +
      `<div class="mission-progress-track"><div class="mission-progress-fill" data-mission-fill="${slot}" style="width:${pct}%"></div></div>` +
      `<p class="mission-progress-text" data-mission-progress="${slot}">${missaoProgressoTexto(ativa, prog)}</p>` +
      `<button class="btn-mission-desistir mission-btn-ghost" type="button" data-mission-slot="${slot}">Desistir</button>` +
      "</div>"
    );
  }).join("");
  if (!cartoes) return "";
  return `<section class="mission-subpanel"><h3 class="mission-subpanel-title">Missões Ativas</h3>${cartoes}</section>`;
}

// Sub-painel de UMA dificuldade: mostra os tipos ainda POR ESCOLHER dessa
// dificuldade (2 se já há uma ativa - a 3ª mudou-se para "Missões Ativas",
// ver acima - ou as 3 nos outros casos). Cada tipo mostrado tem um de 3
// estados:
//   - concluído este mês: cartão apagado, sem botão (só ESSE tipo -
//     2026-09-16, concluir um tipo já não bloqueia os outros 2 da mesma
//     dificuldade, ver tipoJaConcluido()).
//   - bloqueado: outro tipo desta MESMA dificuldade já está ativo, ou esta
//     dificuldade está em cooldown de recusa (12h) - sem botão.
//   - disponível: nenhuma ativa nesta dificuldade, sem cooldown, e este
//     tipo ainda não foi concluído este mês - botão "Aceitar".
// As outras duas dificuldades nunca bloqueiam esta - só o que se passa
// DENTRO da própria dificuldade importa.
function renderMissionSlotBlock(estado, slot) {
  const ativa = estado.ativas[slot];
  const restante = ativa ? 0 : missionCooldownRestanteMs(estado, slot);

  const cartoes = tiposDisponiveis(estado, slot)
    .filter((m) => !(ativa && ativa.tipo === m.tipo))
    .map((m) => {
      const concluida = tipoJaConcluido(estado, slot, m.tipo);

      if (concluida) {
        return (
          `<div class="mission-card mission-card-locked mission-card-${slot}">` +
          `<p class="mission-line">${missaoRecompensaHtml(m.recompensa)}</p>` +
          `<p class="mission-goal">${missaoTexto(m)}</p>` +
          '<p class="mission-progress-text">Concluída este mês</p>' +
          "</div>"
        );
      }

      if (ativa || restante > 0) {
        const motivo = ativa ? "Bloqueada" : `Bloqueada (${formatCooldownRestante(restante)})`;
        return (
          `<div class="mission-card mission-card-locked mission-card-${slot}">` +
          `<p class="mission-line">${missaoRecompensaHtml(m.recompensa)}</p>` +
          `<p class="mission-goal">${missaoTexto(m)}</p>` +
          `<p class="mission-progress-text">${motivo}</p>` +
          "</div>"
        );
      }

      return (
        `<div class="mission-card mission-card-${slot}">` +
        `<p class="mission-line">${missaoRecompensaHtml(m.recompensa)}</p>` +
        `<p class="mission-goal">${missaoTexto(m)}</p>` +
        `<button class="mission-btn-accept btn-primary" type="button" data-mission-slot="${slot}" data-mission-tipo="${m.tipo}">Aceitar</button>` +
        "</div>"
      );
    })
    .join("");

  return `<section class="mission-subpanel"><h3 class="mission-subpanel-title">${MISSION_SLOT_LABEL[slot]}</h3>${cartoes}</section>`;
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
  const estado = getMissionState();
  MISSION_SLOTS.forEach((slot) => {
    const ativa = estado.ativas[slot];
    if (!ativa || (ativa.tipo !== "correr_km" && ativa.tipo !== "caminhar_km")) return;
    const prog = missionProgress(ativa, sessaoAoVivo);
    const pct = Math.max(0, Math.min(100, (prog.current / prog.target) * 100));
    const texto = missaoProgressoTexto(ativa, prog);
    document.querySelectorAll(`[data-mission-fill="${slot}"]`).forEach((el) => {
      el.style.width = pct + "%";
    });
    document.querySelectorAll(`[data-mission-progress="${slot}"]`).forEach((el) => {
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
    '<p class="mission-help">Podes ter uma missão ativa por dificuldade (3 no total) e concluir os 3 tipos de cada dificuldade por mês (9 no total). Desistir perde o progresso e bloqueia essa dificuldade 12h.</p>' +
    renderMissoesAtivas(estado, sessaoAoVivo) +
    MISSION_SLOTS.map((slot) => renderMissionSlotBlock(estado, slot)).join("");

  const html =
    `<div class="mission-head"><span class="mission-title">Missões · ${mesLabel}</span>` +
    `<span class="mission-count">${estado.concluidas.length}/${MISSION_TOTAL_TIPOS}</span></div>` +
    corpo;

  paineis.forEach((painel) => {
    painel.innerHTML = html;

    painel.querySelectorAll(".btn-mission-desistir").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (confirm("Desistir desta missão? Perdes o progresso e ficas 12 horas sem poder aceitar outra da mesma dificuldade.")) {
          desistirMissao(btn.dataset.missionSlot);
        }
      });
    });
    painel.querySelectorAll("[data-mission-slot][data-mission-tipo]").forEach((btn) => {
      btn.addEventListener("click", () => aceitarMissao(btn.dataset.missionSlot, btn.dataset.missionTipo));
    });
  });
}

renderMissionsPanel();
