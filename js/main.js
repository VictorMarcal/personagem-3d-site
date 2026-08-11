const canvas = document.getElementById("viewer-canvas");
const loadingEl = document.getElementById("viewer-loading");
const viewer = document.getElementById("viewer");

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x101014);

const camera = new THREE.PerspectiveCamera(
  45,
  viewer.clientWidth / viewer.clientHeight,
  0.1,
  100
);
camera.position.set(0, 1.5, 4);
camera.lookAt(0, 1, 0);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(viewer.clientWidth, viewer.clientHeight);
renderer.shadowMap.enabled = true;

// Luzes
const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1.2);
scene.add(hemiLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
dirLight.position.set(3, 5, 2);
dirLight.castShadow = true;
scene.add(dirLight);

// Chao
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(20, 20),
  new THREE.MeshStandardMaterial({ color: 0x1c1c22 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// Placeholder do personagem: capsula representando um humanoide
const character = new THREE.Group();

const body = new THREE.Mesh(
  new THREE.CapsuleGeometry(0.4, 1.2, 4, 16),
  new THREE.MeshStandardMaterial({ color: 0x4a90d9 })
);
body.position.y = 1;
body.castShadow = true;
character.add(body);

const head = new THREE.Mesh(
  new THREE.SphereGeometry(0.3, 16, 16),
  new THREE.MeshStandardMaterial({ color: 0xe0b090 })
);
head.position.y = 1.9;
head.castShadow = true;
character.add(head);

// Equipamentos placeholder, clicaveis para evoluir os status investidos
// (Energia/Forca/Resistencia - secção 7 da documentação; Foco nao tem
// peca 3D propria, so o botao "+" do HUD)
body.userData.equipType = "energia"; // armadura = corpo

// Arco (2026-08-11, era uma espada - personagem passou a arqueiro, secção
// 9 da documentação): arco parcial de TorusGeometry (a "corda" - abaixo -
// fecha a abertura entre as duas pontas, dando a silhueta reconhecivel de
// um arco). BOW_ARC centrado em 0deg (eixo +X local) para as pontas
// ficarem simetricas acima/abaixo, arqueadas para a frente do personagem.
const BOW_ARC = Math.PI * (5 / 6); // 150deg
const bow = new THREE.Mesh(
  new THREE.TorusGeometry(0.42, 0.035, 8, 24, BOW_ARC),
  new THREE.MeshStandardMaterial({ color: 0x6b3f1d })
);
bow.position.set(0.55, 1.1, 0);
bow.rotation.z = -BOW_ARC / 2;
bow.castShadow = true;
bow.userData.equipType = "forca";
character.add(bow);

// Corda do arco - so decorativa, nao entra em equipmentMeshes (nao reage a
// cliques), liga as duas pontas do arco acima (raio 0.42, arco de 150deg
// centrado em 0deg -> pontas em +-75deg, ver calculo no comentario acima).
const bowStringTipY = 0.42 * Math.sin(BOW_ARC / 2);
const bowString = new THREE.Mesh(
  new THREE.CylinderGeometry(0.008, 0.008, 2 * bowStringTipY, 6),
  new THREE.MeshStandardMaterial({ color: 0xe8e0c8 })
);
bowString.position.set(0.55 + 0.42 * Math.cos(BOW_ARC / 2), 1.1, 0);
character.add(bowString);

const shield = new THREE.Mesh(
  new THREE.CylinderGeometry(0.28, 0.28, 0.08, 16),
  new THREE.MeshStandardMaterial({ color: 0x8a5a2b })
);
shield.position.set(-0.55, 1.1, 0);
shield.rotation.x = Math.PI / 2;
shield.castShadow = true;
shield.userData.equipType = "resistencia";
character.add(shield);

scene.add(character);

// Placeholder do monstro (mesma forma do personagem, cores diferentes),
// escondido ate uma batalha comecar (js/battle.js)
const monster = new THREE.Group();

const monsterBody = new THREE.Mesh(
  new THREE.CapsuleGeometry(0.4, 1.2, 4, 16),
  new THREE.MeshStandardMaterial({ color: 0xb5482f })
);
monsterBody.position.y = 1;
monsterBody.castShadow = true;
monster.add(monsterBody);

const monsterHead = new THREE.Mesh(
  new THREE.SphereGeometry(0.3, 16, 16),
  new THREE.MeshStandardMaterial({ color: 0x6b2418 })
);
monsterHead.position.y = 1.9;
monsterHead.castShadow = true;
monster.add(monsterHead);

monster.visible = false;
scene.add(monster);

// Arena da Masmorra/Arena (2026-08-11, a pedido - vista top-down com
// movimento livre por joystick, substitui o palco lateral fixo de antes,
// secção 9 da documentação). Chao proprio, distinto do chao geral da
// aba Personagem, visivel so durante uma luta. Eixo Z faz de
// "profundidade": o monstro fica no centro (Z=0), a personagem arranca
// perto do fundo (Z positivo, lado mais perto da camara).
//
// ARENA_WIDTH e "let" (nao "const"): comeca no tamanho do chao placeholder
// abaixo, mas e recalculado se/quando o modelo 3D real (assets/arenaTeste.glb)
// carregar - ver loadArenaModel mais abaixo. ARENA_DEPTH fica fixo (a
// escala do modelo real e ajustada para bater com ele, nao o contrario -
// mantem a câmara/o "sente-se bem" ja validados no chao placeholder).
let ARENA_WIDTH = 6;
const ARENA_DEPTH = 8;
const ARENA_PLAYER_MARGIN = 0.5; // raio aproximado do modelo, para nao "entrar" nas paredes invisiveis
const ARENA_PLAYER_START_Z = ARENA_DEPTH / 2 - 1.5;

// Chao placeholder (visivel ate o modelo 3D real carregar, ou para sempre
// se a carga falhar - ver loadArenaModel).
const arenaFloor = new THREE.Mesh(
  new THREE.PlaneGeometry(ARENA_WIDTH, ARENA_DEPTH),
  new THREE.MeshStandardMaterial({ color: 0x24232b })
);
arenaFloor.rotation.x = -Math.PI / 2;
arenaFloor.position.y = 0.01; // acima do chao geral, evita z-fighting
arenaFloor.receiveShadow = true;
arenaFloor.visible = false;
scene.add(arenaFloor);

// Modelo 3D real da arena (2026-08-11, a pedido - "assets/arenaTeste.glb").
// Carregado uma vez, em segundo plano, assim que o script arranca - pronto
// muito antes de o jogador conseguir carregar em "Batalhar" pela primeira
// vez. arenaModelReady so fica true depois de reescalado para bater com
// ARENA_DEPTH (mantendo as proporcoes X/Z originais do modelo) e
// recentrado/pousado no chao - so nessa altura arenaFloor (placeholder)
// deixa de ser usado. Se a carga falhar (ficheiro em falta, erro de rede),
// fica silenciosamente no placeholder para sempre - nunca bloqueia a luta.
let arenaModel = null;
let arenaModelReady = false;

function loadArenaModel() {
  new THREE.GLTFLoader().load(
    "assets/arenaTeste.glb",
    (gltf) => {
      const model = gltf.scene;
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      if (size.z <= 0) return; // modelo vazio/invalido, mantem o placeholder

      // Escala uniforme (preserva as proporcoes do modelo) para a
      // profundidade (Z) bater com ARENA_DEPTH - a largura resultante (X)
      // passa a ser o novo ARENA_WIDTH, seja ela qual for.
      const scale = ARENA_DEPTH / size.z;
      model.scale.setScalar(scale);
      model.position.set(0, 0, 0);
      model.traverse((obj) => {
        if (obj.isMesh) {
          obj.receiveShadow = true;
          obj.castShadow = true;
        }
      });

      ARENA_WIDTH = size.x * scale;
      arenaModel = model;
      arenaModel.visible = false;
      scene.add(arenaModel);
      arenaModelReady = true;
    },
    undefined,
    (err) => console.warn("Falha ao carregar assets/arenaTeste.glb, mantem-se o chao placeholder.", err)
  );
}
loadArenaModel();

const NORMAL_CAMERA_POSITION = { x: 0, y: 1.5, z: 4 };
// Perspetiva angulada de topo (2026-08-11, a pedido - nao e isometrica
// "verdadeira"/ortografica, mantem a PerspectiveCamera existente so
// reposicionada bem mais alto e a apontar quase a direito para baixo).
// Câmara colocada do lado da personagem (Z positivo) para o monstro, mais
// longe no eixo Z, projetar mais ao centro do ecra e a personagem mais em
// baixo - tal como pedido. Afastada ~1.5x (2026-08-11, a pedido - "heroi e
// monstros estao muito proximos da camara, da a sensação de ser uma arena
// pequena") em relacao a (0,10,5) original, mesmo angulo (mesma razao
// z/y), so mais longe - heroi/monstro ficam menores no ecra, o que por
// contraste faz a arena parecer maior/mais espacosa.
const BATTLE_CAMERA_POSITION = { x: 0, y: 15, z: 7.5 };

function enterBattleView() {
  character.position.set(0, 0, ARENA_PLAYER_START_Z);
  character.rotation.y = 0;
  monster.position.set(0, 0, 0);
  monster.rotation.y = 0;
  monster.visible = true;

  // Modelo real assim que estiver pronto (loadArenaModel acima), chao
  // placeholder ate la (ou para sempre, se a carga tiver falhado).
  arenaFloor.visible = !arenaModelReady;
  if (arenaModel) arenaModel.visible = arenaModelReady;

  camera.position.set(BATTLE_CAMERA_POSITION.x, BATTLE_CAMERA_POSITION.y, BATTLE_CAMERA_POSITION.z);
  camera.lookAt(0, 0, 0);

  joystickDirection.x = 0;
  joystickDirection.z = 0;
  heroAttackCooldownMs = 0;
}

function exitBattleView() {
  character.position.set(0, 0, 0);
  character.rotation.y = 0;
  monster.visible = false;
  arenaFloor.visible = false;
  if (arenaModel) arenaModel.visible = false;

  camera.position.set(NORMAL_CAMERA_POSITION.x, NORMAL_CAMERA_POSITION.y, NORMAL_CAMERA_POSITION.z);
  camera.lookAt(0, 1, 0);
}

// "Lunge" de ataque (2026-08-07, a pedido) - quem ataca avanca parte do
// caminho ate ao outro e volta, para dar sensacao de impacto em vez dos
// dois combatentes ficarem sempre estaticos nas mesmas posicoes durante
// toda a luta. So anima o eixo X (a unica dimensao em que se afastam,
// ver enterBattleView acima). NAO CHAMADA POR AGORA (2026-08-11): a vista
// da Masmorra/Arena passa a arena top-down com movimento livre, e o ciclo
// de combate automatico ficou temporariamente desativado ate os modos de
// ataque do monstro serem definidos (ver js/battle.js) - fica pronta para
// ser reaproveitada nessa altura.
const LUNGE_FRACTION = 0.4; // 0-1, quanto do caminho ate ao outro e percorrido
const LUNGE_OUT_MS = 160;
const LUNGE_BACK_MS = 200;
const LUNGE_STEP_MS = 16; // ~60fps enquanto a aba esta em primeiro plano

// setTimeout em vez de requestAnimationFrame de proposito: o rAF fica
// suspenso por completo enquanto a aba nao esta visivel (ecra apagado,
// trocar de app a meio de uma luta) - como js/battle.js faz `await
// lungeOut(...)` antes de continuar a ronda, isso deixaria a luta inteira
// presa para sempre à espera de uma animacao que nunca mais corre.
// setTimeout continua a disparar em segundo plano (so mais lento), por
// isso a luta sempre acaba por avançar, mesmo que a animacao fique feia.
function animatePositionX(object3d, fromX, toX, durationMs) {
  return new Promise((resolve) => {
    const start = Date.now();
    function step() {
      const t = Math.min(1, (Date.now() - start) / durationMs);
      object3d.position.x = fromX + (toX - fromX) * t;
      if (t < 1) setTimeout(step, LUNGE_STEP_MS);
      else resolve();
    }
    step();
  });
}

// Avanca o atacante em direcao ao defensor - devolve a posicao original,
// para lungeBack saber para onde voltar. js/battle.js espera por isto
// antes de mostrar o dano (o numero flutuante aparece no momento do
// "impacto", no pico do avanco).
async function lungeOut(attacker, defender) {
  const originalX = attacker.position.x;
  const towardX = originalX + (defender.position.x - originalX) * LUNGE_FRACTION;
  await animatePositionX(attacker, originalX, towardX, LUNGE_OUT_MS);
  return originalX;
}

// Regresso a posicao original - disparado sem esperar (js/battle.js nao
// faz await), a decorrer em paralelo com o resto da ronda (ha sempre tempo
// de sobra no BATTLE_ROUND_DELAY_MS que se segue).
function lungeBack(attacker, originalX) {
  animatePositionX(attacker, attacker.position.x, originalX, LUNGE_BACK_MS);
}

// Flecha do ataque do jogador (2026-08-11, personagem passou a arqueiro,
// secção 9 da documentação) - so o jogador atira, o monstro mantem o
// "lunge" de ataque generico acima (nao e um arqueiro). Uma unica mesh
// reutilizada a cada disparo (escondida entre tiros), voa do arco ate ao
// corpo do monstro - js/battle.js espera (`await`) por isto antes de
// mostrar o dano, mesmo padrao de `lungeOut` (impacto "no momento certo").
const arrow = new THREE.Group();
const arrowShaft = new THREE.Mesh(
  new THREE.CylinderGeometry(0.012, 0.012, 0.5, 6),
  new THREE.MeshStandardMaterial({ color: 0x8a5a2b })
);
// Deitada ao longo do eixo +Z local - para um Object3D genérico (nao
// camera/luz), Object3D.lookAt() aponta o eixo +Z LOCAL para o alvo (ao
// contrario da convencao -Z das cameras), por isso a ponta da flecha tem
// de ficar do lado +Z para nao voar ao contrario (bug reportado: "a
// flecha esta ao contrario").
arrowShaft.rotation.x = Math.PI / 2;
arrow.add(arrowShaft);
const arrowTip = new THREE.Mesh(
  new THREE.ConeGeometry(0.03, 0.08, 6),
  new THREE.MeshStandardMaterial({ color: 0xd9d9d9 })
);
arrowTip.position.z = 0.29;
arrowTip.rotation.x = Math.PI / 2;
arrow.add(arrowTip);
arrow.visible = false;
scene.add(arrow);

const ARROW_FLIGHT_MS = 220;
const ARROW_STEP_MS = 16;

function shootArrow(fromMesh, toMesh) {
  return new Promise((resolve) => {
    const from = fromMesh.getWorldPosition(new THREE.Vector3());
    const to = toMesh.getWorldPosition(new THREE.Vector3());
    arrow.position.copy(from);
    arrow.lookAt(to);
    arrow.visible = true;

    const start = Date.now();
    function step() {
      const t = Math.min(1, (Date.now() - start) / ARROW_FLIGHT_MS);
      arrow.position.lerpVectors(from, to, t);
      if (t < 1) {
        setTimeout(step, ARROW_STEP_MS);
      } else {
        arrow.visible = false;
        resolve();
      }
    }
    step();
  });
}

loadingEl.style.display = "none";

function onResize() {
  const { clientWidth, clientHeight } = viewer;
  camera.aspect = clientWidth / clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(clientWidth, clientHeight);
}
window.addEventListener("resize", onResize);

// Rotacao do personagem por arraste (mouse ou toque)
const ROTATE_SPEED = 0.01; // radianos por pixel arrastado
let isDragging = false;
let lastPointerX = 0;
let pointerDownX = 0;
let pointerDownY = 0;

// Selecao de equipamento por toque/clique (sem arrastar)
const TAP_MAX_MOVEMENT_PX = 6;
const raycaster = new THREE.Raycaster();
const pointerNDC = new THREE.Vector2();
const equipmentMeshes = [body, bow, shield];

function raycastEquipmentAt(clientX, clientY) {
  if (typeof battleInProgress !== "undefined" && battleInProgress) return;

  const rect = canvas.getBoundingClientRect();
  pointerNDC.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  pointerNDC.y = -((clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(pointerNDC, camera);
  const hits = raycaster.intersectObjects(equipmentMeshes, false);
  if (hits.length === 0 || !hits[0].object.userData.equipType) return;

  // As 3 pecas tem tabela de tiers/custo por nivel de melhoria (secção 7 da
  // documentação) - clicar em qualquer uma abre o popup de evolucao com
  // moedas. Pontos em Energia/Força/Resistência continuam so pelo "+" do
  // HUD (js/equipment.js btnHudUpgradeByType), nao pelo clique no modelo 3D.
  const equipType = hits[0].object.userData.equipType;
  if (equipType === "forca") {
    openWeaponUpgradeModal();
  } else if (equipType === "resistencia") {
    openShieldUpgradeModal();
  } else if (equipType === "energia") {
    openArmorUpgradeModal();
  }
}

// Arrastar para rodar a personagem so fora de luta (2026-08-11) - dentro
// da Masmorra/Arena, character.rotation.y passa a ser controlado pela
// direcao do movimento (ver updatePlayerMovement abaixo); sem esta guarda,
// arrastar no ecra durante uma luta rodava a personagem por cima do
// movimento do joystick.
canvas.addEventListener("pointerdown", (event) => {
  if (typeof battleInProgress !== "undefined" && battleInProgress) return;
  isDragging = true;
  lastPointerX = event.clientX;
  pointerDownX = event.clientX;
  pointerDownY = event.clientY;
  canvas.setPointerCapture(event.pointerId);
});

canvas.addEventListener("pointermove", (event) => {
  if (!isDragging) return;
  const deltaX = event.clientX - lastPointerX;
  lastPointerX = event.clientX;
  character.rotation.y += deltaX * ROTATE_SPEED;
});

canvas.addEventListener("pointerup", (event) => {
  isDragging = false;
  canvas.releasePointerCapture(event.pointerId);

  const movedDistance = Math.hypot(event.clientX - pointerDownX, event.clientY - pointerDownY);
  if (movedDistance < TAP_MAX_MOVEMENT_PX) {
    raycastEquipmentAt(event.clientX, event.clientY);
  }
});

canvas.addEventListener("pointercancel", () => {
  isDragging = false;
});

// Numero flutuante por cima da cabeca de um modelo 3D (personagem ou
// monstro) - usado na luta (dano/critico/esquiva) e fora dela (recuperacao
// de vida ao longo do tempo). So precisa de projetar a posicao uma vez (nao
// a cada frame) porque, tanto na luta como fora dela, a camara e as
// posicoes dos modelos ficam fixas enquanto o numero esta visivel - so a
// vida muda.
//
// variant e opcional (default deduzido do sinal de amount, como antes -
// "damage" ou "heal") - a luta (js/battle.js) passa "critico" e "miss"
// explicitamente, ja que o sinal de amount sozinho nao distingue um acerto
// normal de um critico, e uma esquiva nao tem valor nenhum (amount = 0).
// FLOATING_COMBAT_TEXT_JITTER_PX: pequeno deslocamento aleatorio por
// numero, para varios acertos seguidos no mesmo alvo nao ficarem todos
// exatamente empilhados na mesma posicao.
const FLOATING_COMBAT_TEXT_JITTER_PX = 20;

function showFloatingCombatText(targetHead, amount, variant) {
  const worldPos = targetHead.getWorldPosition(new THREE.Vector3());
  const ndc = worldPos.project(camera);

  const rect = canvas.getBoundingClientRect();
  const x = (ndc.x * 0.5 + 0.5) * rect.width + (Math.random() - 0.5) * 2 * FLOATING_COMBAT_TEXT_JITTER_PX;
  const y = (-ndc.y * 0.5 + 0.5) * rect.height + (Math.random() - 0.5) * 2 * FLOATING_COMBAT_TEXT_JITTER_PX;

  const resolvedVariant = variant || (amount < 0 ? "damage" : "heal");
  // Cor do numero segue quem leva o acerto (verde = Victor/jogador, laranja
  // = monstro - mesma cor das barras de vida em battle.js), nao o tipo de
  // acerto - so o critico continua a distinguir-se por ser maior (ver
  // .critico abaixo), 2026-08-06 tema "Campo Aberto".
  const targetClass = targetHead === head ? "on-player" : "on-monster";

  const el = document.createElement("div");
  el.className = `floating-combat-text ${resolvedVariant} ${targetClass}`;
  el.textContent =
    resolvedVariant === "miss"
      ? "Miss"
      : (amount > 0 ? "+" : "") + (Number.isInteger(amount) ? amount : amount.toFixed(1));
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;

  viewer.appendChild(el);
  setTimeout(() => el.remove(), 1000);
}

// --- Joystick virtual + movimento livre na arena (2026-08-11, vista da
// Masmorra/Arena passa a top-down, secção 9 da documentação) -----------
//
// joystickDirection.x/z ficam entre -1 e 1 (fracao do raio maximo do
// joystick), lidos a cada frame por updatePlayerMovement - nao ha fila de
// eventos, so o estado "atual" do joystick importa.
const battleJoystickBaseEl = document.getElementById("battle-joystick-base");
const battleJoystickKnobEl = document.getElementById("battle-joystick-knob");
const JOYSTICK_MAX_RADIUS_PX = 40;
const joystickDirection = { x: 0, z: 0 };
let joystickPointerId = null;
let joystickCenter = { x: 0, y: 0 };

function joystickPointerDown(event) {
  joystickPointerId = event.pointerId;
  const rect = battleJoystickBaseEl.getBoundingClientRect();
  joystickCenter = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  battleJoystickBaseEl.setPointerCapture(event.pointerId);
  joystickPointerMove(event);
}

// setPointerCapture (chamado acima) garante que este handler continua a
// receber eventos mesmo quando o dedo sai fisicamente da base do joystick
// - por isso o deslocamento pode ultrapassar o raio maximo em pixeis, daí
// o clamp abaixo (o "knob" nunca sai visualmente da base).
function joystickPointerMove(event) {
  if (event.pointerId !== joystickPointerId) return;
  const dx = event.clientX - joystickCenter.x;
  const dy = event.clientY - joystickCenter.y;
  const dist = Math.min(JOYSTICK_MAX_RADIUS_PX, Math.hypot(dx, dy));
  const angle = Math.atan2(dy, dx);
  const knobX = Math.cos(angle) * dist;
  const knobY = Math.sin(angle) * dist;
  battleJoystickKnobEl.style.transform = `translate(calc(-50% + ${knobX}px), calc(-50% + ${knobY}px))`;
  joystickDirection.x = knobX / JOYSTICK_MAX_RADIUS_PX;
  joystickDirection.z = knobY / JOYSTICK_MAX_RADIUS_PX;
}

function joystickPointerEnd(event) {
  if (event.pointerId !== joystickPointerId) return;
  joystickPointerId = null;
  joystickDirection.x = 0;
  joystickDirection.z = 0;
  battleJoystickKnobEl.style.transform = "translate(-50%, -50%)";
}

battleJoystickBaseEl.addEventListener("pointerdown", joystickPointerDown);
battleJoystickBaseEl.addEventListener("pointermove", joystickPointerMove);
battleJoystickBaseEl.addEventListener("pointerup", joystickPointerEnd);
battleJoystickBaseEl.addEventListener("pointercancel", joystickPointerEnd);

// Velocidade em unidades do mundo (o corpo da personagem tem ~0.8 de
// diametro, secção 3 do modelo acima) por segundo. joystickDirection.z
// segue a convencao de ecra (para cima = negativo) - a camara da arena
// olha do lado +Z para -Z (ver enterBattleView), por isso "joystick para
// cima" tem mesmo de reduzir a coordenada Z da personagem (andar em
// direcao ao monstro, no centro da arena) - nao precisa de nenhuma
// conversao extra de eixo.
const PLAYER_MOVE_SPEED = 3;

function updatePlayerMovement(dtSeconds) {
  if (typeof battleInProgress === "undefined" || !battleInProgress) return;
  if (joystickDirection.x === 0 && joystickDirection.z === 0) return;

  const halfWidth = ARENA_WIDTH / 2 - ARENA_PLAYER_MARGIN;
  const halfDepth = ARENA_DEPTH / 2 - ARENA_PLAYER_MARGIN;
  const nextX = character.position.x + joystickDirection.x * PLAYER_MOVE_SPEED * dtSeconds;
  const nextZ = character.position.z + joystickDirection.z * PLAYER_MOVE_SPEED * dtSeconds;
  character.position.x = Math.max(-halfWidth, Math.min(halfWidth, nextX));
  character.position.z = Math.max(-halfDepth, Math.min(halfDepth, nextZ));
}

// Heroi mira/ataca automaticamente (2026-08-11, a pedido) --------------
//
// isMonsterInFrustum: Frustum da CAMARA (nao um cone de visao proprio do
// heroi - simplificacao razoavel, ja que a camara da arena olha sempre
// para o centro dela, secção 9 da documentação) reconstruido a cada
// chamada a partir de projectionMatrix/matrixWorldInverse - so testa o
// PONTO central do monstro, nao a mesh inteira (suficiente aqui, so ha um
// monstro por luta).
const battleFrustum = new THREE.Frustum();
const battleFrustumMatrix = new THREE.Matrix4();
const monsterFrustumTestPoint = new THREE.Vector3();

function isMonsterInFrustum() {
  if (!monster.visible) return false;
  battleFrustumMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  battleFrustum.setFromProjectionMatrix(battleFrustumMatrix);
  monster.getWorldPosition(monsterFrustumTestPoint);
  return battleFrustum.containsPoint(monsterFrustumTestPoint);
}

// O heroi aponta SEMPRE para o monstro que estiver no seu frustrum,
// mexendo-se ou nao (2026-08-11, a pedido) - substitui a rotacao por
// direcao de movimento que existia antes. So o arco/escudo (assimetricos
// no modelo placeholder) tornam a rotacao visivel.
function updateHeroFacing(monsterVisible) {
  if (!monsterVisible) return;
  const dx = monster.position.x - character.position.x;
  const dz = monster.position.z - character.position.z;
  if (dx === 0 && dz === 0) return;
  character.rotation.y = Math.atan2(dx, dz);
}

// O heroi so ataca PARADO (2026-08-11, a pedido - mexer o joystick
// cancela/adia o proximo disparo, tem de se largar o joystick para
// voltar a atacar). HERO_ATTACK_INTERVAL_MS: cadencia dos disparos
// automaticos: heroAttackCooldownMs desce a cada frame (dtSeconds) so
// enquanto parado com o monstro a vista, reposto ao maximo assim que
// dispara ou assim que volta a mexer-se. performHeroAttack (js/battle.js)
// trata do dano/animacao - so chamada quando a cadencia permite.
const HERO_ATTACK_INTERVAL_MS = 700;
let heroAttackCooldownMs = 0;

function updateHeroAutoAttack(dtSeconds, monsterVisible) {
  if (typeof battleInProgress === "undefined" || !battleInProgress) return;

  const isMoving = joystickDirection.x !== 0 || joystickDirection.z !== 0;
  if (isMoving || !monsterVisible) {
    heroAttackCooldownMs = 0;
    return;
  }

  heroAttackCooldownMs -= dtSeconds * 1000;
  if (heroAttackCooldownMs > 0) return;
  heroAttackCooldownMs = HERO_ATTACK_INTERVAL_MS;
  if (typeof performHeroAttack === "function") performHeroAttack();
}

// Controlado por js/profile.js: poupa GPU/bateria no telemovel enquanto a
// aba Perfil esta visivel, sem parar o loop de todo (mais simples do que
// cancelar/reiniciar o requestAnimationFrame).
let jogoViewVisible = true;
let lastAnimateFrameMs = Date.now();

function animate() {
  requestAnimationFrame(animate);
  const now = Date.now();
  // Capado a 50ms (equivalente a 20fps): se a aba ficou em segundo plano
  // e voltou, evita um "salto" grande de movimento no frame seguinte.
  const dtSeconds = Math.min(0.05, (now - lastAnimateFrameMs) / 1000);
  lastAnimateFrameMs = now;

  if (jogoViewVisible) {
    updatePlayerMovement(dtSeconds);
    const monsterVisible = typeof battleInProgress !== "undefined" && battleInProgress && isMonsterInFrustum();
    updateHeroFacing(monsterVisible);
    updateHeroAutoAttack(dtSeconds, monsterVisible);
    renderer.render(scene, camera);
  }
}
animate();
