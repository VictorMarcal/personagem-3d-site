// Hordas de inimigos (2026-09-16, a pedido via Trello - "Hordas de inimigos
// a cada 23h"). De tempos a tempos, monstros aparecem perto da Fortaleza (na
// cena 3D partilhada da aba Eu > Personagem, NAO na arena da Masmorra) e
// avançam para a atacar; a personagem defende-se sozinha, com a mesma logica
// de auto-ataque/dano da Masmorra (js/battle.js), so que aplicada a esta
// cena. So corre fora de uma luta na Masmorra (`battleInProgress`).
//
// Regras (todas a pedido do Victor):
//   - Horda 1 = 1 monstro, horda 2 = 2, horda 3 = 3, ... (nunca mais
//     monstros que pontos de partida existirem - repete pontos se precisar).
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
//
// TESTE (a pedido): HORDE_INTERVAL_MS esta em 1 minuto para se poder testar
// varias hordas seguidas sem esperar - a UNICA linha a mudar quando isto for
// para produção é essa (23h = 23 * 60 * 60 * 1000).
//
// Depende de: js/main.js (scene, camera, character, bow, head, canvas,
// shootArrow, showFloatingCombatText, battleInProgress via js/battle.js),
// js/battle.js (computeBattleDamage), js/equipment.js
// (computePlayerAtaque/Defesa/Vida, computeAttackSpeed/computeAttackRangeM,
// getWeaponLevel/getShieldLevel, getEffectiveInvestableStatLevel,
// getCurrentHp/setCurrentHp, renderStatsHud, showGameToast), js/resources.js
// (RESOURCE_IDS, acumularProducao, saveResources), js/resources-ui.js
// (renderResourcesPanel, renderWallet), js/storage-keys.js (STORAGE_KEY_HORDE,
// STORAGE_KEY_HORDE_REPORTS). Carrega depois de todos eles.

const HORDE_INTERVAL_MS = 1 * 60 * 1000; // TESTE - produção final: 23 * 60 * 60 * 1000
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
// Empties chamados "HordaSpawn1"/"HordaSpawn2"/"HordaSpawn3" (ou variantes -
// aceita por prefixo, mesmo esquema de TOWER_PLAYER_EMPTY_NAMES em
// js/main.js) dentro de assets/Floor.glb - o Victor vai coloca-los. Lidos
// por registrarHordaSpawnPoints(), chamada por loadSceneryFloor() (js/main.js)
// assim que o terreno carrega. Sem eles (placeholder ainda sem pivots),
// cai num triangulo a HORDA_SPAWN_FALLBACK_RADIUS_M da torre, para a
// mecanica funcionar mesmo antes de os pivots existirem.
const HORDA_SPAWN_EMPTY_NAMES = ["HordaSpawn", "SpawnHorda", "MonsterSpawn", "HordePos"];
const HORDA_SPAWN_FALLBACK_RADIUS_M = 10;
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
  const angulo = (indice / 3) * Math.PI * 2;
  return new THREE.Vector3(
    Math.cos(angulo) * HORDA_SPAWN_FALLBACK_RADIUS_M,
    0,
    Math.sin(angulo) * HORDA_SPAWN_FALLBACK_RADIUS_M
  );
}

function hordaSpawnPosition(indice) {
  if (hordaSpawnPositions.length > 0) return hordaSpawnPositions[indice % hordaSpawnPositions.length].clone();
  return hordaSpawnPositionFallback(indice % 3);
}

// --- estado persistido (proxima horda, quantas ja aconteceram) --------------
//
// So isto e gravado - a horda EM CURSO (posicoes/vida dos monstros) fica so
// em memoria e nao sobrevive a um reload, tal como uma luta na Masmorra
// tambem nao. Um reload a meio de uma horda simplesmente perde-a; a proxima
// (ja maior, porque a contagem sobe ao INICIAR, nao ao terminar) continua
// agendada certa.

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

