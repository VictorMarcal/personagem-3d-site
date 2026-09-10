const startScreen = document.getElementById("start-screen");
const trainingScreen = document.getElementById("training-screen");
const btnStart = document.getElementById("btn-start-treino");
const btnPause = document.getElementById("btn-pause-treino");
const btnResume = document.getElementById("btn-resume-treino");
const btnFinish = document.getElementById("btn-finish-treino");
const pauseModal = document.getElementById("training-pause-modal");
const pauseElapsedEl = document.getElementById("pause-elapsed");
const summaryModal = document.getElementById("training-summary-modal");
const btnSummaryClose = document.getElementById("btn-summary-close");
const distanceEl = document.getElementById("training-distance");
const speedWarningEl = document.getElementById("speed-warning");

const EARTH_RADIUS_M = 6371000;
// Baixado de 10s para 5s (2026-08-03): TAB_LOCK_STALE_MS (js/tab-lock.js) e
// de 15000ms - com o antigo intervalo de 10s so havia 5s de margem antes do
// bloqueio entre abas poder expirar por engano (ex: browser a atrasar
// temporizadores com o ecra bloqueado/aba em segundo plano). Com 5s, a
// margem passa a ser de 10s, o dobro.
const SAVE_INTERVAL_MS = 5000;

// Filtros contra ruido/erros de GPS: ignora leituras pouco precisas,
// movimentos pequenos demais para serem deslocamento real (parado, o GPS
// "deriva" uns metros por conta propria) e saltos rapidos demais para
// serem deslocamento real a pe (erro de GPS ou veiculo). Todos ajustaveis
// no card de Debug (js/debug.js).
const STORAGE_KEYS = {
  active: "treino.ativo",
  distanciaAcumuladaM: "treino.distanciaAcumuladaM",
  ultimaPosicao: "treino.ultimaPosicao",
  inicioSessao: "treino.inicioSessao",
  // Calorias/atividade/modo dominante (2026-08-11, bug reportado - "sempre
  // que dava refresh a pagina, as calorias contadas desapareciam e
  // voltavam a zero"): so distancia/posicao eram persistidas ate aqui.
  caloriasAcumuladasKcal: "treino.caloriasAcumuladasKcal",
  modoTempoAcumuladoMs: "treino.modoTempoAcumuladoMs",
  atividadeAtiva: "treino.atividadeAtiva",
  // Tempo EM MOVIMENTO (2026-08-15, secção 4.6) - distinto da duracao de
  // relogio de parede. Sem isto o MET da bicicleta sai de uma velocidade
  // media diluida pelo tempo parado.
  tempoMovimentoS: "treino.tempoMovimentoS",
  // Pausa (secção 4.7) - persistidas para um refresh a meio de uma pausa
  // nao transformar o tempo parado em tempo de treino.
  pausaTotalMs: "treino.pausaTotalMs",
  pausaInicioMs: "treino.pausaInicioMs",
  pausaAutoMs: "treino.pausaAutoMs",
};

// Para apresentacao (historico do Perfil, treinos de hoje). Declarado aqui
// (carrega antes de js/profile.js) para nao duplicar o identificador global.
// `bicicleta` mantem-se aqui SO para rotular sessoes antigas no historico
// (js/profile.js) - a bicicleta foi removida como treino em 2026-09-10
// (a pedido). Nada de novo e classificado como bicicleta.
const MODE_LABEL_PT = { caminhar: "Caminhar", correr: "Correr", bicicleta: "Bicicleta" };

// --- Deteccao automatica de atividade (2026-08-10, secção 17.1 da
// documentacao) - substitui a escolha manual de modo. Cada segmento de GPS
// e classificado pela velocidade MEDIA de uma janela deslizante (evita
// reclassificar a cada oscilacao pontual, ex: parar num semaforo), com
// historese antes de confirmar uma mudanca de categoria. "parado" nao
// acumula distancia/calorias (pausa automatica).
//
// Desde 2026-09-10 so ha dois modos, Caminhar e Correr: a bicicleta foi
// removida (a pedido) e velocidades acima do teto de seguranca (que baixou
// para caber a pe/corrida) sao descartadas como "nao real", nao
// reclassificadas.
const ACTIVITY_STOPPED = "parado";
const ACTIVITY_WALK = "caminhar";
const ACTIVITY_RUN = "correr";
const ACTIVITY_LABEL_PT = { parado: "Parado", caminhar: "Caminhar", correr: "Correr" };

function classifySpeedKmh(speedKmh) {
  if (speedKmh < getActivityStoppedMaxKmh()) return ACTIVITY_STOPPED;
  if (speedKmh < getActivityWalkMaxKmh()) return ACTIVITY_WALK;
  return ACTIVITY_RUN;
}

// O "filtro de passada" por acelerometro (secção 4.3, 2026-08-12/14) foi
// REMOVIDO em 2026-09-10 junto com a bicicleta: o seu unico proposito era
// reclassificar caminhar/correr -> bicicleta quando nao havia passada
// (pedalar). Sem bicicleta nao ha nada para desempatar - a classificacao
// e so por velocidade (classifySpeedKmh). Deixou tambem de ser preciso
// pedir a permissao de movimento no iOS.

// Limites alinhados com as faixas de classificacao por velocidade (2/6.5
// km/h, ver classifySpeedKmh); os acima do teto de seguranca ficam so para
// se ver quanto ruido/tempo a sessao passou fora do limite.
const SPEED_BUCKETS = [2, 6.5, 10, 14, 20, 25, 35];

function bucketIndex(value, limits) {
  for (let i = 0; i < limits.length; i++) {
    if (value < limits[i]) return i;
  }
  return limits.length;
}

// Amostras {speedMps, timestamp} dos ultimos getActivityWindowSeconds()
// segundos - usadas so para a media da janela deslizante acima, nao para o
// calculo de calorias em si (esse usa a velocidade real de cada segmento).
let speedSampleBuffer = [];

function pushSpeedSample(speedMps, timestamp) {
  speedSampleBuffer.push({ speedMps, timestamp });
  const windowMs = getActivityWindowSeconds() * 1000;
  while (speedSampleBuffer.length > 1 && timestamp - speedSampleBuffer[0].timestamp > windowMs) {
    speedSampleBuffer.shift();
  }
}

// Media da janela PONDERADA pelo tempo entre amostras (nao uma media simples
// dos valores) - leituras de GPS nao chegam a intervalos regulares.
function windowAverageSpeedMps() {
  if (speedSampleBuffer.length === 0) return 0;
  if (speedSampleBuffer.length === 1) return speedSampleBuffer[0].speedMps;
  let weightedSum = 0;
  let totalWeight = 0;
  for (let i = 1; i < speedSampleBuffer.length; i++) {
    const dt = speedSampleBuffer[i].timestamp - speedSampleBuffer[i - 1].timestamp;
    weightedSum += speedSampleBuffer[i].speedMps * dt;
    totalWeight += dt;
  }
  return totalWeight > 0 ? weightedSum / totalWeight : speedSampleBuffer[speedSampleBuffer.length - 1].speedMps;
}

// Atividade confirmada (a que de facto conta para MET/calorias) - so muda
// depois de a classificacao da janela se manter estavel numa categoria
// diferente por getActivityHysteresisSeconds() segundos seguidos.
let currentActiveMode = null;
let pendingMode = null;
let pendingModeSinceMs = null;

function updateDetectedActivity(timestamp) {
  const candidate = classifySpeedKmh(windowAverageSpeedMps() * 3.6);

  if (currentActiveMode === null) {
    currentActiveMode = candidate; // primeira leitura da sessao, sem periodo de graca
    pendingMode = null;
    return;
  }
  if (candidate === currentActiveMode) {
    pendingMode = null;
    return;
  }
  if (candidate !== pendingMode) {
    pendingMode = candidate;
    pendingModeSinceMs = timestamp;
    return;
  }
  if (timestamp - pendingModeSinceMs >= getActivityHysteresisSeconds() * 1000) {
    currentActiveMode = candidate;
    pendingMode = null;
  }
}

// --- Formula MET (calorias) -----------------------------------------------
//
// Caminhar/Correr: equacoes continuas do ACSM (VO2 em ml/kg/min a partir da
// velocidade em m/min). Calorias = MET x peso(kg) x horas, por segmento,
// somadas ao longo da sessao (secção 17.1 da documentação).
//
// A tabela por faixas da bicicleta (Compendium of Physical Activities) foi
// removida em 2026-09-10 com o resto do modo bicicleta - so andar/correr
// usam esta formula, e ambos sao lineares na velocidade.
function computeWalkOrRunMet(speedKmh, isRunning) {
  const speedMPerMin = (speedKmh * 1000) / 60;
  const vo2 = (isRunning ? 0.2 : 0.1) * speedMPerMin + 3.5;
  return vo2 / 3.5;
}

function computeMetForActivity(activity, speedKmh) {
  if (activity === ACTIVITY_WALK) return computeWalkOrRunMet(speedKmh, false);
  if (activity === ACTIVITY_RUN) return computeWalkOrRunMet(speedKmh, true);
  return 0; // parado - nunca chamado (ver onPositionUpdate, parado nao gera segmento)
}

function computeSegmentCalories(activity, speedKmh, durationSeconds) {
  const met = computeMetForActivity(activity, speedKmh);
  return met * getPesoKg() * (durationSeconds / 3600);
}

