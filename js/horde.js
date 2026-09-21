// Hordas de inimigos (2026-09-16, a pedido via Trello - "Hordas de inimigos
// a cada 23h"). De tempos a tempos, monstros aparecem perto da Fortaleza (na
// cena 3D partilhada da aba Reino > Fortaleza, NAO na arena da Masmorra) e
// avançam para a atacar; a personagem defende-se sozinha, com a mesma logica
// de auto-ataque/dano da Masmorra (js/battle.js), so que aplicada a esta
// cena. So corre fora de uma luta na Masmorra (`battleInProgress`).
//
// Regras (todas a pedido do Victor):
//   - Horda 1 = 1 monstro, horda 2 = 2, horda 3 = 3, ... sem limite (o
//     mesmo pivot pode calhar a mais de um monstro da mesma horda).
//   - O numero de monstros SO SOBE quando a horda e VENCIDA pelo jogador
//     (2026-09-21, a pedido - "assim que uma horda vence a torre, deixa de
//     incrementar monstros, so incrementa quando essa horda e vencida"):
//     se a horda vence a torre (derrota), a proxima traz os MESMOS monstros.
//     A "contagem" gravada passou a ser o numero de hordas VENCIDAS
//     (monstros da proxima = contagem + 1).
//   - Cada monstro nasce num dos ate 12 pivots do Floor.glb escolhido AO
//     ACASO (2026-09-16, a pedido - ver hordaSpawnPosition()), e nao nasce
//     todos ao mesmo tempo: cada um espera HORDE_SPAWN_STAGGER_MS (0.5s)
//     a mais que o anterior antes de aparecer em cena.
//   - Monstros andam HORDE_WALK_SPEED_MPS (1 m/s) em direcao a base da
//     torre.
//   - Ao chegar, atacam 1x por segundo - tiram dano a Vida atual do
//     jogador (a MESMA Vida partilhada com a Masmorra, getCurrentHp/
//     setCurrentHp em js/equipment.js - nao ha uma "vida da torre" à parte).
//   - A personagem dispara sozinha à cadência/alcance de Velocidade de
//     Ataque/Alcance (1 ataque/s e 4m à Arma/Escudo nível 1 - ver
//     heroHordaAttackIntervalMs/heroHordaAttackRangeM abaixo).
//   - Se a Vida da personagem chegar a 0, a Fortaleza é saqueada: cada
//     monstro que ainda estiver vivo NESSE MOMENTO rouba
//     HORDE_ROUBO_POR_RECURSO (10) unidades de CADA um dos 5 recursos. So
//     acontece uma vez por horda (ver hordaRouboJaAconteceu) - não volta a
//     roubar a cada ataque seguinte enquanto a Vida continuar a 0.
//   - Vida a 0 termina a horda de IMEDIATO como derrota (2026-09-16, a
//     pedido via Trello), mesmo que ainda restem monstros vivos - não
//     espera que o jogador os mate todos depois de já ter perdido.
//   - Sem modelos 3D reais ainda: placeholder (capsula+esfera, o mesmo
//     desenho do monstro da Masmorra em js/main.js, so que a cores
//     diferentes para nao confundir os dois).
//   - Camara muda para uma vista de cima (applyHordaCamera, js/main.js)
//     enquanto a horda dura (2026-09-16, a pedido, imagem de referencia com
//     o terreno todo a vista), e volta a normal (applyNormalCamera) ao
//     terminar.
//
// PRODUÇÃO (2026-09-16, a pedido - "reset das hordas, passar para o
// período de ataque de 23h"): HORDE_INTERVAL_MS sai da fase de testes
// (1 min) e passa a 23h, valor final. STORAGE_KEY_HORDE foi renomeada
// (js/storage-keys.js) para dar reset a quem já tinha hordas acumuladas
// da fase de testes - toda a gente volta a ver a horda 1 (1 monstro).
//
// Depende de: js/main.js (scene, camera, character, bow, head, canvas,
// shootArrow, showFloatingCombatText, battleInProgress via js/battle.js,
// applyHordaCamera/applyNormalCamera), js/battle.js (computeBattleDamage), js/equipment.js
// (computePlayerAtaque/Defesa/Vida, computeAttackSpeed/computeAttackRangeM,
// getWeaponLevel/getShieldLevel, getEffectiveInvestableStatLevel,
// getCurrentHp/setCurrentHp, renderStatsHud, showGameToast), js/resources.js
// (RESOURCE_IDS, acumularProducao, saveResources), js/resources-ui.js
// (renderResourcesPanel, renderWallet), js/storage-keys.js (STORAGE_KEY_HORDE,
// STORAGE_KEY_HORDE_REPORTS). Carrega depois de todos eles.

