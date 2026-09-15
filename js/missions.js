// Missoes mensais (secção 22, 2026-09-10, a pedido).
//
// Cada mes de calendario tem TRES dificuldades - facil, media, dificil - e
// completar uma DA RECURSOS. Desde 2026-09-15, cada dificuldade mostra TODOS
// os tipos do seu pool (MISSION_POOL) em vez de sortear so um - o jogador
// escolhe qual aceitar. E desde 2026-09-15 (segunda mudanca do dia, a pedido:
// "deve ser possivel ativar 3 missoes, uma facil uma media uma dificil") as 3
// DIFICULDADES SAO INDEPENDENTES - pode haver uma ativa em cada uma ao mesmo
// tempo, nao so 1 no total. Os tipos de cada mes sao DETERMINISTAS: saem de
// um gerador semeado no proprio mes ("2026-09"), tal como as minas saem do
// osm_id do concelho (secção 21). Nao se guarda a missao, so o ESTADO: qual
// esta aceite em CADA dificuldade, quais ja foram concluidas e quando foi a
// ultima recusa de CADA dificuldade.
//
// Regras (todas a pedido):
//   - Ate 1 missao aceite POR DIFICULDADE (3 no total, uma facil, uma media,
//     uma dificil) - dificuldades diferentes nao se bloqueiam entre si.
//   - Recusar uma missao trava novas aceitacoes NESSA dificuldade durante 24h
//     - nao afeta as outras duas.
//   - Concluir NAO trava nada - aceita-se logo a seguinte dessa dificuldade.
//   - Concluida uma dificuldade, so no mes seguinte volta a ter missao.
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

// Toggle da lista completa das 3 missões do mês (fechada/aberta), fora do
// estado das missões em si - so um "lembrete visual" de leitura, por isso
// nao e guardado (reabre fechada a cada carregamento da pagina). Variavel de
// modulo para sobreviver aos redesenhos de renderMissionsPanel() (chamada a
// cada segundo durante um treino - se fosse reiniciada a cada render, a
// lista fechava-se sozinha 1x por segundo).
let missionsListaAberta = false;

// Pools por dificuldade. TODOS os tipos do pool de uma dificuldade aparecem
// nesse mes, lado a lado, para o jogador escolher (ver generateMonthlyMissions)
// - antes so se sorteava 1 por dificuldade, e um jogador podia passar meses
// sem ver a opção de caminhada (bug reportado via Trello 2026-09-15, depois
// de "caminhar_km" ter sido adicionado ao pool mas nao ter saido no sorteio
// desse mes: "não vejo opção de missão de caminhada"). Mantem-se sempre uma
// facil de esforco puro (km/hexes), a dificil e que traz os objetivos de mapa
// mais raros (concelho novo). "correr_km" e "caminhar_km" sao dois
// tipos irmaos (mesma logica, cada um so conta a sua fatia de distancia -
// ver missionProgress) - a pedido via Trello 2026-09-15: "e necessario ter
// opção de missões para corrida e caminhada... faceis medias ou dificeis",
// para quem caminha mais do que corre tambem ter missoes de distancia
// atingiveis nas 3 dificuldades.
const MISSION_POOL = {
  facil: ["correr_km", "caminhar_km", "descobre_hex"],
  media: ["correr_km", "caminhar_km", "descobre_hex", "descobre_mina"],
  dificil: ["correr_km", "caminhar_km", "descobre_hex", "descobre_concelho"],
};

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