// Calorias GRAVADAS no fim da sessao (2026-08-14, secção 4.4) - calculadas
// a partir dos TOTAIS da sessao (distancia e duracao reais), nao da soma
// das fatias por segmento.
//
// Porque: somar por segmento depende de o GPS entregar leituras com
// regularidade, e quando isso falha o tempo perde-se. Duas sessoes reais do
// Bernardo com falhas de sinal de 7 minutos ficaram com 32% e 66% das
// calorias esperadas (186 kcal para 18.5km de bicicleta, quando o relogio
// dele marcava um total do dia coerente com ~584). A distancia sobrevive a
// uma falha (o segmento seguinte e creditado em linha reta), mas o tempo
// creditado nao - e capado a getActivityWindowSeconds() por segmento, teto
// posto em 2026-08-11 para resolver o problema OPOSTO (calorias infladas
// por tempo parado, secção 4.1). Ou seja, um erro tinha sido trocado por
// outro.
//
// Os totais nao tem esse problema: a duracao e relogio de parede e a
// distancia e a soma do que de facto contou. Validado contra os dois casos
// extremos ja conhecidos - a sessao de 33 min quase parado da 58 kcal (pouco
// acima do metabolismo em repouso, que era o valor correto) e as sessoes do
// Bernardo passam a bater certo com o relogio dele dentro de ~10%.
//
// A soma por segmento (sessionCaloriesKcal) CONTINUA a existir, so que
// apenas para o mostrador ao vivo durante o treino: ali um erro nao
// persiste, e ter feedback imediato a cada leitura vale mais que a precisao.
//
// A caminhada/corrida usa a equacao do ACSM, que e LINEAR na velocidade.
// Substituindo v = d/t na formula, o t corta-se:
//
//   kcal = peso x (0,476 x distancia_km + horas)
//
// ou seja, o tempo parado entra sozinho a 1 MET - exatamente o metabolismo
// em repouso, que e o valor certo. A diluicao cancela-se por construcao.
// (Ate 2026-09-10 havia aqui um ramo para a bicicleta, cuja tabela por
// faixas NAO tinha esse cancelamento e precisava do tempo em movimento; saiu
// com o modo bicicleta.)
//
// Calorias de UM modo, a partir dos totais desse modo - isolada para poder
// ser aplicada uma vez por sessao ou uma vez por modo sem duplicar a logica.
function caloriasDeUmModo(distanceM, durationSeconds, mode) {
  if (!durationSeconds || durationSeconds <= 0) return 0;
  const hours = durationSeconds / 3600;
  const avgSpeedKmh = distanceM / 1000 / hours;
  return computeMetForActivity(mode, avgSpeedKmh) * getPesoKg() * hours;
}

// CALORIAS POR MODO (2026-09-07, secção 4.9). Antes usava-se o MET do modo
// DOMINANTE na sessao inteira. Hoje so ha Caminhar e Correr, mas uma sessao
// ainda pode passar pelos dois.
//
// O tempo ATIVO real da sessao (relogio, fiavel) e repartido pelos modos na
// proporcao de modeTimeAccumMs (so se aproveita a PROPORCAO, nao o valor
// absoluto - esta capado por segmento), e cada fatia leva o seu proprio MET.
// A soma das horas continua a ser a duracao real - a propriedade que a
// secção 4.4 exige. Com um so modo a proporcao e 1 e o resultado e identico.
//
// `movingSeconds` ja nao e usado (era so para a tabela por faixas da
// bicicleta, removida em 2026-09-10) - mantido na assinatura porque varios
// chamadores ainda o passam a partir de training_sessions.moving_seconds.
function computeSessionCaloriesFromTotals(distanceM, durationSeconds, mode, movingSeconds, distanciaPorModo, tempoPorModo) {
  if (!durationSeconds || durationSeconds <= 0) return 0;

  const modos = distanciaPorModo ? Object.keys(distanciaPorModo).filter((m) => distanciaPorModo[m] > 0) : [];
  const somaTempos = modos.reduce((s, m) => s + (Number(tempoPorModo && tempoPorModo[m]) || 0), 0);

  if (modos.length <= 1 || somaTempos <= 0) {
    return caloriasDeUmModo(distanceM, durationSeconds, mode);
  }

  return modos.reduce((total, m) => {
    const fatia = (Number(tempoPorModo[m]) || 0) / somaTempos;
    return total + caloriasDeUmModo(distanciaPorModo[m], durationSeconds * fatia, m);
  }, 0);
}

// Reparticao da sessao pelos modos: metros e milissegundos por atividade.
// Existe uma so vez porque o mostrador AO VIVO e o valor GRAVADO tem de sair
// da mesma conta - se divergissem, o numero saltava ao terminar o treino.
//
// Arredondado ao metro: guardar 14 casas decimais de um GPS com 5 m de
// precisao seria falsa exatidao.
function reparticaoDaSessao() {
  const distancia = {};
  Object.keys(modeDistanceAccumM).forEach((m) => {
    const metros = Math.round(Number(modeDistanceAccumM[m]) || 0);
    if (metros > 0) distancia[m] = metros;
  });
  const tempo = {};
  Object.keys(modeTimeAccumMs).forEach((m) => {
    const ms = Math.round(Number(modeTimeAccumMs[m]) || 0);
    if (ms > 0) tempo[m] = ms;
  });
  return { distancia, tempo };
}

// Tempo (ms) acumulado em cada atividade nesta sessao - decide o "modo
// dominante" (o que ocupou mais tempo), gravado em training_sessions.mode
// e usado pelas conquistas de ritmo/recorde pessoal por modo (secção 10).
let modeTimeAccumMs = { caminhar: 0, correr: 0 };

function getDominantMode() {
  let best = "correr";
  let bestMs = 0;
  [ACTIVITY_WALK, ACTIVITY_RUN].forEach((mode) => {
    if ((modeTimeAccumMs[mode] || 0) > bestMs) {
      bestMs = modeTimeAccumMs[mode];
      best = mode;
    }
  });
  return best;
}

function haversineDistance(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_M * c;
}

// Distancia do treino a decorrer (em memoria, atualizada a cada leitura de GPS)
let totalDistanceM = 0;
// lastPosition: SEMPRE avanca para a leitura mais recente - usada para
// velocidade/deteccao de atividade (classifySpeedKmh, teto de seguranca).
// lastCountedPosition: so avanca quando um segmento e de facto creditado a
// distancia/calorias (2026-08-11, bug reportado - treino real de 1-3min a
// pe ficava sempre a 0.00km/0kcal). Com uma unica ancora que avanca sempre,
// um telemovel a reportar GPS mais depressa do que o tempo que a pe leva a
// percorrer MIN_MOVEMENT_M (ex: leituras a cada 1-2s a 4km/h) nunca gera um
// UNICO segmento grande o suficiente para contar, por mais que o jogador
// caminhe sem parar. Com duas ancoras, segmentos pequenos consecutivos
// somam-se (lastCountedPosition fica para tras) ate ultrapassarem o
// limiar, exatamente como antes da correcao de ontem para o "parado".
let lastPosition = null;
let lastCountedPosition = null;
let watchId = null;
let saveIntervalId = null;
let sessionStartTime = null; // usado para conquistas de ritmo (ex: 5km em menos de 25 min)

// Calorias da sessao em curso (soma dos segmentos, formula MET acima) - e
// o que conta para XP/nivel (secção 5). Velocidade nominal = velocidade
// do ultimo segmento aceite (instantanea), distinta da media da sessao
// inteira mostrada ao lado.
let sessionCaloriesKcal = 0;
let sessionMovingSeconds = 0;
// Hexagonos por onde se passou NESTA sessao (secção 21). E um conjunto, por
// isso passar dez vezes no mesmo conta uma.
let sessionHexIds = new Set();
let modeDistanceAccumM = {};
let currentNominalSpeedMps = 0;

// --- Diagnostico do sinal de GPS (2026-08-11, secção 4.2) -----------------
//
// Contadores por sessao, gravados em training_sessions.gps_diag (jsonb).
// Existem porque, ao comparar uma caminhada real com um relogio desportivo,
// nao havia forma nenhuma de saber ONDE se perdia distancia - a app so
// guardava o resultado final, nunca a qualidade do sinal que o produziu.
// Sem isto, qualquer afinacao dos filtros (precisao/movimento minimo) seria
// um palpite. maxGapMs e o maior intervalo entre leituras consecutivas
// entregues pelo browser: e o indicador direto de suspensao em segundo
// plano (ecra bloqueado/troca de app), a principal fraqueza estrutural de
// um tracker em browser face a uma app nativa - ver requestWakeLock abaixo.
// Acima disto, um intervalo entre leituras deixa de ser jitter e passa a ser
// tempo morto - o GPS a 1 Hz nunca falha 30 s sem motivo.
const LONG_GAP_MS = 30000;

let gpsDiag = null;
let lastReadingTimestamp = null;

function resetGpsDiag() {
  gpsDiag = {
    leituras: 0,            // total entregue por watchPosition
    rejeitadasPrecisao: 0,  // accuracy pior que getMaxAccuracyM()
    rejeitadasVelocidade: 0,// acima do teto de seguranca (getMaxSafeSpeedKmh)
    abaixoMovimentoMin: 0,  // segmento < getMinMovementM(), nao creditado
    creditadas: 0,          // segmentos que somaram distancia/calorias
    paradoIgnorado: 0,      // classificado "parado" (pausa automatica)
    maxGapMs: 0,            // maior intervalo entre leituras consecutivas
    somaPrecisaoM: 0,       // para a media de precisao no fim
    // Distribuicao de velocidades: quanto tempo a sessao passou em cada
    // faixa (e nao so a media/maximo).
    velocidadeMaxKmh: 0,
    velocidadeHist: new Array(SPEED_BUCKETS.length + 1).fill(0),
    // Pontos cegos tapados em 2026-08-14: o diagnostico dizia o TAMANHO de
    // uma falha de sinal mas nunca a RAZAO - nao dava para distinguir "o
    // telemovel foi bloqueado" de "o GPS nao conseguiu fixar".
    errosTimeout: 0,        // GPS nao fixou a tempo (code 3)
    errosPosicaoIndisp: 0,  // sem sinal (code 2)
    errosPermissao: 0,      // permissao retirada a meio (code 1)
    msEscondido: 0,         // tempo com a pagina escondida (ecra bloqueado/troca de app)
    vezesEscondido: 0,
    wakeLockAtivo: false,   // chegou a estar ativo em algum momento da sessao
    // Pontos cegos tapados em 2026-08-15, depois de uma saida do Bernardo
    // (iOS) com wakeLockAtivo:false e leituras de 70 em 70 segundos. O
    // diagnostico dizia que o wake lock nunca esteve ativo, mas nao dizia
    // se a API nem sequer existe (Safari so a tem desde iOS 16.4) ou se foi
    // pedida e recusada - sao problemas diferentes, com respostas diferentes.
    wakeLockSuportado: "wakeLock" in navigator,
    wakeLockPedidos: 0,     // vezes que se tentou obter
    wakeLockObtidos: 0,     // vezes que se conseguiu
    wakeLockErro: null,     // nome do erro da ultima recusa
    // Tempo morto MEDIDO PELAS PROPRIAS LEITURAS, sem depender do
    // visibilitychange: no iOS o JS congela ao bloquear o ecra e o evento
    // nem sempre chega, por isso msEscondido pode estar a sub-contar. Se
    // este valor for muito maior que msEscondido, e essa a explicacao.
    msSemLeituras: 0,       // soma dos intervalos acima de LONG_GAP_MS
    gapsLongos: 0,
  };
  lastReadingTimestamp = null;
  hiddenSinceMs = null;
}