const HORDE_INTERVAL_MS = 23 * 60 * 60 * 1000;
const HORDE_WALK_SPEED_MPS = 1;
const HORDE_ATTACK_INTERVAL_MS = 1000;
const HORDE_ATTACK_RANGE_M = 1.2; // distancia da base da torre a que se considera "chegou"

// Cadência e alcance do disparo automático da personagem: desde 2026-09-16
// (a pedido, substituem Letalidade/Destreza) vêm de Velocidade de
// Ataque/Alcance (computeAttackSpeed/computeAttackRangeM, js/equipment.js),
// alimentadas pelo nível da Arma/Escudo - não são mais constantes fixas.
function heroHordaAttackIntervalMs() {
  const velocidade = computeAttackSpeed(getWeaponLevel());
  return 1000 / Math.max(0.01, velocidade);
}
function heroHordaAttackRangeM() {
  return computeAttackRangeM(getShieldLevel());
}

// Numeros provisorios (sem afinação nenhuma ainda - so para a mecanica
// funcionar): vida/ataque/defesa fixos do monstro placeholder, iguais em
// todas as hordas. A dificuldade sobe mesmo assim, so que por QUANTIDADE de
// monstros (1, 2, 3, ...), não por ficarem individualmente mais fortes.
const HORDE_MONSTER_HP = 20;
const HORDE_MONSTER_ATAQUE = 4;
const HORDE_MONSTER_DEFESA = 0;

// Saque a pedido: se a Vida chegar a 0, cada monstro ainda vivo rouba isto
// de CADA um dos 5 recursos.
const HORDE_ROUBO_POR_RECURSO = 10;

// --- pontos de partida -------------------------------------------------------
//
// Empties chamados "EnemySpawn1".."EnemySpawn12" (nomes reais no Floor.glb
// entregue pelo Victor em 2026-09-16 - numeracao nao e sequencial, ha 12 no
// total; outros prefixos aceites por segurança/versoes antigas, mesmo
// esquema de TOWER_PLAYER_EMPTY_NAMES em js/main.js) dentro de
// assets/Floor.glb. Lidos por registrarHordaSpawnPoints(), chamada por
// loadSceneryFloor() (js/main.js)
// assim que o terreno carrega. Sem eles (placeholder ainda sem pivots), cai
// num circulo de HORDA_SPAWN_FALLBACK_COUNT posicoes a
// HORDA_SPAWN_FALLBACK_RADIUS_M da torre, para a mecanica funcionar mesmo
// antes de os pivots existirem.
//
// Cada monstro nasce num pivot ESCOLHIDO AO ACASO (2026-09-16, a pedido) -
// nao ha ordem fixa nem repartição igual entre os pivots, dois monstros da
// mesma horda podem calhar no mesmo ponto.
const HORDA_SPAWN_EMPTY_NAMES = ["EnemySpawn", "HordaSpawn", "SpawnHorda", "MonsterSpawn", "HordePos"];
const HORDA_SPAWN_FALLBACK_RADIUS_M = 10;
const HORDA_SPAWN_FALLBACK_COUNT = 12;
let hordaSpawnPositions = [];

function registrarHordaSpawnPoints(model) {
  const encontrados = [];
  model.traverse((obj) => {
    if (!obj.name) return;
    if (HORDA_SPAWN_EMPTY_NAMES.some((nome) => obj.name.startsWith(nome))) {
      encontrados.push(obj);
    }
  });
  if (encontrados.length === 0) return;
  encontrados.sort((a, b) => a.name.localeCompare(b.name));
  hordaSpawnPositions = encontrados.map((obj) => obj.getWorldPosition(new THREE.Vector3()));
}

function hordaSpawnPositionFallback(indice) {
  const angulo = (indice / HORDA_SPAWN_FALLBACK_COUNT) * Math.PI * 2;
  return new THREE.Vector3(
    Math.cos(angulo) * HORDA_SPAWN_FALLBACK_RADIUS_M,
    0,
    Math.sin(angulo) * HORDA_SPAWN_FALLBACK_RADIUS_M
  );
}

// Sem argumento de propósito - a escolha e sempre aleatoria (ver comentário
// acima), nao ha "indice do monstro" a mapear para um pivot fixo.
function hordaSpawnPosition() {
  if (hordaSpawnPositions.length > 0) {
    const indice = Math.floor(Math.random() * hordaSpawnPositions.length);
    return hordaSpawnPositions[indice].clone();
  }
  return hordaSpawnPositionFallback(Math.floor(Math.random() * HORDA_SPAWN_FALLBACK_COUNT));
}