let hordaMonstros = []; // { group, head, hp }
let hordaEmCurso = false;
let heroHordaAttackCooldownMs = 0;
let hordaRouboJaAconteceu = false; // uma vez por horda, ver atacarTorreComHorda()
let hordaRouboQuantidade = 0; // por recurso, fixado no momento do saque, para o relatorio

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
  hordaRouboQuantidade = 0;

  const estado = getHordaState();
  const numero = estado.contagem + 1;

  hordaMonstros = [];
  for (let i = 0; i < numero; i++) {
    const { group, head } = criarHordaMonstroPlaceholder();
    group.position.copy(hordaSpawnPosition(i));
    scene.add(group);
    hordaMonstros.push({ group, head, hp: HORDE_MONSTER_HP, attackCooldownMs: 0 });
  }

  // A contagem/agenda da PROXIMA horda fica logo marcada ao iniciar esta,
  // não so ao terminar - simplificação deliberada (ver comentário acima do
  // estado persistido); a diferença é so o tempo que esta horda demora a
  // ser repelida (segundos), irrelevante face ao intervalo de 1 min/23h.
  saveHordaState({ contagem: numero, proximaEm: Date.now() + HORDE_INTERVAL_MS });

  if (typeof showGameToast === "function") {
    showGameToast(`Horda a atacar a Fortaleza! (${numero} monstro${numero > 1 ? "s" : ""})`, "aviso");
  }
  renderHordaWarning();
}

function terminarHorda() {
  hordaMonstros.forEach((m) => scene.remove(m.group));
  hordaMonstros = [];
  hordaEmCurso = false;

  registarHordaRelatorio({
    data: Date.now(),
    numero: getHordaState().contagem,
    resultado: hordaRouboJaAconteceu ? "derrota" : "vitoria",
    recursosRoubadosPorRecurso: hordaRouboJaAconteceu ? hordaRouboQuantidade : 0,
  });

  if (typeof showGameToast === "function") {
    if (hordaRouboJaAconteceu) {
      showGameToast("A Fortaleza caiu! A horda venceu.", "aviso");
    } else {
      showGameToast("Horda repelida!", "medalha");
    }
  }
  renderHordaWarning();
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
// cada recurso"). Nunca vai abaixo de 0 por recurso.
function roubarRecursosDaFortaleza() {
  const vivos = hordaMonstros.filter((m) => m.hp > 0).length;
  if (vivos <= 0 || typeof acumularProducao !== "function" || typeof saveResources !== "function") return;

  const ids = typeof RESOURCE_IDS !== "undefined" ? RESOURCE_IDS : ["ferro", "madeira", "pele", "pedra", "barro"];
  const roubado = HORDE_ROUBO_POR_RECURSO * vivos;
  hordaRouboQuantidade = roubado; // para o relatorio, ver terminarHorda()
  const stock = acumularProducao();
  ids.forEach((id) => {
    stock[id] = Math.max(0, (Number(stock[id]) || 0) - roubado);
  });
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
  renderHordaRelatorios();
}

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

  el.innerHTML = relatorios
    .map((r) => {
      const quando = formatHordaRelatorioData(r.data);
      if (r.resultado === "vitoria") {
        return (
          '<div class="leaderboard-row">' +
          `<span class="leaderboard-name">Horda ${r.numero} · ${quando}</span>` +
          '<span class="horde-report-result horde-report-win">Vitória</span>' +
          "</div>"
        );
      }
      return (
        '<div class="leaderboard-row">' +
        `<span class="leaderboard-name">Horda ${r.numero} · ${quando}</span>` +
        `<span class="horde-report-result horde-report-loss">Derrota · -${r.recursosRoubadosPorRecurso} de cada recurso</span>` +
        "</div>"
      );
    })
    .join("");
}

// --- ataque automatico da personagem aos monstros ----------------------------

async function dispararContraHordaMonstro(alvo) {
  await shootArrow(bow, alvo.head);
  if (alvo.hp <= 0) return; // ja morreu entretanto (defensivo)

  const ataque = computePlayerAtaque(getEffectiveInvestableStatLevel("forca"));
  const dano = computeBattleDamage(ataque, HORDE_MONSTER_DEFESA);

  alvo.hp = Math.max(0, alvo.hp - dano);
  showFloatingCombatText(alvo.head, -dano, "damage");
  if (alvo.hp <= 0) scene.remove(alvo.group);
}

// Alvo: monstro vivo mais proximo da base da torre (0,0) dentro do alcance -
// simplificação deliberada: mede-se a partir da base da torre, não da
// posição exata do heroi no topo dela (ver nota em updateHordeAttack).
function alvoHordaMaisProximo() {
  let alvo = null;
  let menorDist = Infinity;
  const alcance = heroHordaAttackRangeM();
  hordaMonstros.forEach((m) => {
    if (m.hp <= 0) return;
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
    algumVivo = true;

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
    m.group.visible = visivel;
  });
}

// --- aviso na aba Eu > Personagem --------------------------------------------

function formatHordaCountdown(ms) {
  const totalSegundos = Math.ceil(ms / 1000);
  const minutos = Math.floor(totalSegundos / 60);
  const segundos = totalSegundos % 60;
  return `${minutos}:${String(segundos).padStart(2, "0")}`;
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