// Tempo que a pagina passou escondida durante o treino - indicador direto
// de "o telemovel foi bloqueado / trocou-se de app", a principal causa
// suspeita das falhas de sinal (secção 4.2).
let hiddenSinceMs = null;

document.addEventListener("visibilitychange", () => {
  if (watchId === null || !gpsDiag) return;
  if (document.visibilityState === "hidden") {
    hiddenSinceMs = Date.now();
    gpsDiag.vezesEscondido += 1;
  } else if (hiddenSinceMs !== null) {
    gpsDiag.msEscondido += Date.now() - hiddenSinceMs;
    hiddenSinceMs = null;
  }
});

resetGpsDiag();

// Media de precisao so faz sentido sobre as leituras que chegaram a ser
// contabilizadas - devolve null numa sessao sem leituras nenhumas.
function buildGpsDiagRecord() {
  if (!gpsDiag || gpsDiag.leituras === 0) return null;
  // Se a sessao terminar com a pagina ainda escondida, o periodo em curso
  // nunca chegou a ser fechado pelo visibilitychange - fecha-se aqui.
  if (hiddenSinceMs !== null) {
    gpsDiag.msEscondido += Date.now() - hiddenSinceMs;
    hiddenSinceMs = null;
  }
  return {
    ...gpsDiag,
    precisaoMediaM: Math.round((gpsDiag.somaPrecisaoM / gpsDiag.leituras) * 10) / 10,
    maxGapS: Math.round(gpsDiag.maxGapMs / 100) / 10,
    segundosEscondido: Math.round(gpsDiag.msEscondido / 1000),
    // Comparar os dois: se "semLeituras" for muito maior que "escondido", o
    // visibilitychange nao esta a apanhar as pausas (tipico do iOS a
    // bloquear o ecra).
    segundosSemLeituras: Math.round(gpsDiag.msSemLeituras / 1000),
    // Limites incluidos no proprio registo: sem isto, um histograma antigo
    // fica impossivel de ler depois de os baldes mudarem.
    speedBuckets: SPEED_BUCKETS,
    velocidadeMaxKmh: Math.round(gpsDiag.velocidadeMaxKmh * 10) / 10,
    config: {
      maxAccuracyM: getMaxAccuracyM(),
      minMovementM: getMinMovementM(),
      maxSafeSpeedKmh: getMaxSafeSpeedKmh(),
    },
  };
}

// --- Wake Lock (2026-08-11, secção 4.2) ------------------------------------
//
// Com o ecra bloqueado ou a app em segundo plano, o browser suspende as
// leituras de geolocalizacao - distancia real percorrida nesse periodo
// desaparece por completo, sem aviso nenhum. E a diferenca estrutural mais
// relevante entre este tracker (browser) e uma app nativa de relogio.
// A Screen Wake Lock API mantem o ecra ligado enquanto o treino decorre.
// Nao existe em todos os browsers (Safari/iOS so a partir de 16.4) e pode
// ser recusada pelo sistema (bateria fraca) - por isso e sempre
// best-effort, nunca bloqueia o treino se falhar.
let wakeLockSentinel = null;

async function requestWakeLock() {
  if (!("wakeLock" in navigator)) return;
  if (gpsDiag) gpsDiag.wakeLockPedidos += 1;
  try {
    wakeLockSentinel = await navigator.wakeLock.request("screen");
    if (gpsDiag) {
      gpsDiag.wakeLockAtivo = true;
      gpsDiag.wakeLockObtidos += 1;
    }
    // O proprio sistema liberta o lock sempre que a pagina fica escondida;
    // este handler so limpa a referencia, quem o volta a pedir e o
    // listener de visibilitychange abaixo.
    wakeLockSentinel.addEventListener("release", () => {
      wakeLockSentinel = null;
    });
  } catch (e) {
    if (gpsDiag) gpsDiag.wakeLockErro = e && e.name ? e.name : String(e);
    console.warn("Wake Lock recusado, o ecra pode desligar-se durante o treino.", e);
  }
}

async function releaseWakeLock() {
  if (!wakeLockSentinel) return;
  try {
    await wakeLockSentinel.release();
  } catch (e) {
    // ja libertado pelo sistema, nada a fazer
  }
  wakeLockSentinel = null;
}

// Reclama o lock ao voltar ao primeiro plano - sem isto, bloquear o ecra
// uma vez desligava a protecao para o resto do treino.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && watchId !== null) {
    requestWakeLock();
  }
});

// Soma vitalicia (nao so desta sessao) de distancia descartada por exceder
// MAX_SPEED_KMH - nunca conta para XP/leaderboard, so para o jogador ver
// quanto ficou de fora. Sincronizada com o Supabase como o resto do
// progresso (ver js/progress-sync.js).
function getDiscardedSpeedDistanceM() {
  return Number(localStorage.getItem(STORAGE_KEY_DISCARDED_SPEED_M)) || 0;
}

function addToDiscardedSpeedDistance(deltaM) {
  if (deltaM <= 0) return;
  localStorage.setItem(STORAGE_KEY_DISCARDED_SPEED_M, String(getDiscardedSpeedDistanceM() + deltaM));
  queueProgressSync();
}

// Aviso persistente enquanto a velocidade exceder o teto de seguranca UNICO
// (2026-08-10, ja nao ha "modo escolhido" para violar - a deteccao e
// automatica, ver secção 17.1) - so desaparece quando uma leitura seguinte
// volta a ficar dentro do teto (nao e um toast com temporizador).
function showSpeedWarning() {
  speedWarningEl.classList.remove("hidden");
}

function hideSpeedWarning() {
  speedWarningEl.classList.add("hidden");
}

const caloriesEl = document.getElementById("training-calories");
const liveStatsEl = document.getElementById("training-live-stats");
const detectedActivityEl = document.getElementById("training-detected-activity");
const gpsDiagEl = document.getElementById("training-gps-diag");

// Relogio + velocidade nominal/media ao vivo, por baixo da distancia
// percorrida (2026-08-06, a pedido - antes so existiam no fim da sessao,
// guardados em training_sessions, nunca mostrados durante o proprio
// treino). Nominal = velocidade do ultimo segmento aceite (instantanea);
// media = da sessao inteira ate agora (2026-08-10, as duas passaram a
// aparecer lado a lado, antes so havia a media). Duracao em "MM:SS" (ou
// "H:MM:SS" acima de 1h, formatDurationClock em js/experience.js).
function updateLiveStatsDisplay() {
  const elapsedSeconds = activeElapsedSeconds();
  const avgSpeedMps = elapsedSeconds > 0 ? totalDistanceM / elapsedSeconds : 0;
  liveStatsEl.textContent =
    `${formatDurationClock(elapsedSeconds)} · nominal ${formatSpeedKmh(currentNominalSpeedMps)} · média ${formatSpeedKmh(avgSpeedMps)}`;
  detectedActivityEl.textContent = `Atividade detetada: ${ACTIVITY_LABEL_PT[currentActiveMode] || "—"}`;

  // Os mesmos campos que o resumo do fim (secção 4.7) - o que se ve durante
  // o treino tem de ser o que se ve no fim, senao os numeros parecem mudar
  // sozinhos ao terminar.
  const pausedSeconds = currentPausedMs() / 1000;
  const set = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };
  set("live-active-time", formatDurationClock(elapsedSeconds));
  set("live-paused-time", formatDurationClock(pausedSeconds));
  set("live-total-time", formatDurationClock(elapsedSeconds + pausedSeconds));
  set("live-speed", elapsedSeconds > 0 ? formatSpeedKmh(totalDistanceM / elapsedSeconds) : "0.0 km/h");
  // A MESMA formula do fim (computeSessionCaloriesFromTotals), nao a soma ao
  // vivo por segmento: as duas dao valores diferentes (a soma por segmento e
  // capada, secção 4.4) e o numero saltava ao terminar o treino.
  const reparticaoAoVivo = reparticaoDaSessao();
  const activeKcal = computeSessionCaloriesFromTotals(
    totalDistanceM,
    elapsedSeconds,
    getDominantMode(),
    sessionMovingSeconds,
    reparticaoAoVivo.distancia,
    reparticaoAoVivo.tempo
  );
  const restingKcal = currentRestingKcal();
  set("live-active-kcal", `${Math.round(activeKcal)} kcal`);
  set("live-total-kcal", `${Math.round(activeKcal + restingKcal)} kcal`);
  updateDistanceDisplay(activeKcal + restingKcal);

  updateGpsDiagDisplay();
}

// Diagnostico ao vivo (secção 4.2) - so para admin (mesmo criterio do card
// de Debug, js/auth.js applyAdminGate), para um jogador normal nunca ver
// contadores tecnicos. Serve para poder olhar para o telemovel a MEIO de
// uma caminhada e perceber logo se ha leituras a ser rejeitadas ou gaps
// grandes, sem esperar pelo fim da sessao.
function updateGpsDiagDisplay() {
  if (!gpsDiagEl) return;
  const isAdmin = typeof currentProfile !== "undefined" && currentProfile && currentProfile.is_admin;
  if (!isAdmin || !gpsDiag) {
    gpsDiagEl.classList.add("hidden");
    return;
  }
  gpsDiagEl.classList.remove("hidden");
  const wake = !("wakeLock" in navigator) ? "n/d" : wakeLockSentinel ? "on" : "off";
  gpsDiagEl.textContent =
    `GPS ${gpsDiag.leituras} · ok ${gpsDiag.creditadas} · <mín ${gpsDiag.abaixoMovimentoMin}` +
    ` · precisão ${gpsDiag.rejeitadasPrecisao} · veloc. ${gpsDiag.rejeitadasVelocidade}` +
    ` · parado ${gpsDiag.paradoIgnorado} · gap máx ${(gpsDiag.maxGapMs / 1000).toFixed(0)}s · ecrã ${wake}`;
}