// --- estado persistido (proxima horda, quantas ja aconteceram) --------------
//
// So isto e gravado - a horda EM CURSO (posicoes/vida dos monstros) fica so
// em memoria e nao sobrevive a um reload, tal como uma luta na Masmorra
// tambem nao. Um reload a meio de uma horda simplesmente perde-a; a proxima
// continua agendada certa e com o mesmo numero de monstros (a contagem so
// sobe quando uma horda e VENCIDA, ver terminarHorda - uma horda perdida por
// reload conta como nao vencida).

function getHordaState() {
  try {
    const bruto = JSON.parse(localStorage.getItem(STORAGE_KEY_HORDE) || "null");
    if (bruto && typeof bruto === "object" && typeof bruto.proximaEm === "number") return bruto;
  } catch (e) {
    /* cai para vazio */
  }
  const novo = { proximaEm: Date.now() + HORDE_INTERVAL_MS, contagem: 0 };
  saveHordaState(novo);
  return novo;
}

function saveHordaState(estado) {
  localStorage.setItem(STORAGE_KEY_HORDE, JSON.stringify(estado));
}

function hordaRestanteMs() {
  return Math.max(0, getHordaState().proximaEm - Date.now());
}

// --- monstros em cena --------------------------------------------------------

// Escalonamento do nascimento (2026-09-16, a pedido) - os monstros de uma
// horda nao aparecem todos ao mesmo tempo, cada um nasce
// HORDE_SPAWN_STAGGER_MS depois do anterior (0, 0.5s, 1s, 1.5s, ...). Ver
// "nascido"/"delayNascimentoMs" em iniciarHorda()/updateHordeAttack().
const HORDE_SPAWN_STAGGER_MS = 500;

let hordaMonstros = []; // { group, head, hp, nascido, delayNascimentoMs }
let hordaEmCurso = false;
let hordaNumeroEmCurso = 0; // monstros da horda a decorrer (= "Horda N" no relatorio)
let heroHordaAttackCooldownMs = 0;
let hordaRouboJaAconteceu = false; // uma vez por horda, ver atacarTorreComHorda()
// Perdido de FACTO por recurso (pode ser menos que HORDE_ROUBO_POR_RECURSO x
// vivos num recurso que ja estava quase a 0 - nunca fica negativo), fixado
// no momento do saque, para o relatorio (2026-09-16, a pedido - "quantidade
// de recursos perdidos individualmente x madeira y pedra etc").
let hordaRouboPorRecurso = {};
// Vida realmente retirada, para o relatorio (2026-09-20, a pedido - "dano
// provocado" e "dano sofrido"). Conta o que de facto saiu (sem excesso num
// golpe final), por isso os monstros todos mortos somam exatamente a vida total.
let hordaDanoCausado = 0;
let hordaDanoSofrido = 0;

// Mesmo desenho placeholder do monstro da Masmorra (js/main.js) - capsula +
// esfera, sem depender de nenhum modelo GLTF. Cor diferente (roxo em vez de
// vermelho) so para nao se confundir visualmente com o monstro da arena.
function criarHordaMonstroPlaceholder() {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.35, 1.0, 4, 12),
    new THREE.MeshStandardMaterial({ color: 0x4a3a8f })
  );
  body.position.y = 0.85;
  body.castShadow = true;
  group.add(body);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.25, 14, 14),
    new THREE.MeshStandardMaterial({ color: 0x2a2160 })
  );
  head.position.y = 1.65;
  head.castShadow = true;
  group.add(head);
  return { group, head };
}

