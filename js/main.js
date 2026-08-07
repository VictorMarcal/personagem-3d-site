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

const sword = new THREE.Mesh(
  new THREE.BoxGeometry(0.08, 0.9, 0.08),
  new THREE.MeshStandardMaterial({ color: 0xc0c0c0 })
);
sword.position.set(0.55, 1.1, 0);
sword.rotation.z = Math.PI / 10;
sword.castShadow = true;
sword.userData.equipType = "forca";
character.add(sword);

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

const NORMAL_CAMERA_POSITION = { x: 0, y: 1.5, z: 4 };
const BATTLE_CAMERA_POSITION = { x: 0, y: 1.8, z: 7 };
const BATTLE_SIDE_OFFSET_X = 1.3;

function enterBattleView() {
  character.position.x = -BATTLE_SIDE_OFFSET_X;
  monster.position.x = BATTLE_SIDE_OFFSET_X;
  monster.rotation.y = -Math.PI / 2;
  monster.visible = true;

  camera.position.set(BATTLE_CAMERA_POSITION.x, BATTLE_CAMERA_POSITION.y, BATTLE_CAMERA_POSITION.z);
  camera.lookAt(0, 1, 0);
}

function exitBattleView() {
  character.position.x = 0;
  monster.visible = false;

  camera.position.set(NORMAL_CAMERA_POSITION.x, NORMAL_CAMERA_POSITION.y, NORMAL_CAMERA_POSITION.z);
  camera.lookAt(0, 1, 0);
}

// "Lunge" de ataque (2026-08-07, a pedido) - quem ataca avanca parte do
// caminho ate ao outro e volta, para dar sensacao de impacto em vez dos
// dois combatentes ficarem sempre estaticos nas mesmas posicoes durante
// toda a luta. So anima o eixo X (a unica dimensao em que se afastam,
// ver enterBattleView acima).
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
const equipmentMeshes = [body, sword, shield];

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

canvas.addEventListener("pointerdown", (event) => {
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

// Controlado por js/profile.js: poupa GPU/bateria no telemovel enquanto a
// aba Perfil esta visivel, sem parar o loop de todo (mais simples do que
// cancelar/reiniciar o requestAnimationFrame).
let jogoViewVisible = true;

function animate() {
  requestAnimationFrame(animate);
  if (jogoViewVisible) renderer.render(scene, camera);
}
animate();