let liveStatsIntervalId = null;

function startLiveStatsTicker() {
  updateLiveStatsDisplay();
  if (liveStatsIntervalId === null) liveStatsIntervalId = setInterval(updateLiveStatsDisplay, 1000);
}

function stopLiveStatsTicker() {
  if (liveStatsIntervalId !== null) {
    clearInterval(liveStatsIntervalId);
    liveStatsIntervalId = null;
  }
}

// Calorias em repouso acumuladas nas pausas ate agora (1 MET) - a parcela
// que separa as "ativas" das "totais" (secção 4.7).
function currentRestingKcal() {
  return 1.0 * getPesoKg() * (currentPausedMs() / 3600000);
}

// activeKcal e opcional: quando quem chama ja o calculou, reaproveita-se em
// vez de o recalcular (updateLiveStatsDisplay corre a cada segundo).
function updateDistanceDisplay(activeKcal) {
  distanceEl.textContent = formatDistanceKm(totalDistanceM);
  // XP = gasto total (secção 4.7). Quem chama ja o traz somado.
  const kcal = activeKcal !== undefined
    ? activeKcal
    : computeSessionCaloriesFromTotals(
        totalDistanceM,
        activeElapsedSeconds(),
        getDominantMode(),
        sessionMovingSeconds,
        reparticaoDaSessao().distancia,
        reparticaoDaSessao().tempo
      ) + currentRestingKcal();
  // O tile ja tem o rotulo "XP" - o valor e so o numero. O jogador nao
  // precisa de saber que XP sao calorias por baixo (v6).
  caloriesEl.textContent = Math.round(kcal).toLocaleString("pt-BR");
}

// Treino acumulado: copia persistida em localStorage, salva a cada 10s
// para sobreviver a um refresh acidental durante o treino
function persistAccumulatedTraining() {
  localStorage.setItem(STORAGE_KEYS.distanciaAcumuladaM, String(totalDistanceM));
  if (lastPosition) {
    localStorage.setItem(STORAGE_KEYS.ultimaPosicao, JSON.stringify(lastPosition));
  }
  localStorage.setItem(STORAGE_KEYS.caloriasAcumuladasKcal, String(sessionCaloriesKcal));
  localStorage.setItem(STORAGE_KEYS.modoTempoAcumuladoMs, JSON.stringify(modeTimeAccumMs));
  localStorage.setItem(STORAGE_KEYS.modoDistanciaAcumuladaM, JSON.stringify(modeDistanceAccumM));
  localStorage.setItem(STORAGE_KEYS.tempoMovimentoS, String(sessionMovingSeconds));
  localStorage.setItem(STORAGE_KEYS.pausaAutoMs, String(autoPausedMs));
  if (currentActiveMode) {
    localStorage.setItem(STORAGE_KEYS.atividadeAtiva, currentActiveMode);
  }
}

function clearPersistedTraining() {
  localStorage.removeItem(STORAGE_KEYS.active);
  localStorage.removeItem(STORAGE_KEYS.distanciaAcumuladaM);
  localStorage.removeItem(STORAGE_KEYS.ultimaPosicao);
  localStorage.removeItem(STORAGE_KEYS.inicioSessao);
  localStorage.removeItem(STORAGE_KEYS.caloriasAcumuladasKcal);
  localStorage.removeItem(STORAGE_KEYS.modoTempoAcumuladoMs);
  localStorage.removeItem(STORAGE_KEYS.atividadeAtiva);
}

// --- Historico de sessoes individuais (aba de Perfil) ---------------------
//
// Ao contrario do progresso agregado (que e sempre um snapshot completo,
// seguro para reenviar), cada sessao e um evento discreto - se a rede
// falhar mesmo quando o treino termina (comum, GPS ao ar livre), o registo
// nao pode desaparecer. Fica numa fila local ate ser confirmado no Supabase.