function iniciarHorda() {
  hordaEmCurso = true;
  hordaRouboJaAconteceu = false;
  hordaRouboPorRecurso = {};
  hordaDanoCausado = 0;
  hordaDanoSofrido = 0;

  const estado = getHordaState();
  const numero = estado.contagem + 1;
  hordaNumeroEmCurso = numero;

  hordaMonstros = [];
  for (let i = 0; i < numero; i++) {
    const { group, head } = criarHordaMonstroPlaceholder();
    group.position.copy(hordaSpawnPosition());
    group.visible = false; // so aparece quando "nasce", ver updateHordeAttack()
    scene.add(group);
    hordaMonstros.push({
      group,
      head,
      hp: HORDE_MONSTER_HP,
      attackCooldownMs: 0,
      nascido: false,
      delayNascimentoMs: i * HORDE_SPAWN_STAGGER_MS,
    });
  }

  // A AGENDA da proxima horda fica logo marcada ao iniciar esta (a diferenca
  // e so o tempo que esta demora, segundos, irrelevante face a 23h). A
  // CONTAGEM nao sobe aqui: so quando a horda e vencida (terminarHorda).
  saveHordaState({ contagem: estado.contagem, proximaEm: Date.now() + HORDE_INTERVAL_MS });

  if (typeof showGameToast === "function") {
    showGameToast(`Horda a atacar a Fortaleza! (${numero} monstro${numero > 1 ? "s" : ""})`, "aviso");
  }
  renderHordaWarning();

  // Vista de cima (js/main.js) enquanto a horda dura, para se ver o terreno
  // todo a volta da torre - so troca se a cena Reino > Fortaleza estiver
  // mesmo em uso (nao durante uma luta na Masmorra, que ja tem a sua
  // propria camara e ignora isto ao entrar/sair - ver applyPersonagemCamera).
  if (typeof battleInProgress === "undefined" || !battleInProgress) {
    if (typeof applyHordaCamera === "function") applyHordaCamera();
  }
}

function terminarHorda() {
  // Contados ANTES de limpar hordaMonstros - a pedido ("os relatorios devem
  // dizer o numero total de monstros e o numero de mostros derrotados").
  const totalMonstros = hordaMonstros.length;
  const monstrosDerrotados = hordaMonstros.filter((m) => m.hp <= 0).length;

  hordaMonstros.forEach((m) => scene.remove(m.group));
  hordaMonstros = [];
  hordaEmCurso = false;

  // So uma horda VENCIDA faz a seguinte trazer mais um monstro; se a horda
  // venceu a torre, a proxima repete o mesmo numero (2026-09-21, a pedido).
  if (!hordaRouboJaAconteceu) {
    const estado = getHordaState();
    saveHordaState({ ...estado, contagem: estado.contagem + 1 });
  }

  registarHordaRelatorio({
    data: Date.now(),
    numero: hordaNumeroEmCurso,
    resultado: hordaRouboJaAconteceu ? "derrota" : "vitoria",
    totalMonstros,
    monstrosDerrotados,
    danoCausado: Math.round(hordaDanoCausado),
    danoSofrido: Math.round(hordaDanoSofrido),
    recursosPerdidos: hordaRouboJaAconteceu ? hordaRouboPorRecurso : {},
  });

  if (typeof showGameToast === "function") {
    if (hordaRouboJaAconteceu) {
      showGameToast("A Fortaleza caiu! A horda venceu.", "aviso");
    } else {
      showGameToast("Horda repelida!", "medalha");
    }
  }
  renderHordaWarning();

  // updateHordeAttack() (chamada que leva a terminarHorda()) so corre fora
  // de uma luta na Masmorra, por isso aqui e sempre seguro voltar a vista
  // normal (ver o mesmo "if" em iniciarHorda() acima).
  if (typeof applyNormalCamera === "function") applyNormalCamera();
}

// --- ataque dos monstros a torre ---------------------------------------------

function atacarTorreComHorda() {
  const energiaLevel = getEffectiveInvestableStatLevel("energia");
  const maxHp = computePlayerVida(energiaLevel);
  const resistenciaLevel = getEffectiveInvestableStatLevel("resistencia");
  const defesa = computePlayerDefesa(resistenciaLevel);
  const dano = computeBattleDamage(HORDE_MONSTER_ATAQUE, defesa);

  const hpAtual = getCurrentHp(maxHp);
  const novaHp = Math.max(0, hpAtual - dano);
  hordaDanoSofrido += hpAtual - novaHp;
  setCurrentHp(novaHp);
  if (typeof showFloatingCombatText === "function" && typeof head !== "undefined") {
    showFloatingCombatText(head, -dano, "damage");
  }
  if (typeof renderStatsHud === "function") renderStatsHud();

  // Vida chegou a 0: a Fortaleza é saqueada, uma vez por horda (a pedido).
  if (novaHp <= 0 && !hordaRouboJaAconteceu) {
    hordaRouboJaAconteceu = true;
    roubarRecursosDaFortaleza();
  }
}