function nextMonthLabel(monthKey) {
  const [y, m] = String(monthKey).split("-").map(Number);
  if (!m || typeof MONTH_NAMES_PT === "undefined") return "o próximo mês";
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return `${MONTH_NAMES_PT[nm - 1]} de ${ny}`;
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

// Uma dificuldade aceita missao nova se: nao tem uma ja ativa, nao foi
// concluida este mes, e nao esta em cooldown de recusa - independente do
// estado das OUTRAS duas dificuldades (2026-09-15 - deixou de ser "so 1 no
// total" para "ate 1 por dificuldade").
function podeAceitarMissao(estado, slot) {
  return !estado.ativas[slot] && !estado.concluidas.includes(slot) && missionCooldownRestanteMs(estado, slot) === 0;
}

// Todos os tipos de UMA dificuldade este mes, com os detalhes gerados.
function tiposDisponiveis(estado, slot) {
  return generateMonthlyMissions(estado.mes)[slot] || [];
}

function aceitarMissao(slot, tipo) {
  const estado = getMissionState();
  if (!podeAceitarMissao(estado, slot)) return false;
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

    estado.concluidas.push(slot);
    estado.ativas[slot] = null;
    mudou = true;

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

// Lista compacta e colapsável com TODOS os tipos de missão do mês, dificuldade
// a dificuldade (2026-09-15, a pedido via Trello: "Missões existentes ficam
// mesmo visíveis mas bloqueadas... uma lista que encolhe para não ocupar
// muito espaço... botão tipo 'ver lista de missões'") - por defeito só se vê
// a missão ativa de cada dificuldade (ou as disponíveis para aceitar); este
// botão dá acesso a todos os tipos sem ocupar espaço permanente. Os que não
// são o ativo da SUA dificuldade aparecem só como
// "Bloqueado"/"Disponível"/"Concluído" - não têm Aceitar aqui (a regra de só
// 1 por dificuldade continua, ver aceitarMissao()). Desde a 2ª mudança de
// 2026-09-15 (3 dificuldades independentes), o bloqueio é só dentro da MESMA
// dificuldade - uma média ativa não bloqueia a fácil nem a difícil.
function renderMissionsListaCompleta(estado) {
  const geradas = generateMonthlyMissions(estado.mes);
  const linhas = MISSION_SLOTS.flatMap((slot) => {
    const ativaDoSlot = estado.ativas[slot];
    const emCooldown = !ativaDoSlot && missionCooldownRestanteMs(estado, slot) > 0;
    return geradas[slot].map((missao) => {
      const concluida = estado.concluidas.includes(slot);
      const ativa = !!ativaDoSlot && ativaDoSlot.tipo === missao.tipo;
      // "Bloqueada" só faz sentido quando ha OUTRO tipo da MESMA dificuldade
      // ja ativo, OU essa dificuldade esta em cooldown de recusa (so 1 por
      // dificuldade de cada vez); sem nenhuma das duas, este tipo continua
      // "Disponível".
      const bloqueadaPorOutra = !concluida && !ativa && (!!ativaDoSlot || emCooldown);
      const estadoClasse = concluida ? "mission-mini-done" : ativa ? "mission-mini-active" : bloqueadaPorOutra ? "mission-mini-locked" : "mission-mini-disponivel";
      const estadoTexto = concluida ? "Concluída" : ativa ? "Em curso" : bloqueadaPorOutra ? "Bloqueada" : "Disponível";
      return (
        `<li class="mission-mini ${estadoClasse}">` +
        `<span class="mission-chip mission-chip-${slot}">${MISSION_SLOT_LABEL[slot]}</span>` +
        `<span class="mission-mini-text">${missaoTexto(missao)}</span>` +
        `<span class="mission-mini-status">${estadoTexto}</span>` +
        "</li>"
      );
    });
  }).join("");
  return (
    `<button class="btn-missions-lista-toggle training-detail-toggle" type="button" aria-expanded="${missionsListaAberta}">` +
    `${missionsListaAberta ? "Esconder lista de missões" : "Ver lista de missões"}</button>` +
    `<ul class="mission-mini-list${missionsListaAberta ? "" : " hidden"}">${linhas}</ul>`
  );
}

// Bloco de UMA dificuldade (2026-09-15 - as 3 sao independentes, por isso o
// painel passa a ter ate 3 blocos destes lado a lado, um por dificuldade, em
// vez de um só para "a" missão ativa). Mostra, por esta ordem de prioridade:
// concluída este mês > ativa (com progresso e Desistir) > em cooldown de
// recusa > lista de tipos por aceitar.
function renderMissionSlotBlock(estado, slot, sessaoAoVivo) {
  if (estado.concluidas.includes(slot)) {
    return `<p class="mission-empty">${MISSION_SLOT_LABEL[slot]}: concluída este mês.</p>`;
  }

  const ativa = estado.ativas[slot];
  if (ativa) {
    const prog = missionProgress(ativa, sessaoAoVivo);
    const pct = Math.max(0, Math.min(100, (prog.current / prog.target) * 100));
    return (
      '<div class="mission-card mission-active">' +
      `<p class="mission-line"><span class="mission-chip mission-chip-${slot}">${MISSION_SLOT_LABEL[slot]}</span>` +
      `${missaoRecompensaHtml(ativa.recompensa)}</p>` +
      `<p class="mission-goal">${missaoTexto(ativa)}</p>` +
      `<div class="mission-progress-track"><div class="mission-progress-fill" style="width:${pct}%"></div></div>` +
      `<p class="mission-progress-text">${missaoProgressoTexto(ativa, prog)}</p>` +
      `<button class="btn-mission-desistir mission-btn-ghost" type="button" data-mission-slot="${slot}">Desistir</button>` +
      "</div>"
    );
  }

  const restante = missionCooldownRestanteMs(estado, slot);
  if (restante > 0) {
    return `<p class="mission-empty">${MISSION_SLOT_LABEL[slot]}: recusaste, podes aceitar outra daqui a ${formatCooldownRestante(restante)}.</p>`;
  }

  return tiposDisponiveis(estado, slot)
    .map(
      (m) =>
        '<div class="mission-card">' +
        `<p class="mission-line"><span class="mission-chip mission-chip-${m.slot}">${MISSION_SLOT_LABEL[m.slot]}</span>${missaoRecompensaHtml(m.recompensa)}</p>` +
        `<p class="mission-goal">${missaoTexto(m)}</p>` +
        `<button class="mission-btn-accept btn-primary" type="button" data-mission-slot="${m.slot}" data-mission-tipo="${m.tipo}">Aceitar</button>` +
        "</div>"
    )
    .join("");
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

  let corpo = "";
  if (estado.concluidas.length >= MISSION_SLOTS.length) {
    corpo = `<p class="mission-empty">As três missões de ${mesLabel} estão concluídas. Novas missões em ${nextMonthLabel(estado.mes)}.</p>`;
  } else {
    corpo =
      '<p class="mission-help">Podes ter as 3 dificuldades ativas ao mesmo tempo — uma fácil, uma média, uma difícil. O progresso conta a partir do momento em que aceitas e soma-se ao longo de vários treinos.</p>' +
      MISSION_SLOTS.map((slot) => renderMissionSlotBlock(estado, slot, sessaoAoVivo)).join("");
  }

  const html =
    `<div class="mission-head"><span class="mission-title">Missões · ${mesLabel}</span>` +
    `<span class="mission-count">${estado.concluidas.length}/${MISSION_SLOTS.length}</span></div>` +
    corpo +
    renderMissionsListaCompleta(estado);

  paineis.forEach((painel) => {
    painel.innerHTML = html;

    painel.querySelectorAll(".btn-mission-desistir").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (confirm("Desistir desta missão? Ficas 24 horas sem poder aceitar outra da mesma dificuldade.")) {
          desistirMissao(btn.dataset.missionSlot);
        }
      });
    });
    const btnLista = painel.querySelector(".btn-missions-lista-toggle");
    if (btnLista) {
      btnLista.addEventListener("click", () => {
        missionsListaAberta = !missionsListaAberta;
        renderMissionsPanel(sessaoAoVivo);
      });
    }
    painel.querySelectorAll("[data-mission-slot][data-mission-tipo]").forEach((btn) => {
      btn.addEventListener("click", () => aceitarMissao(btn.dataset.missionSlot, btn.dataset.missionTipo));
    });
  });
}

renderMissionsPanel();