function getQueuedTrainingSessions() {
  const raw = localStorage.getItem(STORAGE_KEY_SESSION_QUEUE);
  try {
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function saveQueuedTrainingSessions(queue) {
  localStorage.setItem(STORAGE_KEY_SESSION_QUEUE, JSON.stringify(queue));
}

// Chamado no fim de stopTraining(), sempre (mesmo com distancia 0, para
// nao criar um caso especial diferente do resto do jogo). Tenta enviar de
// imediato; se falhar, o registo fica em seguranca na fila local.
function enqueueTrainingSession(record) {
  const queue = getQueuedTrainingSessions();
  queue.push(record);
  saveQueuedTrainingSessions(queue);
  flushTrainingSessionQueue();
}

// So true depois do login/arranque terminar (mesmas globais expostas por
// js/auth.js que guardam queueProgressSync) - evita tentar enviar antes de
// haver sessao autenticada.
async function flushTrainingSessionQueue() {
  if (!currentUserId || !readyForSync) return;

  const queue = getQueuedTrainingSessions();
  if (queue.length === 0) return;

  const rows = queue.map((record) => ({ user_id: currentUserId, ...record }));
  const { error } = await supabaseClient
    .from("training_sessions")
    .upsert(rows, { onConflict: "user_id,client_id", ignoreDuplicates: true });

  if (error) {
    console.warn("Falha ao enviar sessoes de treino pendentes, tenta de novo mais tarde.", error);
    return;
  }

  saveQueuedTrainingSessions([]);
  if (typeof onTrainingSessionsSynced === "function") onTrainingSessionsSynced();
}

window.addEventListener("online", () => {
  flushTrainingSessionQueue();
});

// Leituras seguidas acima do limite de velocidade antes de uma serem
// tratadas como violacao real (aviso + soma ao descartado) - um pico
// isolado de ruido de GPS e ignorado em silencio (nem conta, nem descarta).
const SPEED_VIOLATION_GRACE_READINGS = 2;
let consecutiveSpeedViolations = 0;

function onPositionUpdate(position) {
  const { latitude, longitude, accuracy } = position.coords;
  const timestamp = position.timestamp;

  // Diagnostico (secção 4.2) - conta TODAS as leituras entregues pelo
  // browser, incluindo as rejeitadas mais abaixo. O gap e medido aqui, no
  // topo, para apanhar tambem periodos em que so chegaram leituras
  // imprecisas (senao um periodo inteiro rejeitado por precisao passava
  // despercebido).
  gpsDiag.leituras += 1;
  gpsDiag.somaPrecisaoM += accuracy != null ? accuracy : 0;
  if (lastReadingTimestamp !== null) {
    const gapMs = timestamp - lastReadingTimestamp;
    if (gapMs > gpsDiag.maxGapMs) gpsDiag.maxGapMs = gapMs;
    if (gapMs > LONG_GAP_MS) {
      gpsDiag.msSemLeituras += gapMs;
      gpsDiag.gapsLongos += 1;
    }
    // Se ate agora a app tinha classificado "parado", este intervalo foi
    // tempo parado - vai para o tempo em pausa, nao para o tempo ativo.
    // Feito por incrementos e nao por transicoes de estado: assim uma falha
    // de sinal a meio de uma paragem tambem conta, e nao ha estado aberto
    // para fechar em cada saida possivel da funcao.
    if (currentActiveMode === ACTIVITY_STOPPED) autoPausedMs += gapMs;
  }
  lastReadingTimestamp = timestamp;

  // Ponto "onde estas" no mapa de territorio (secção 18.1). Antes de
  // qualquer filtro: e so a posicao no ecra, nao conta distancia nenhuma.
  if (typeof setMapPlayerPosition === "function") {
    setMapPlayerPosition(latitude, longitude, position.coords.heading);
  }
  // Minas (secção 21): aviso a 500 m e recolha ao entrar no hexagono delas.
  if (typeof verificarMinas === "function") verificarMinas(latitude, longitude);

  // Em pausa (secção 4.7) a leitura so serve para reancorar: nao credita
  // distancia, nao classifica atividade, nao conta calorias.
  if (isTrainingPaused()) {
    lastPosition = { latitude, longitude, timestamp };
    lastCountedPosition = { latitude, longitude, timestamp };
    return;
  }

  if (accuracy != null && accuracy > getMaxAccuracyM()) {
    gpsDiag.rejeitadasPrecisao += 1;
    return; // leitura pouco confiavel, ignora
  }

  if (lastPosition) {
    const segmentM = haversineDistance(
      lastPosition.latitude,
      lastPosition.longitude,
      latitude,
      longitude
    );

    const deltaSeconds = (timestamp - lastPosition.timestamp) / 1000;
    const speedMps = deltaSeconds > 0 ? segmentM / deltaSeconds : Infinity;
    const speedKmh = speedMps * 3.6;

    // Teto de seguranca UNICO (2026-08-10; baixado para ~16 km/h em
    // 2026-09-10 com a remocao da bicicleta). Acima dele a distancia e
    // DESCARTADA - deixou de haver atividade a pe que sustente isto, e a
    // bicicleta/veiculo nao contam. Nao decide esforco dentro do teto (isso
    // e a formula MET, mais abaixo).
    if (speedKmh > getMaxSafeSpeedKmh()) {
      // A ancora avanca SEMPRE a partir daqui (linha lastPosition = ... no
      // fim da funcao, ja fora deste bloco) - mesmo numa rejeicao. Antes
      // ficava presa na ultima posicao valida numa rejeicao, o que podia
      // criar uma "bola de neve" (secção 4 da documentação) - com a ancora
      // a avancar sempre, cada leitura e comparada com a mais recente.
      consecutiveSpeedViolations += 1;
      gpsDiag.rejeitadasVelocidade += 1;
      if (consecutiveSpeedViolations >= SPEED_VIOLATION_GRACE_READINGS) {
        addToDiscardedSpeedDistance(segmentM);
        showSpeedWarning();
      }
      lastPosition = { latitude, longitude, timestamp };
      return;
    }

    consecutiveSpeedViolations = 0;
    hideSpeedWarning();

    // A deteccao de atividade corre SEMPRE, mesmo com deslocamento abaixo
    // de MIN_MOVEMENT_M (2026-08-10, bug reportado: "o treino nao entra em
    // pausa apos um periodo de inatividade") - e a UNICA forma de a
    // atividade detetada conseguir chegar a "parado": um segmento pequeno
    // demais para contar como deslocamento real (deriva de GPS parado)
    // continua a representar uma velocidade quase nula, que a janela
    // deslizante precisa de ver para o jogador deixar de ficar "preso" na
    // ultima atividade detetada antes de parar, por mais tempo que fique
    // parado. MIN_MOVEMENT_M continua a decidir se o segmento CONTA para
    // distancia/calorias (abaixo), so deixou de bloquear a classificacao.
    pushSpeedSample(speedMps, timestamp);
    updateDetectedActivity(timestamp);
    currentNominalSpeedMps = speedMps;

    // Distribuicao de velocidades (secção 4.3) - so recolha, nao decide nada.
    gpsDiag.velocidadeHist[bucketIndex(speedKmh, SPEED_BUCKETS)] += 1;
    if (speedKmh > gpsDiag.velocidadeMaxKmh) gpsDiag.velocidadeMaxKmh = speedKmh;

    // Distancia/calorias medidas a partir de lastCountedPosition, NAO de
    // lastPosition (2026-08-11) - pode ser uma leitura mais antiga que a
    // usada acima para velocidade/deteccao, para segmentos pequenos
    // consecutivos se poderem somar ate ultrapassar MIN_MOVEMENT_M. Velocidade
    // e duracao usadas na formula MET sao as deste segmento acumulado (nao a
    // instantanea entre as duas ultimas leituras), para bater certo com a
    // distancia/tempo creditados.
    //
    // Bug corrigido (2026-08-11, reportado com o histórico real: "Caminhar
    // - 0.33km - 33min - 58kcal", calorias muito acima do esperado para a
    // distância): se o jogador ficasse "parado" (ou quase) durante varios
    // minutos SEM lastCountedPosition avancar (so avancava ao creditar um
    // segmento), esse tempo todo ficava "pendurado" à espera - assim que um
    // movimento real finalmente ultrapassava MIN_MOVEMENT_M, TODO o gap
    // (incluindo os minutos parados) era creditado como duracao desse UNICO
    // segmento, inflacionando calorias/tempo por modo muito acima do real
    // (podia tambem inflacionar a propria DISTANCIA, por deriva de GPS
    // acumulada num ponto-ancora cada vez mais antigo - mesma "bola de
    // neve" ja corrigida para lastPosition na secção 4, mas ainda possivel
    // aqui). Duas correcoes:
    if (currentActiveMode === ACTIVITY_STOPPED) {
      // "Parado" nunca creditou distancia/calorias - agora tambem avanca a
      // ancora (antes so a deteccao de atividade fazia isto, via
      // lastPosition acima) para o tempo parado nunca "vazar" para dentro
      // de um credito futuro.
      gpsDiag.paradoIgnorado += 1;
      lastCountedPosition = { latitude, longitude, timestamp };
    } else {
      const distanceSegmentM = haversineDistance(
        lastCountedPosition.latitude,
        lastCountedPosition.longitude,
        latitude,
        longitude
      );

      if (distanceSegmentM >= getMinMovementM()) {
        // Capada a getActivityWindowSeconds() (defensivo): cobre tambem o
        // caso de nunca chegar a classificar como "parado" (ex: a
        // arrastar-se devagar sem nunca cruzar o limiar de "parado"), onde
        // a correcao acima nao chegaria. So limita o DIVISOR usado para
        // calorias/tempo por modo - a distancia creditada nunca e afetada,
        // conta sempre por inteiro.
        const rawDurationSeconds = (timestamp - lastCountedPosition.timestamp) / 1000;
        const creditedDurationSeconds = Math.min(getActivityWindowSeconds(), rawDurationSeconds);
        const creditedSpeedKmh = creditedDurationSeconds > 0 ? (distanceSegmentM / creditedDurationSeconds) * 3.6 : speedKmh;
        totalDistanceM += distanceSegmentM;
        sessionCaloriesKcal += computeSegmentCalories(currentActiveMode, creditedSpeedKmh, creditedDurationSeconds);
        modeTimeAccumMs[currentActiveMode] = (modeTimeAccumMs[currentActiveMode] || 0) + creditedDurationSeconds * 1000;
        // Distancia POR MODO (secção 4.9): a sessao pode passar por mais que
        // uma atividade e ate aqui so se guardava o total e o modo dominante,
        // o que escondia metade do que aconteceu.
        modeDistanceAccumM[currentActiveMode] = (modeDistanceAccumM[currentActiveMode] || 0) + distanceSegmentM;
        // Tempo em movimento (secção 4.6): usa o intervalo REAL, sem o teto
        // de getActivityWindowSeconds(). O teto existe para nao inflacionar
        // calorias por segmento; aqui e o contrario - se o GPS falhou 5
        // minutos a meio de uma descida, esses 5 minutos foram de facto a
        // pedalar e tem de contar, senao a velocidade de movimento sai
        // absurdamente alta e a faixa de MET dispara.
        sessionMovingSeconds += rawDurationSeconds;
        gpsDiag.creditadas += 1;
        updateDistanceDisplay();
        // Guarda-se o hexagono para, no FIM da sessao, contar uma visita -
        // uma por sessao e nao uma por leitura, senao andava-se para tras e
        // para a frente numa fronteira e enchia-se o multiplicador numa tarde.
        registarHexDaSessao(latitude, longitude);
        // Descoberta de territorio (secção 18) - so em segmentos que de
        // facto contaram como deslocamento, para deriva de GPS parado nao
        // "descobrir" hexagonos vizinhos sem lá se ter ido.
        recordDiscoveredHexForTraining(latitude, longitude);
        lastCountedPosition = { latitude, longitude, timestamp };
      } else {
        gpsDiag.abaixoMovimentoMin += 1;
      }
    }
  }

  lastPosition = { latitude, longitude, timestamp };
  if (!lastCountedPosition) lastCountedPosition = { latitude, longitude, timestamp };
}

// Guarda o hexagono atual no conjunto da sessao (secção 21), para a visita
// ser contada uma vez so no fim. Silencioso sem h3 carregado, como o resto.
function registarHexDaSessao(latitude, longitude) {
  if (typeof h3 === "undefined" || typeof getHexResolution !== "function") return;
  try {
    sessionHexIds.add(h3.latLngToCell(latitude, longitude, getHexResolution()));
  } catch (e) {
    // coordenada invalida - nao vale partir o treino por causa disto
  }
}

// Descoberta de hexagonos durante o treino (secção 18). Envolve
// recordPositionHex (js/hexes.js) so para dar o feedback ao jogador - o
// toast e a atualizacao do contador vivem aqui, a mecanica em si vive la.
function recordDiscoveredHexForTraining(latitude, longitude) {
  if (typeof recordPositionHex !== "function") return;
  const { isNew } = recordPositionHex(latitude, longitude);
  if (!isNew) return;
  showGameToast("Nova zona descoberta!", "medalha");
  renderHexCount();
}

function onPositionError(error) {
  distanceEl.textContent = "GPS indisponível";
  console.error("Erro de geolocalizacao:", error.message);

  // Contabilizado a partir de 2026-08-14: estes erros nunca passam por
  // onPositionUpdate, por isso um periodo inteiro em que o GPS falhou a
  // fixar aparecia no diagnostico so como "silencio", indistinguivel do
  // telemovel bloqueado. Codigos da Geolocation API: 1 PERMISSION_DENIED,
  // 2 POSITION_UNAVAILABLE, 3 TIMEOUT.
  if (!gpsDiag) return;
  if (error.code === 1) gpsDiag.errosPermissao += 1;
  else if (error.code === 2) gpsDiag.errosPosicaoIndisp += 1;
  else if (error.code === 3) gpsDiag.errosTimeout += 1;
}

function beginWatch() {
  watchId = navigator.geolocation.watchPosition(onPositionUpdate, onPositionError, {
    enableHighAccuracy: true,
    maximumAge: 5000,
    timeout: 15000,
  });

  // A barra/progresso de nivel usa as CALORIAS da sessao em curso
  // (2026-08-10, secção 5/17.1 - era distancia efetiva ate aqui), para
  // refletir ao vivo exatamente o que vai ser creditado no fim da sessao.
  updateXPDisplay(sessionCaloriesKcal);
  saveIntervalId = setInterval(() => {
    persistAccumulatedTraining();
    updateXPDisplay(sessionCaloriesKcal);
    refreshTabLock(STORAGE_KEY_TRAINING_TAB_LOCK);
  }, SAVE_INTERVAL_MS);
  startLiveStatsTicker();
  // Baixa o ritmo de desenho da cena 3D enquanto o treino dura (js/main.js):
  // e uma hora de ecra ligado em que ninguem esta a olhar para o heroi.
  if (typeof setTrainingLowPowerRendering === "function") setTrainingLowPowerRendering(true);
  requestWakeLock();
}

function showTrainingScreen() {
  startScreen.classList.add("hidden");
  trainingScreen.classList.remove("hidden");
  hideSpeedWarning();
}

function showStartScreen() {
  trainingScreen.classList.add("hidden");
  startScreen.classList.remove("hidden");
  hideSpeedWarning();
  renderTodaysTrainings();
}

// Popup de contagem decrescente (5s) mostrado entre carregar em "Iniciar
// Treino" e o GPS realmente comecar a contar - da tempo ao jogador para se
// preparar/comecar a mexer-se.
const trainingCountdownModalEl = document.getElementById("training-countdown-modal");
const trainingCountdownNumberEl = document.getElementById("training-countdown-number");
const trainingCountdownMessageEl = document.getElementById("training-countdown-message");
const TRAINING_COUNTDOWN_SECONDS = 5;
let trainingCountdownIntervalId = null;

function showTrainingCountdown() {
  let secondsLeft = TRAINING_COUNTDOWN_SECONDS;
  trainingCountdownMessageEl.textContent =
    "A atividade (Caminhar ou Correr) é detetada automaticamente pelo teu ritmo ao longo do treino.";
  trainingCountdownNumberEl.textContent = String(secondsLeft);
  trainingCountdownModalEl.classList.remove("hidden");

  trainingCountdownIntervalId = setInterval(() => {
    secondsLeft -= 1;
    if (secondsLeft <= 0) {
      clearInterval(trainingCountdownIntervalId);
      trainingCountdownIntervalId = null;
      trainingCountdownModalEl.classList.add("hidden");
      beginTrainingSession();
      return;
    }
    trainingCountdownNumberEl.textContent = String(secondsLeft);
  }, 1000);
}

function startTraining() {
  // O aviso sonoro das minas (secção 21) tem de ser desbloqueado a partir de
  // um gesto: no iOS um AudioContext criado fora de um toque fica suspenso e
  // nunca toca. Este botao e esse gesto.
  if (typeof unlockMineAudio === "function") unlockMineAudio();


  if (!("geolocation" in navigator)) {
    alert("Geolocalização não suportada neste navegador.");
    return;
  }

  // Impede duas abas do mesmo telemovel/navegador terem um treino ativo em
  // simultaneo - cada uma contaria a mesma distancia GPS em separado e
  // somava-a em dobro ao progresso partilhado. Reclamado ja aqui (antes da
  // contagem decrescente), nao so no fim dela, para bloquear logo uma
  // segunda aba que tente comecar durante esses 5s.
  if (!claimTabLock(STORAGE_KEY_TRAINING_TAB_LOCK)) {
    alert("Já tens um treino ativo noutro separador ou janela. Fecha-o antes de começar um novo aqui.");
    return;
  }

  showTrainingCountdown();
}

// So corre depois da contagem decrescente terminar (showTrainingCountdown).
function beginTrainingSession() {
  totalDistanceM = 0;
  lastPosition = null;
  lastCountedPosition = null;
  sessionStartTime = Date.now();
  sessionCaloriesKcal = 0;
  sessionMovingSeconds = 0;
  sessionHexIds = new Set();
  modeDistanceAccumM = {};
  pausedTotalMs = 0;
  autoPausedMs = 0;
  pauseStartedMs = null;
  localStorage.removeItem(STORAGE_KEYS.pausaAutoMs);
  localStorage.removeItem(STORAGE_KEYS.pausaTotalMs);
  localStorage.removeItem(STORAGE_KEYS.pausaInicioMs);
  currentNominalSpeedMps = 0;
  speedSampleBuffer = [];
  currentActiveMode = null;
  pendingMode = null;
  pendingModeSinceMs = null;
  modeTimeAccumMs = { caminhar: 0, correr: 0 };
  resetGpsDiag();
  updateDistanceDisplay();
  showTrainingScreen();

  localStorage.setItem(STORAGE_KEYS.active, "true");
  localStorage.setItem(STORAGE_KEYS.inicioSessao, String(sessionStartTime));
  persistAccumulatedTraining();

  beginWatch();
}

// Treino descartado por completo se nao tiver distancia real nenhuma OU
// durar menos que isto (2026-08-06, a pedido) - nao gera registo em
// training_sessions nem conta para XP/pontos/conquistas. Cobre paragens
// acidentais ("Iniciar" logo seguido de "Parar") e ruido puro de GPS sem
// deslocamento nenhum.
const MIN_TRAINING_DURATION_SECONDS = 10;

// --- Pausa do treino (2026-08-15, secção 4.7) -------------------------------
//
// O tempo em pausa NAO conta para a duracao da sessao. Isto nao e cosmetica:
// a duracao entra diretamente nas calorias (secção 4.4) e, na bicicleta,
// escolhe a faixa de MET (secção 4.6) - meia hora de cafe a contar como
// treino diluia a velocidade media e baixava a faixa, exatamente o erro que
// se acabou de corrigir.
//
// O GPS continua ligado durante a pausa, mas as leituras so servem para
// reancorar a posicao. Assim, quem pausa, anda 500 m e retoma nao ganha
// esses 500 m - e ao retomar nao ha um salto em linha reta a ser creditado.
let pauseStartedMs = null;
let pausedTotalMs = 0;
// Tempo que a app DETETOU como parado (pausa automatica, secção 4.1). Conta
// para "tempo em pausa" tal como a pausa carregada a mao: parado e parado,
// quer tenha sido o jogador a dizer, quer tenha sido a app a perceber.
let autoPausedMs = 0;
let pauseTickerId = null;

function isTrainingPaused() {
  return pauseStartedMs !== null;
}

// Duracao real do treino: relogio de parede menos o tempo em pausa (incluindo
// a pausa a decorrer, se estiver uma aberta).
function currentPausedMs() {
  return pausedTotalMs + autoPausedMs + (pauseStartedMs !== null ? Date.now() - pauseStartedMs : 0);
}

function activeElapsedSeconds() {
  if (!sessionStartTime) return 0;
  return Math.max(0, (Date.now() - sessionStartTime - currentPausedMs()) / 1000);
}

function updatePauseDisplay() {
  if (!pauseElapsedEl || pauseStartedMs === null) return;
  pauseElapsedEl.textContent = formatDurationClock((Date.now() - pauseStartedMs) / 1000);
}

function pauseTraining() {
  if (watchId === null || isTrainingPaused()) return;
  pauseStartedMs = Date.now();
  localStorage.setItem(STORAGE_KEYS.pausaInicioMs, String(pauseStartedMs));

  pauseModal.classList.remove("hidden");
  updatePauseDisplay();
  pauseTickerId = setInterval(updatePauseDisplay, 1000);
}

function resumeTraining() {
  if (!isTrainingPaused()) return;
  pausedTotalMs += Date.now() - pauseStartedMs;
  pauseStartedMs = null;
  localStorage.setItem(STORAGE_KEYS.pausaTotalMs, String(pausedTotalMs));
  localStorage.removeItem(STORAGE_KEYS.pausaInicioMs);

  if (pauseTickerId !== null) {
    clearInterval(pauseTickerId);
    pauseTickerId = null;
  }
  pauseModal.classList.add("hidden");

  // Reancorar: a posicao onde se retoma passa a ser o novo ponto de partida,
  // para o que se andou em pausa nunca ser creditado.
  lastPosition = null;
  lastCountedPosition = null;
  updateLiveStatsDisplay();
}

// "Terminar" dentro da pausa: fecha a pausa (para o tempo dela nao entrar na
// sessao) e acaba o treino pelo caminho normal.
function finishFromPause() {
  if (isTrainingPaused()) {
    pausedTotalMs += Date.now() - pauseStartedMs;
    pauseStartedMs = null;
    if (pauseTickerId !== null) {
      clearInterval(pauseTickerId);
      pauseTickerId = null;
    }
  }
  pauseModal.classList.add("hidden");
  stopTraining();
}

// Resumo no fim do treino (secção 4.7). Separa sempre ATIVO de TOTAL: o
// jogador tem de conseguir ver de onde vem a diferenca, senao "porque e que
// o treino diz 40 minutos se eu estive uma hora na rua" volta a ser pergunta.
function showTrainingSummary({ mode, distanceM, activeSeconds, pausedSeconds, activeKcal, totalKcal, xp }) {
  const set = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };
  const activeHours = activeSeconds / 3600;
  const avgSpeedKmh = activeHours > 0 ? distanceM / 1000 / activeHours : 0;

  set("summary-mode", MODE_LABEL_PT[mode] || "—");
  set("summary-active-time", formatDurationClock(activeSeconds));
  set("summary-paused-time", formatDurationClock(pausedSeconds));
  set("summary-total-time", formatDurationClock(activeSeconds + pausedSeconds));
  set("summary-distance", `${(distanceM / 1000).toFixed(2)} km`);
  set("summary-speed", `${avgSpeedKmh.toFixed(1)} km/h`);
  set("summary-active-kcal", `${Math.round(activeKcal)} kcal`);
  set("summary-total-kcal", `${Math.round(totalKcal)} kcal`);
  set("summary-xp", formatXP(xp));

  summaryModal.classList.remove("hidden");
}

function stopTraining() {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
  if (saveIntervalId !== null) {
    clearInterval(saveIntervalId);
    saveIntervalId = null;
  }
  stopLiveStatsTicker();
  releaseWakeLock();

  // Uma visita por hexagono e por sessao (secção 21). Feito aqui, no fim, e
  // nao a cada leitura.
  if (typeof registarVisitasDaSessao === "function") registarVisitasDaSessao(sessionHexIds);
  if (typeof renderResourcesPanel === "function") renderResourcesPanel();
  if (typeof setTrainingLowPowerRendering === "function") setTrainingLowPowerRendering(false);

  const sessionDistanceM = totalDistanceM;
  const sessionDominantMode = getDominantMode();
  const sessionEndTime = Date.now();
  // Duracao SEM o tempo em pausa (secção 4.7) - a pausa nao e treino, e
  // deixa-la entrar aqui diluiria a velocidade media e, na bicicleta, a
  // faixa de MET (secção 4.6).
  const sessionDurationSeconds = sessionStartTime
    ? Math.max(0, (sessionEndTime - sessionStartTime - pausedTotalMs - autoPausedMs) / 1000)
    : null;
  // Valor GRAVADO vem dos totais da sessao, nao da soma por segmento - ver
  // computeSessionCaloriesFromTotals. sessionCaloriesKcal (soma ao vivo)
  // continua a servir so para o mostrador durante o treino.
  const sessionMoving = sessionMovingSeconds;
  const reparticao = reparticaoDaSessao();
  const sessionDistanceByMode = reparticao.distancia;
  const sessionTimeByMode = reparticao.tempo;

  const sessionCalories = computeSessionCaloriesFromTotals(
    sessionDistanceM,
    sessionDurationSeconds,
    sessionDominantMode,
    sessionMoving,
    sessionDistanceByMode,
    sessionTimeByMode
  );

  // Calorias durante as pausas: 1 MET, o metabolismo em repouso.
  //
  // XP = GASTO TOTAL: o esforco do tempo ativo mais 1 MET (repouso) sobre
  // o tempo em pausa.
  //
  // Decidido depois de perceber que a separacao anterior nao era
  // esforco-contra-repouso, era so "que relogio estava a andar": a equacao
  // do ACSM tem um +3,5 que se traduz em 1 MET x horas, por isso as
  // calorias "ativas" JA incluiam o repouso do tempo ativo. Contar o
  // repouso de um lado e nao do outro era arbitrario.
  //
  // Para caminhar/correr o total colapsa em algo muito simples:
  //   peso x (0,476 x km + horas TOTAIS)
  // ou seja esforco pela distancia + 1 MET pelo tempo que o treino durou,
  // sem ser preciso decidir que relogio estava a contar. E tambem o que o
  // relogio do Bernardo chama "Total Kilocalories" - a unica referencia
  // externa que temos para validar.
  const sessionPausedSeconds = Math.round((pausedTotalMs + autoPausedMs) / 1000);
  const sessionRestingCalories = 1.0 * getPesoKg() * (sessionPausedSeconds / 3600);
  const sessionTotalCalories = sessionCalories + sessionRestingCalories;

  const discardReasons = [];
  if (sessionDistanceM <= 0) discardReasons.push("sem distância percorrida");
  if (sessionDurationSeconds == null || sessionDurationSeconds < MIN_TRAINING_DURATION_SECONDS) {
    discardReasons.push(`duração menor que ${MIN_TRAINING_DURATION_SECONDS}s`);
  }

  if (discardReasons.length > 0) {
    showGameToast(`Treino descartado (${discardReasons.join(" e ")})`, "aviso");
  } else {
    enqueueTrainingSession({
      client_id: crypto.randomUUID(),
      started_at: new Date(sessionStartTime).toISOString(),
      ended_at: new Date(sessionEndTime).toISOString(),
      distance_m: sessionDistanceM,
      // Modo DOMINANTE (mais tempo, secção 17.1) - ja nao e escolhido a
      // mao, a sessao pode ter passado por mais que uma atividade.
      mode: sessionDominantMode,
      // ...e a reparticao real, para o card poder mostrar o que de facto
      // aconteceu em vez de so o dominante (secção 4.9).
      distance_by_mode: sessionDistanceByMode,
      // Guardado para as calorias serem REPRODUZIVEIS a partir da base de
      // dados: sem a proporcao de tempo nao se conseguia refazer a conta.
      time_by_mode: sessionTimeByMode,
      duration_seconds: sessionDurationSeconds,
      // Tempo em movimento - ja nao entra nas calorias (era para a tabela por
      // faixas da bicicleta, removida em 2026-09-10); mantido como registo.
      moving_seconds: sessionMoving,
      // Tempo em pausa e calorias totais (secção 4.7) - calories_kcal
      // continua a ser so o ATIVO, que e o que conta para XP.
      paused_seconds: sessionPausedSeconds,
      // calories_kcal e o valor de XP, ou seja o TOTAL. O ativo fica a parte.
      // calories_kcal e o valor de XP, ou seja o TOTAL. A parte ativa fica
      // a parte, para se poder sempre ver de onde veio a diferenca.
      calories_kcal: sessionTotalCalories,
      calories_active_kcal: sessionCalories,
      // Diagnostico do sinal (secção 4.2) - null numa sessao sem leituras.
      gps_diag: buildGpsDiagRecord(),
    });

    // Calorias (2026-08-10, secção 5) sao o que conta para XP/pontos/
    // leaderboard/medalhas mensais. Distancia efetiva deixou de existir
    // (2026-08-10) - conquistas de distancia/ritmo/recorde por modo
    // (secção 10) passam a usar a distancia/velocidade REAL diretamente.
    addToLifetimeCalories(sessionTotalCalories);
    addToMonthlyCalories(sessionTotalCalories);
    addToLifetimeDistance(sessionDistanceM);
    addToMonthlyDistance(sessionDistanceM);
    incrementTotalTrainingsCompleted();
    checkAndUnlockAchievements(sessionDistanceM, sessionDurationSeconds, sessionDominantMode, sessionTotalCalories);
    // Missao mensal ativa (secção 22): este treino pode te-la concluido
    // (km corridos, hexagonos/minas/concelhos novos). A missao "correr X km"
    // so soma a fatia detetada como CORRER desta sessao, nao a caminhada.
    if (typeof verificarMissaoAtiva === "function") {
      verificarMissaoAtiva({ distanciaPorModo: sessionDistanceByMode });
    }
    renderMonsters(); // pode ter desbloqueado monstros novos

    showTrainingSummary({
      mode: sessionDominantMode,
      distanceM: sessionDistanceM,
      activeSeconds: sessionDurationSeconds,
      pausedSeconds: sessionPausedSeconds,
      activeKcal: sessionCalories,
      totalKcal: sessionTotalCalories,
      xp: sessionTotalCalories,
    });
  }

  totalDistanceM = 0;
  lastPosition = null;
  lastCountedPosition = null;
  sessionStartTime = null;
  updateXPDisplay(0);

  clearPersistedTraining();
  releaseTabLock(STORAGE_KEY_TRAINING_TAB_LOCK);
  showStartScreen();
}

// Retoma automaticamente um treino que estava a decorrer antes de um refresh
function resumeTrainingIfNeeded() {
  if (localStorage.getItem(STORAGE_KEYS.active) !== "true") return;
  if (!("geolocation" in navigator)) return;

  // Se outra aba viva ja estiver a tratar deste treino (ex: esta aba so
  // reabriu uma pagina antiga em segundo plano), nao arranca aqui tambem um
  // segundo GPS watch a contar a mesma coisa outra vez.
  if (!claimTabLock(STORAGE_KEY_TRAINING_TAB_LOCK)) return;

  totalDistanceM = Number(localStorage.getItem(STORAGE_KEYS.distanciaAcumuladaM)) || 0;
  const savedPosition = localStorage.getItem(STORAGE_KEYS.ultimaPosicao);
  lastPosition = savedPosition ? JSON.parse(savedPosition) : null;
  // lastCountedPosition arranca igual a lastPosition apos um refresh (nao e
  // persistida em separado) - pior caso, um segmento a mais precisa de se
  // acumular antes de voltar a contar, sem impacto real (refresh a meio de
  // um treino ja e um caso raro, ver nota abaixo sobre calorias/deteccao).
  lastCountedPosition = lastPosition;
  sessionStartTime = Number(localStorage.getItem(STORAGE_KEYS.inicioSessao)) || Date.now();

  // Calorias/modo dominante (2026-08-11, bug corrigido - "as calorias
  // desapareciam e voltavam a zero" a cada refresh a meio de um treino).
  sessionCaloriesKcal = Number(localStorage.getItem(STORAGE_KEYS.caloriasAcumuladasKcal)) || 0;
  sessionMovingSeconds = Number(localStorage.getItem(STORAGE_KEYS.tempoMovimentoS)) || 0;
  // Pausa (secção 4.7): se a pagina foi recarregada a meio de uma pausa, ela
  // continua aberta - senao o tempo parado passava a contar como treino.
  pausedTotalMs = Number(localStorage.getItem(STORAGE_KEYS.pausaTotalMs)) || 0;
  autoPausedMs = Number(localStorage.getItem(STORAGE_KEYS.pausaAutoMs)) || 0;
  const pausaGuardada = Number(localStorage.getItem(STORAGE_KEYS.pausaInicioMs)) || 0;
  try {
    const savedModeTime = localStorage.getItem(STORAGE_KEYS.modoTempoAcumuladoMs);
    if (savedModeTime) modeTimeAccumMs = JSON.parse(savedModeTime);
    const savedModeDist = localStorage.getItem(STORAGE_KEYS.modoDistanciaAcumuladaM);
    if (savedModeDist) modeDistanceAccumM = JSON.parse(savedModeDist);
  } catch (e) {
    // fica no valor por omissao (todos a 0) se o JSON guardado for invalido
  }
  // A deteccao em si (janela deslizante, historese - speedSampleBuffer/
  // pendingMode) nao e persistida, so o ULTIMO modo confirmado antes do
  // refresh - evita mostrar "Atividade detetada: —" e um "parado" errado
  // logo na primeira leitura a seguir a retomar, mas a janela recomeca a
  // encher-se do zero (poucos segundos, aceitavel).
  currentActiveMode = localStorage.getItem(STORAGE_KEYS.atividadeAtiva) || null;

  updateDistanceDisplay();
  showTrainingScreen();
  beginWatch();

  // Reabre a pausa que estava a decorrer, com o contador a continuar de onde
  // ia - nao a reiniciar do zero.
  if (pausaGuardada > 0) {
    pauseStartedMs = pausaGuardada;
    pauseModal.classList.remove("hidden");
    updatePauseDisplay();
    pauseTickerId = setInterval(updatePauseDisplay, 1000);
  }
}

// --- Treinos de hoje (2026-08-10, secção 17.2) -----------------------------
//
// Lista dos treinos ja concluidos no dia civil corrente, no ecrã inicial do
// painel de Treino - desaparece a meia-noite (nao e um cache, e sempre um
// pedido novo filtrado por "hoje" na hora local do dispositivo).
const trainingTodayListEl = document.getElementById("training-today-list");

// Cada treino de hoje e um CARD com a mesma cara do painel de treino
// (2026-08-15, a pedido): o tipo em cima onde o painel tem "Distancia
// percorrida", a distancia em grande, e a mesma grelha de tempos e calorias.
// A linha de velocidade e a de "atividade detetada" nao entram - num treino
// ja terminado nao ha nada "a detetar".
//
// Sessoes anteriores a 2026-08-15 nao tem paused_seconds nem
// calories_active_kcal (secção 4.7). Nesses casos mostra-se "—" em vez de um
// zero, que seria uma afirmacao falsa: nao e que nao houve pausa, e que nao
// se sabe.
function renderTrainingCard(s) {
  const desconhecido = "—";
  const activeSeconds = Number(s.duration_seconds) || 0;
  const pausedRaw = s.paused_seconds;
  const activeKcalRaw = s.calories_active_kcal;
  const temPausa = pausedRaw !== null && pausedRaw !== undefined;
  const temAtivas = activeKcalRaw !== null && activeKcalRaw !== undefined;
  const pausedSeconds = Number(pausedRaw) || 0;

  const linha = (rotulo, valor) => `<dt>${rotulo}</dt><dd>${valor}</dd>`;

  // Reparticao por modo (secção 4.9). So se mostra quando ha mais do que um
  // modo: numa sessao inteirinha a correr, repetir "Corrida: 5,19 km" por
  // baixo dos "5,19 km" seria ruido.
  const porModo = s.distance_by_mode && typeof s.distance_by_mode === "object" ? s.distance_by_mode : null;
  const modosComDistancia = porModo ? Object.keys(porModo).filter((m) => porModo[m] > 0) : [];
  const reparticao = modosComDistancia.length > 1
    ? '<dl class="training-modes">' + modosComDistancia
        .sort((a, b) => porModo[b] - porModo[a])
        .map((m) => `<dt>${MODE_LABEL_PT[m] || m}</dt><dd>${formatDistanceKm(porModo[m])}</dd>`)
        .join("") + "</dl>"
    : "";

  return `<li class="training-card">
      <p class="training-label">${MODE_LABEL_PT[s.mode] || "Treino"}</p>
      <p class="training-distance">${formatDistanceKm(Number(s.distance_m) || 0)}</p>
      ${reparticao}
      <dl class="summary-grid">
        ${linha("Tempo ativo", formatDurationClock(activeSeconds))}
        ${linha("Tempo em pausa", temPausa ? formatDurationClock(pausedSeconds) : desconhecido)}
        ${linha("Tempo total", temPausa ? formatDurationClock(activeSeconds + pausedSeconds) : desconhecido)}
        ${linha("Velocidade média", activeSeconds > 0 ? formatSpeedKmh((Number(s.distance_m) || 0) / activeSeconds) : desconhecido)}
        ${linha("Calorias ativas", temAtivas ? `${Math.round(Number(activeKcalRaw))} kcal` : desconhecido)}
        ${linha("Calorias totais", `${Math.round(Number(s.calories_kcal) || 0)} kcal`)}
      </dl>
      <p class="training-calories-row">XP: <span>${Math.round(Number(s.calories_kcal) || 0)} kcal</span></p>
      ${renderModeFixControl(s)}
    </li>`;
}

async function renderTodaysTrainings() {
  if (!trainingTodayListEl || !currentUserId) return;

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const { data, error } = await supabaseClient
    .from("training_sessions")
    .select("id, distance_m, duration_seconds, paused_seconds, mode, calories_kcal, calories_active_kcal, distance_by_mode")
    .eq("user_id", currentUserId)
    .gte("started_at", startOfToday.toISOString())
    .order("started_at", { ascending: false });

  if (error || !data) return;

  if (data.length === 0) {
    trainingTodayListEl.innerHTML = '<li class="training-today-empty">Ainda sem treinos hoje.</li>';
    return;
  }

  trainingTodayListEl.innerHTML = data.map(renderTrainingCard).join("");
  wireModeFixControls();
}

// ===========================================================================
// CORRECAO MANUAL DO MODO — TEMPORARIO (2026-08-14)
// ===========================================================================
// Bloco deliberadamente isolado: existe so enquanto a deteccao automatica de
// atividade nao for fiavel, e a intencao e REMOVE-LO por inteiro quando for
// (a pedido: "quando acharmos que a afinacao esta perfeita, retiramos o modo
// de ajuste manual"). Para o tirar: apagar esta seccao, a chamada a
// renderModeFixControl/wireModeFixControls em renderTodaysTrainings acima, e
// o CSS .training-mode-fix.
//
// Porque existe: a classificacao por velocidade pode enganar-se junto ao
// limiar caminhar/correr (ACTIVITY_WALK_MAX_KMH). Enquanto nao houver
// confianca total nela, isto garante que nenhum treino fica mal contado - e
// evita ter de corrigir a mao na base de dados, como aconteceu varias vezes.
// (Servia tambem para corrigir bicicleta -> a pe; a bicicleta foi removida
// em 2026-09-10.)
//
// Nao contraria a decisao original de nao escolher o modo ANTES do treino:
// isto corrige DEPOIS, so quando a app se enganou.
// Sem "bicicleta" desde 2026-09-10 - serve tambem para converter sessoes
// antigas de bicicleta em caminhar/correr.
const MODE_FIX_OPTIONS = ["caminhar", "correr"];

function renderModeFixControl(session) {
  const options = MODE_FIX_OPTIONS.map(
    (m) => `<option value="${m}"${m === session.mode ? " selected" : ""}>${MODE_LABEL_PT[m]}</option>`
  ).join("");
  return `<select class="training-mode-fix" data-session-id="${session.id}" aria-label="Corrigir tipo de treino">${options}</select>`;
}

function wireModeFixControls() {
  trainingTodayListEl.querySelectorAll(".training-mode-fix").forEach((select) => {
    select.addEventListener("change", () => {
      changeSessionMode(Number(select.dataset.sessionId), select.value);
    });
  });
}

// Recalcula as calorias com a MESMA regra dos totais usada no fim de um
// treino (secção 4.4) - mudar o modo e literalmente reavaliar essa formula.
async function changeSessionMode(sessionId, newMode) {
  const { data: session, error } = await supabaseClient
    .from("training_sessions")
    .select("distance_m, duration_seconds, moving_seconds, paused_seconds, mode, calories_kcal")
    .eq("id", sessionId)
    .single();

  if (error || !session || session.mode === newMode) return;

  const newActiveCalories = computeSessionCaloriesFromTotals(
    Number(session.distance_m),
    Number(session.duration_seconds),
    newMode,
    Number(session.moving_seconds) || 0
  );
  // O repouso das pausas nao depende do modo - so a parte ativa e que muda.
  const restingCalories = 1.0 * getPesoKg() * ((Number(session.paused_seconds) || 0) / 3600);
  const newCalories = newActiveCalories + restingCalories;
  const deltaKcal = newCalories - Number(session.calories_kcal);

  const { error: updateError } = await supabaseClient
    .from("training_sessions")
    // Corrigir o modo significa "afinal foi tudo X" - a reparticao detetada
    // deixa de fazer sentido e passa a ser toda do modo corrigido. Deixa-la
    // como estava punha o card a dizer "Bicicleta" em cima e "Corrida 5 km"
    // por baixo.
    .update({
      mode: newMode,
      calories_kcal: newCalories,
      calories_active_kcal: newActiveCalories,
      distance_by_mode: { [newMode]: Math.round(Number(session.distance_m) || 0) },
      time_by_mode: { [newMode]: Math.round((Number(session.duration_seconds) || 0) * 1000) },
    })
    .eq("id", sessionId);

  if (updateError) {
    showGameToast("Não foi possível corrigir o treino", "aviso");
    return;
  }

  // Agregados locais. CUIDADO: quando o delta e negativo, escrever so no
  // localStorage nao chega - a reconciliacao no arranque (secção 14.1) faz
  // max(local, servidor) nos campos que so crescem, e restauraria o valor
  // antigo, mais alto. Por isso o sync abaixo e AWAIT direto, nao o
  // queueProgressSync com debounce: os dois lados tem de ficar iguais antes
  // de qualquer outra coisa correr.
  localStorage.setItem(STORAGE_KEY_LIFETIME_KCAL, String(Math.max(0, getLifetimeCaloriesKcal() + deltaKcal)));
  localStorage.setItem(STORAGE_KEY_MONTHLY_KCAL, String(Math.max(0, getMonthlyCaloriesKcal() + deltaKcal)));
  await recomputeRecordsFromSessions();
  await syncProgressToSupabase();

  showGameToast(`Treino corrigido para ${MODE_LABEL_PT[newMode]}`, "medalha");
  refreshAllUi();
}

// Recordes por modo (distancia/ritmo) e recorde de calorias sao recalculados
// A PARTIR das sessoes, nao ajustados por delta: ao mudar o modo de uma
// sessao, o recorde de um modo pode ter de descer para a segunda melhor, e
// isso nao se consegue exprimir como um delta.
async function recomputeRecordsFromSessions() {
  const { data, error } = await supabaseClient
    .from("training_sessions")
    .select("distance_m, duration_seconds, moving_seconds, mode, calories_kcal")
    .eq("user_id", currentUserId);

  if (error || !data) return;

  const bestDistance = { caminhar: 0, correr: 0 };
  const bestPace = { caminhar: 0, correr: 0 };
  let bestCalories = 0;

  data.forEach((s) => {
    const mode = s.mode;
    if (!(mode in bestDistance)) return;
    const distance = Number(s.distance_m) || 0;
    const duration = Number(s.duration_seconds) || 0;
    bestDistance[mode] = Math.max(bestDistance[mode], distance);
    if (duration > 0) bestPace[mode] = Math.max(bestPace[mode], distance / duration);
    bestCalories = Math.max(bestCalories, Number(s.calories_kcal) || 0);
  });

  localStorage.setItem(STORAGE_KEY_BEST_SESSION_DISTANCE_M, String(bestDistance.correr));
  localStorage.setItem(STORAGE_KEY_BEST_SESSION_DISTANCE_M_CAMINHAR, String(bestDistance.caminhar));
  localStorage.setItem(STORAGE_KEY_BEST_PACE_MPS, String(bestPace.correr));
  localStorage.setItem(STORAGE_KEY_BEST_PACE_MPS_CAMINHAR, String(bestPace.caminhar));
  localStorage.setItem(STORAGE_KEY_BEST_SESSION_CALORIES_KCAL, String(bestCalories));
}
// ===== FIM DO BLOCO TEMPORARIO =============================================

btnStart.addEventListener("click", startTraining);
btnPause.addEventListener("click", pauseTraining);
btnSummaryClose.addEventListener("click", () => summaryModal.classList.add("hidden"));
btnResume.addEventListener("click", resumeTraining);
btnFinish.addEventListener("click", finishFromPause);

// Salva o valor mais recente imediatamente ao sair/recarregar a pagina,
// sem esperar pelo proximo checkpoint de 10s
window.addEventListener("pagehide", () => {
  if (watchId !== null) persistAccumulatedTraining();
});

resumeTrainingIfNeeded();