// Cada monstro ainda vivo NESTE MOMENTO rouba HORDE_ROUBO_POR_RECURSO de
// cada um dos 5 recursos - a pedido ("cada monstro que sobrevive rouba 10 de
// cada recurso"). Nunca vai abaixo de 0 por recurso - por isso o PERDIDO DE
// FACTO pode ser menor que o pretendido num recurso que ja estava quase a 0;
// hordaRouboPorRecurso guarda o valor real por recurso, para o relatorio
// (2026-09-16, a pedido - "quantidade de recursos perdidos individualmente
// x madeira y pedra etc").
function roubarRecursosDaFortaleza() {
  const vivos = hordaMonstros.filter((m) => m.hp > 0).length;
  if (vivos <= 0 || typeof acumularProducao !== "function" || typeof saveResources !== "function") return;

  const ids = typeof RESOURCE_IDS !== "undefined" ? RESOURCE_IDS : ["ferro", "madeira", "pele", "pedra", "barro"];
  const roubado = HORDE_ROUBO_POR_RECURSO * vivos;
  const stock = acumularProducao();
  const perdidoPorRecurso = {};
  ids.forEach((id) => {
    const antes = Number(stock[id]) || 0;
    const depois = Math.max(0, antes - roubado);
    perdidoPorRecurso[id] = antes - depois;
    stock[id] = depois;
  });
  hordaRouboPorRecurso = perdidoPorRecurso; // para o relatorio, ver terminarHorda()
  saveResources(stock);

  if (typeof renderResourcesPanel === "function") renderResourcesPanel();
  if (typeof renderWallet === "function") renderWallet();
  if (typeof showGameToast === "function") {
    showGameToast(`A Fortaleza foi saqueada! -${roubado} de cada recurso.`, "aviso");
  }
}

// --- relatórios de batalha (secção Eu › Troféus) -----------------------------
//
// A pedido ("precisamos de uma secção de relatórios batalhas onde constam
// os relatórios das hordas - se vencemos, se perdemos e em caso de perca,
// quantos recursos foram roubados"). "Vitória" = repeliu a horda sem a Vida
// alguma vez chegar a 0; "Derrota" = chegou a 0 pelo menos uma vez (mesmo
// que os monstros tenham todos acabado por morrer a seguir) - o mesmo
// critério do saque (hordaRouboJaAconteceu). Guarda só as últimas
// HORDE_REPORTS_MAX, mais recente primeiro.
const HORDE_REPORTS_MAX = 20;

function getHordaRelatorios() {
  try {
    const bruto = JSON.parse(localStorage.getItem(STORAGE_KEY_HORDE_REPORTS) || "[]");
    if (Array.isArray(bruto)) return bruto;
  } catch (e) {
    /* cai para vazio */
  }
  return [];
}

function registarHordaRelatorio(relatorio) {
  const lista = [relatorio, ...getHordaRelatorios()].slice(0, HORDE_REPORTS_MAX);
  localStorage.setItem(STORAGE_KEY_HORDE_REPORTS, JSON.stringify(lista));
  saveHordaRelatoriosPorVer([...getHordaRelatoriosPorVer(), relatorio.data]);
  renderHordaRelatorios();
  // Badge no separador "Eu"/card "Relatórios de Batalhas" (2026-09-18, a
  // pedido) - atualiza logo, mesmo que o jogador ja esteja dentro da app
  // quando a horda termina.
  if (typeof renderNavBadges === "function") renderNavBadges();
}

// --- Badge de notificacao (2026-09-18, a pedido) ----------------------------
//
// Mesmo espirito de getAchievementsPorVer() (js/achievements.js): desde
// 2026-09-20 (a pedido - "clicar num relatorio ... e a forma de confirmar que
// essa notificacao foi vista") guarda-se a lista de relatorios POR VER (o
// `data` de cada um, que e unico), em STORAGE_KEY_HORDE_REPORTS_PENDING. Entra
// em registarHordaRelatorio, sai ao abrir o popup do relatorio. Entrar na
// sub-aba Troféus ja nao limpa nada. Primeira leitura sem lista: migra do
// "visto ate" antigo (STORAGE_KEY_HORDE_REPORTS_SEEN_AT).
function getHordaRelatoriosPorVer() {
  const bruto = localStorage.getItem(STORAGE_KEY_HORDE_REPORTS_PENDING);
  if (bruto !== null) {
    try {
      const lista = JSON.parse(bruto);
      if (Array.isArray(lista)) return lista;
    } catch (e) {
      /* cai para vazio */
    }
    return [];
  }
  const seenAt = Number(localStorage.getItem(STORAGE_KEY_HORDE_REPORTS_SEEN_AT)) || 0;
  const migrada = getHordaRelatorios().map((r) => r.data).filter((d) => Number(d) > seenAt);
  localStorage.setItem(STORAGE_KEY_HORDE_REPORTS_PENDING, JSON.stringify(migrada));
  return migrada;
}

function saveHordaRelatoriosPorVer(lista) {
  localStorage.setItem(STORAGE_KEY_HORDE_REPORTS_PENDING, JSON.stringify(lista));
}

function hordaRelatorioPorVer(data) {
  return getHordaRelatoriosPorVer().includes(data);
}

function marcarHordaRelatorioComoVisto(data) {
  const lista = getHordaRelatoriosPorVer();
  if (!lista.includes(data)) return;
  saveHordaRelatoriosPorVer(lista.filter((d) => d !== data));
  if (typeof renderNavBadges === "function") renderNavBadges();
}

function contarHordaRelatoriosNaoVistos() {
  const porVer = getHordaRelatoriosPorVer();
  return getHordaRelatorios().filter((r) => porVer.includes(r.data)).length;
}

getHordaRelatoriosPorVer();

function formatHordaRelatorioData(ts) {
  return new Date(ts).toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

// Preenche #horde-reports-list (index.html, separador Eu › Troféus). Escreve
// sempre no DOM, visível ou não - mesmo padrão de renderMissionsPanel
// (js/missions.js): quando o jogador abrir a aba já lá está o mais recente.
function renderHordaRelatorios() {
  const el = document.getElementById("horde-reports-list");
  if (!el) return;

  const relatorios = getHordaRelatorios();
  if (relatorios.length === 0) {
    el.innerHTML = '<p class="mission-empty">Ainda sem hordas repelidas.</p>';
    return;
  }

  el.innerHTML = relatorios.map((r) => renderHordaRelatorioRow(r)).join("");
}

// Uma linha do relatório: só "Horda N · data" e o resultado - o resto vive no
// popup que abre ao clicar (2026-09-20, a pedido - "os relatórios passam a ser
// clicáveis, tal como as medalhas"). A data do relatório serve de chave para o
// encontrar de novo (ver o clique em #horde-reports-list, mais abaixo).
function renderHordaRelatorioRow(r) {
  const quando = formatHordaRelatorioData(r.data);
  const vitoria = r.resultado === "vitoria";
  const resultadoHtml = vitoria
    ? '<span class="horde-report-result horde-report-win">Vitória</span>'
    : '<span class="horde-report-result horde-report-loss">Derrota</span>';

  return (
    `<button type="button" class="horde-report-row${hordaRelatorioPorVer(r.data) ? " unseen" : ""}" data-relatorio="${r.data}">` +
    `<span class="leaderboard-name">Horda ${r.numero} · ${quando}</span>${resultadoHtml}` +
    "</button>"
  );
}

// Tolerante a relatórios ANTIGOS (guardados antes de 2026-09-16 sem
// totalMonstros/monstrosDerrotados/recursosPerdidos, e antes de 2026-09-20 sem
// danoCausado/danoSofrido) - o que não existir mostra "—", nunca "undefined"
// nem números inventados.
function abrirHordaRelatorio(relatorio) {
  const vitoria = relatorio.resultado === "vitoria";
  const numOuTraco = (v) => (typeof v === "number" ? v.toLocaleString("pt-PT") : "—");

  document.getElementById("horde-report-title").textContent = "Horda " + relatorio.numero;
  document.getElementById("horde-report-subtitle").innerHTML =
    formatHordaRelatorioData(relatorio.data) + " · " +
    (vitoria
      ? '<span class="horde-report-win">Vitória</span>'
      : '<span class="horde-report-loss">Derrota</span>');

  const linha = (rotulo, valor) =>
    `<p class="horde-report-stat"><span>${rotulo}</span><strong>${valor}</strong></p>`;

  let corpo =
    linha("Monstros derrotados", numOuTraco(relatorio.monstrosDerrotados)) +
    linha("Monstros no total", numOuTraco(relatorio.totalMonstros)) +
    linha("Dano provocado", numOuTraco(relatorio.danoCausado)) +
    linha("Dano sofrido", numOuTraco(relatorio.danoSofrido));

  if (!vitoria) {
    const ids = typeof RESOURCE_IDS !== "undefined" ? RESOURCE_IDS : ["ferro", "madeira", "pele", "pedra", "barro"];
    // recursosPerdidos (formato novo, valor real por recurso) ou, num
    // relatorio antigo, recursosRoubadosPorRecurso (um numero só, o mesmo
    // "pretendido" repetido nos 5 - unica informação que existia então).
    const perdidos = relatorio.recursosPerdidos && typeof relatorio.recursosPerdidos === "object" ? relatorio.recursosPerdidos : null;
    const perdaAntiga = !perdidos && Number(relatorio.recursosRoubadosPorRecurso) > 0 ? Number(relatorio.recursosRoubadosPorRecurso) : 0;

    const chips = ids
      .map((id) => {
        const quantidade = perdidos ? Number(perdidos[id]) || 0 : perdaAntiga;
        if (quantidade <= 0) return "";
        const nome = typeof RESOURCE_BY_ID !== "undefined" && RESOURCE_BY_ID[id] ? RESOURCE_BY_ID[id].nome : id;
        const ic = typeof icon === "function" ? icon(id, 14) : "";
        return `<span class="wallet-chip">${ic}-${quantidade} ${nome}</span>`;
      })
      .join("");
    corpo +=
      '<p class="horde-report-stat-label">Recursos perdidos</p>' +
      (chips ? `<div class="wallet horde-report-loot">${chips}</div>` : '<p class="horde-report-detail">—</p>');
  }

  document.getElementById("horde-report-body").innerHTML = corpo;
  document.getElementById("horde-report-modal").classList.remove("hidden");

  // Abrir o relatorio e a confirmacao de que foi visto (2026-09-20, a pedido).
  if (hordaRelatorioPorVer(relatorio.data)) {
    marcarHordaRelatorioComoVisto(relatorio.data);
    renderHordaRelatorios();
  }
}

function fecharHordaRelatorio() {
  document.getElementById("horde-report-modal").classList.add("hidden");
}

document.getElementById("btn-close-horde-report").addEventListener("click", fecharHordaRelatorio);
document.getElementById("horde-report-modal").addEventListener("click", (event) => {
  if (event.target.id === "horde-report-modal") fecharHordaRelatorio();
});
document.getElementById("horde-reports-list").addEventListener("click", (event) => {
  const linha = event.target.closest("[data-relatorio]");
  if (!linha) return;
  const relatorio = getHordaRelatorios().find((r) => String(r.data) === linha.dataset.relatorio);
  if (relatorio) abrirHordaRelatorio(relatorio);
});

// --- ataque automatico da personagem aos monstros ----------------------------

async function dispararContraHordaMonstro(alvo) {
  await shootArrow(bow, alvo.head);
  if (alvo.hp <= 0) return; // ja morreu entretanto (defensivo)

  const ataque = computePlayerAtaque(getEffectiveInvestableStatLevel("forca"));
  const dano = computeBattleDamage(ataque, HORDE_MONSTER_DEFESA);

  const hpAntes = alvo.hp;
  alvo.hp = Math.max(0, alvo.hp - dano);
  hordaDanoCausado += hpAntes - alvo.hp;
  showFloatingCombatText(alvo.head, -dano, "damage");
  if (alvo.hp <= 0) scene.remove(alvo.group);
}

// Alvo: monstro vivo mais proximo da base da torre (0,0) dentro do alcance -
// simplificação deliberada: mede-se a partir da base da torre, não da
// posição exata do heroi no topo dela (ver nota em updateHordeAttack). Um
// monstro que ainda nao "nasceu" (delay de escalonamento, ver
// HORDE_SPAWN_STAGGER_MS) nao e um alvo valido - ainda nao esta em cena.
function alvoHordaMaisProximo() {
  let alvo = null;
  let menorDist = Infinity;
  const alcance = heroHordaAttackRangeM();
  hordaMonstros.forEach((m) => {
    if (m.hp <= 0 || !m.nascido) return;
    const dist = Math.hypot(m.group.position.x, m.group.position.z);
    if (dist <= alcance && dist < menorDist) {
      menorDist = dist;
      alvo = m;
    }
  });
  return alvo;
}

// --- loop principal, chamado por animate() (js/main.js) ----------------------
//
// So corre fora de uma luta na Masmorra (ver o "if" em animate()). Move os
// monstros vivos em direção a base da torre (origem X/Z - o mesmo ponto onde
// applyTowerModel centra o modelo, ver js/main.js); ao chegar, atacam de
// segundo a segundo. A personagem dispara sozinha ao alvo mais próximo
// dentro do alcance. Termina a horda quando não sobra nenhum vivo.
function updateHordeAttack(dtSeconds) {
  if (!hordaEmCurso) {
    if (hordaRestanteMs() <= 0) iniciarHorda();
    return;
  }

  let algumVivo = false;

  hordaMonstros.forEach((m) => {
    if (m.hp <= 0) return;
    algumVivo = true; // conta para nao terminar a horda antes de todos nascerem

    if (!m.nascido) {
      m.delayNascimentoMs -= dtSeconds * 1000;
      if (m.delayNascimentoMs > 0) return; // ainda nao chegou a vez dele
      m.nascido = true;
      m.group.visible = true;
    }

    const pos = m.group.position;
    const dist = Math.hypot(pos.x, pos.z);

    if (dist > HORDE_ATTACK_RANGE_M) {
      const passo = HORDE_WALK_SPEED_MPS * dtSeconds;
      const fracao = dist > 0 ? Math.min(1, passo / dist) : 0;
      pos.x -= pos.x * fracao;
      pos.z -= pos.z * fracao;
      m.group.rotation.y = Math.atan2(-pos.x, -pos.z);
    } else {
      m.attackCooldownMs -= dtSeconds * 1000;
      if (m.attackCooldownMs <= 0) {
        m.attackCooldownMs = HORDE_ATTACK_INTERVAL_MS;
        atacarTorreComHorda();
      }
    }
  });

  heroHordaAttackCooldownMs -= dtSeconds * 1000;
  if (heroHordaAttackCooldownMs <= 0) {
    const alvo = alvoHordaMaisProximo();
    if (alvo) {
      heroHordaAttackCooldownMs = heroHordaAttackIntervalMs();
      dispararContraHordaMonstro(alvo);
    }
  }

  // Vida a 0 termina a horda de imediato como derrota, mesmo com monstros
  // ainda vivos (a pedido via Trello, 2026-09-16) - antes disto o saque
  // acontecia mas a luta continuava ate matar todos os monstros, o que podia
  // acabar por mostrar "Horda repelida!" depois de uma derrota.
  if (hordaRouboJaAconteceu || !algumVivo) terminarHorda();
}

// Chamado por enterBattleView()/exitBattleView() (js/main.js) - os monstros
// da horda ficam invisiveis durante uma luta na Masmorra (o resto da cena
// tambem muda, camara incluida) e voltam a aparecer ao sair.
function setHordaMonstrosVisible(visivel) {
  hordaMonstros.forEach((m) => {
    // Um monstro que ainda nao "nasceu" (escalonamento, ver
    // HORDE_SPAWN_STAGGER_MS) fica sempre escondido, mesmo quando o resto
    // da horda volta a ficar visivel ao sair da Masmorra.
    m.group.visible = visivel && m.nascido;
  });
}

// --- aviso na aba Reino > Fortaleza ------------------------------------------

// hh:mm:ss (2026-09-16, a pedido - antes era so mm:ss, ilegivel agora que
// HORDE_INTERVAL_MS e 23h em vez de minutos).
function formatHordaCountdown(ms) {
  const totalSegundos = Math.ceil(ms / 1000);
  const horas = Math.floor(totalSegundos / 3600);
  const minutos = Math.floor((totalSegundos % 3600) / 60);
  const segundos = totalSegundos % 60;
  return `${String(horas).padStart(2, "0")}:${String(minutos).padStart(2, "0")}:${String(segundos).padStart(2, "0")}`;
}

function renderHordaWarning() {
  const el = document.getElementById("horde-warning");
  if (!el) return;
  el.classList.remove("hidden");
  if (hordaEmCurso) {
    const vivos = hordaMonstros.filter((m) => m.hp > 0).length;
    el.textContent = `Horda a atacar a Fortaleza! ${vivos} monstro${vivos === 1 ? "" : "s"} a caminho.`;
  } else {
    el.textContent = `Próximo ataque à torre em ${formatHordaCountdown(hordaRestanteMs())}`;
  }
}

// Mesmo padrao de startResourcesTicker/stopResourcesTicker (js/resources-ui.js)
// - so corre com o aviso a vista (offsetParent), auto-para quando deixa de
// estar, e a pagina escondida para logo (visibilitychange abaixo).
let hordaTickerId = null;

function startHordaTicker() {
  if (hordaTickerId !== null) return;
  renderHordaWarning();
  hordaTickerId = setInterval(() => {
    const el = document.getElementById("horde-warning");
    if (!el || !el.offsetParent) {
      stopHordaTicker();
      return;
    }
    renderHordaWarning();
  }, 1000);
}

function stopHordaTicker() {
  if (hordaTickerId === null) return;
  clearInterval(hordaTickerId);
  hordaTickerId = null;
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") stopHordaTicker();
});

// Relatórios: escreve o que já houver assim que o script carrega, para
// aparecer certo mesmo que o jogador abra Eu › Troféus sem nenhuma horda
// ter acontecido nesta sessão.
renderHordaRelatorios();
