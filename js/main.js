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

// Luz principal DE FRENTE para o heroi (2026-08-12, a pedido - estava em
// (3, 5, 2), sobretudo de cima e do lado direito, o que deixava a frente
// do modelo na sombra). O heroi olha para +Z em repouso, e as duas camaras
// (normal e da arena) estao tambem do lado +Z - por isso a luz aqui
// ilumina o que se ve, nas duas vistas. Mantem alguma elevacao (Y) para
// dar volume: frontal na perfeicao achataria o modelo.
const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
dirLight.position.set(0, 3.5, 6);
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

// Heroi: grupo que recebe o modelo 3D real (assets/Hero.glb, carregado
// abaixo). `body`/`head`/`bow` deixaram de ser meshes com geometria
// propria (2026-08-11, a pedido - "remove o placeholder de heroi que
// tinhamos, agora usamos a mesh original") - ficam como THREE.Object3D
// simples (sem geometria/material, invisiveis por natureza), so como
// pontos de referencia de posicao usados por outros sistemas: `head` por
// showFloatingCombatText (aqui e em js/equipment.js, regeneracao fora de
// combate) e pela comparacao "e a cabeca do jogador?"; `bow` como origem
// da flecha em shootArrow (js/battle.js performHeroAttack). O clique-
// para-evoluir equipamento no modelo 3D (raycasting contra body/bow/
// shield) foi removido junto com o placeholder - os botoes da mini-lista
// (#equipment-mini-weapon/shield/armor, js/equipment.js) ja abriam os
// mesmos popups e continuam a ser o unico caminho agora.
const character = new THREE.Group();

const body = new THREE.Object3D();
body.position.y = 1;
character.add(body);

const head = new THREE.Object3D();
head.position.y = 1.9;
character.add(head);

const bow = new THREE.Object3D();
bow.position.set(0.55, 1.1, 0);
character.add(bow);

scene.add(character);

// Modelo 3D real do heroi (2026-08-11, a pedido - "assets/Hero.glb"),
// adicionado como filho de `character` (herda posicao/rotacao
// automaticamente, incl. no movimento/mira da arena).
let heroModel = null;
let heroModelReady = false;
// Pontos de encaixe do equipamento definidos NO PROPRIO MODELO (Empties
// exportados no glTF, 2026-08-12) - substituem as coordenadas fixas que
// estavam no codigo, que eram um palpite. Ver attachEquipmentToSlots.
let slotBow = null;
let slotShield = null;

// Altura a que o heroi e normalizado, em unidades do mundo - igual a que
// o modelo tinha antes de vir riggado, para a camara/arena ja afinadas
// continuarem validas.
const HERO_TARGET_HEIGHT = 1.8;

// Normaliza um modelo carregado: escala para HERO_TARGET_HEIGHT, centra em
// X/Z e assenta a base em Y=0.
//
// Existe porque cada export chegou com uma convencao diferente e nenhuma
// delas e "a certa":
//   - 2026-08-12 (manha): personagem em X~4.35 na cena de Blender, nao na
//     origem. Como `character` roda sobre si proprio para mirar, o modelo
//     orbitaria em torno de um ponto a varias unidades de distancia.
//   - 2026-08-12 (tarde, com rig Mixamo): no `Armature` com escala 0.01
//     (tipico de FBX importado), o que renderizava o heroi com 1.8 CM de
//     altura em vez de 1.8 unidades.
// Normalizar aqui em vez de pedir mais um export torna qualquer ficheiro
// futuro imune as duas coisas. Aplicado ao GRUPO do modelo, nao as meshes:
// os soquets de equipamento sao descendentes dele e acompanham escala e
// posicao, por isso o equipamento continua encaixado e proporcional.
// Extensao REAL do modelo no mundo. Num modelo riggado usa as posicoes dos
// OSSOS, nao Box3.setFromObject: num SkinnedMesh os vertices sao colocados
// pelas matrizes de skinning dos ossos, e nao pela transformacao da propria
// mesh - a caixa da geometria (bind pose) multiplicada pela matriz da mesh
// nao corresponde ao que e renderizado. No export de 2026-08-12 dava uma
// caixa de 4mm com a altura no eixo Z em vez de Y, o que levou a uma
// tentativa de normalizacao a escalar o modelo 533x. Os ossos dao a
// resposta certa (cabeca a Y=1.76, pes a Y=0.01). Modelos sem ossos
// (arena, arco, escudo) continuam a usar setFromObject.
function computeModelWorldBox(model) {
  model.updateMatrixWorld(true);
  const box = new THREE.Box3();
  const point = new THREE.Vector3();
  let hasBones = false;
  model.traverse((obj) => {
    if (obj.isBone) {
      box.expandByPoint(obj.getWorldPosition(point));
      hasBones = true;
    }
  });
  if (!hasBones) box.setFromObject(model);
  return box;
}

function normalizeLoadedModel(model, targetHeight) {
  let box = computeModelWorldBox(model);

  const height = box.max.y - box.min.y;
  if (targetHeight && height > 0) {
    model.scale.multiplyScalar(targetHeight / height);
    box = computeModelWorldBox(model);
  }

  // `character` esta na origem com escala 1 no momento do carregamento
  // (arranque da pagina), por isso coordenadas do mundo == locais ao pai.
  const center = box.getCenter(new THREE.Vector3());
  model.position.x -= center.x;
  model.position.z -= center.z;
  model.position.y -= box.min.y;

  return computeModelWorldBox(model);
}

// Nomes aceites para cada soquet, por ordem de preferencia - a convencao
// mudou entre exports ("SlotBow" -> "BowSoquet"), e nao vale a pena obrigar
// a reexportar so por causa de um nome. O primeiro que existir no modelo e
// o que conta.
const BOW_SLOT_NAMES = ["SlotBow", "BowSoquet", "SoquetBow"];
const SHIELD_SLOT_NAMES = ["SlotShield", "SoquetShield", "ShieldSoquet"];

function findFirstByName(model, names) {
  for (const name of names) {
    const found = model.getObjectByName(name);
    if (found) return found;
  }
  return null;
}

function loadHeroModel() {
  new THREE.GLTFLoader().load(
    "assets/Hero.glb",
    (gltf) => {
      const model = gltf.scene;
      model.traverse((obj) => {
        if (obj.isMesh) {
          obj.castShadow = true;
          obj.receiveShadow = true;
        }
      });
      character.add(model);
      const box = normalizeLoadedModel(model, HERO_TARGET_HEIGHT);
      heroModel = model;
      heroModelReady = true;

      slotBow = findFirstByName(model, BOW_SLOT_NAMES);
      slotShield = findFirstByName(model, SHIELD_SLOT_NAMES);

      // Ancora dos numeros flutuantes (dano/cura) por cima da cabeca -
      // segue a altura REAL do modelo em vez do 1.9 fixo do placeholder
      // antigo, senao os numeros ficam a flutuar longe demais quando o
      // modelo muda de tamanho entre exports.
      head.position.y = box.max.y + 0.15;

      setupHeroAnimation(gltf, model);
      attachEquipmentToSlots();
    },
    undefined,
    (err) => console.warn("Falha ao carregar assets/Hero.glb.", err)
  );
}
loadHeroModel();

// --- Animacao do heroi (2026-08-12, a pedido - "ele tem uma animação de
// idle, quero que ela toque em loop (para já)") -----------------------------
//
// heroMixer e atualizado a cada frame no animate() (com o mesmo dtSeconds
// ja usado pelo movimento) - sem isso, o modelo fica congelado na bind pose.
let heroMixer = null;
let heroIdleAction = null;

function setupHeroAnimation(gltf, model) {
  if (!gltf.animations || gltf.animations.length === 0) return;

  // O export de 2026-08-12 traz TRES clips praticamente iguais
  // ("Armature|Idle", "Idle", "Idle.001") - duplicados do proprio
  // exportador. Toca-se exatamente UM, senao somavam-se uns aos outros.
  const clip =
    gltf.animations.find((a) => /^idle$/i.test(a.name)) ||
    gltf.animations.find((a) => /idle/i.test(a.name)) ||
    gltf.animations[0];

  // Descarta tracks que animem o proprio no raiz da Armature (a diferenca
  // entre "Armature|Idle" e "Idle" era exatamente isso): seria "root
  // motion" a mexer o modelo por dentro, a lutar com a normalizacao acima
  // e com a posicao controlada pelo joystick na arena. Só os ossos animam.
  const boneTracks = clip.tracks.filter((t) => !/^Armature\./.test(t.name));
  const idleClip = new THREE.AnimationClip(clip.name, clip.duration, boneTracks);

  heroMixer = new THREE.AnimationMixer(model);
  heroIdleAction = heroMixer.clipAction(idleClip);
  heroIdleAction.setLoop(THREE.LoopRepeat, Infinity);
  heroIdleAction.play();
}

// Encaixa arco/escudo nos Empties do modelo, herdando posicao E rotacao
// definidas em Blender. Chamada depois de CADA carregamento (heroi, arco,
// escudo) porque a ordem de chegada nao e garantida - a primeira chamada
// que encontrar os dois lados ja emparelhados faz o encaixe. Se o modelo
// vier sem os Empties, nada acontece e as pecas ficam nas coordenadas
// fixas de recurso definidas mais abaixo (nao parte nada).
function attachEquipmentToSlots() {
  if (slotBow && bow.parent !== slotBow) {
    // `bow` e a ancora usada como origem da flecha (shootArrow) - passa a
    // viver dentro do slot, com transformacao local zerada, para herdar
    // exatamente o que foi definido no modelo.
    slotBow.add(bow);
    bow.position.set(0, 0, 0);
    bow.rotation.set(0, 0, 0);
  }
  if (slotShield && shieldModel && shieldModel.parent !== slotShield) {
    slotShield.add(shieldModel);
    shieldModel.position.set(0, 0, 0);
    shieldModel.rotation.set(0, 0, 0);
  }
}

// Escudo 3D real (2026-08-11, a pedido - "assets/Shield.glb"). Disco fino
// (~0.45 unidades de diametro) centrado na propria origem, sem rotacao
// nenhuma de fabrica. A posicao (-0.55, 1.1, 0) e so um RECURSO para o
// caso de o modelo do heroi vir sem o Empty "SlotShield" - quando ele
// existe, attachEquipmentToSlots re-parenta o escudo para la e esta
// posicao deixa de ter efeito.
let shieldModel = null;
let shieldModelReady = false;

function loadShieldModel() {
  new THREE.GLTFLoader().load(
    "assets/Shield.glb",
    (gltf) => {
      const model = gltf.scene;
      model.traverse((obj) => {
        if (obj.isMesh) {
          obj.castShadow = true;
          obj.receiveShadow = true;
        }
      });
      model.position.set(-0.55, 1.1, 0);
      character.add(model);
      shieldModel = model;
      shieldModelReady = true;
      attachEquipmentToSlots();
    },
    undefined,
    (err) => console.warn("Falha ao carregar assets/Shield.glb.", err)
  );
}
loadShieldModel();

// Arco 3D real (2026-08-11, a pedido - "assets/Bow.glb"). Comprido ao
// longo do eixo Z de fabrica (~1.1 unidades), nao do Y - rodado 90° em X
// para ficar de pe (tips para cima/baixo, como um arco segurado), a
// verificar visualmente. Adicionado como filho do proprio `bow` (o
// Object3D-ancora ja usado como origem da flecha em shootArrow, definido
// acima) em vez de `character` diretamente - fica automaticamente na
// mesma posicao (0.55, 1.1, 0) sem repetir as coordenadas.
let bowModel = null;
let bowModelReady = false;

function loadBowModel() {
  new THREE.GLTFLoader().load(
    "assets/Bow.glb",
    (gltf) => {
      const model = gltf.scene;
      model.traverse((obj) => {
        if (obj.isMesh) {
          obj.castShadow = true;
          obj.receiveShadow = true;
        }
      });
      model.rotation.x = Math.PI / 2;
      bow.add(model);
      bowModel = model;
      bowModelReady = true;
      attachEquipmentToSlots();
    },
    undefined,
    (err) => console.warn("Falha ao carregar assets/Bow.glb.", err)
  );
}
loadBowModel();

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
const NORMAL_CAMERA_FOV = 45;
// Perspetiva angulada de topo (nao e isometrica "verdadeira"/ortografica,
// mantem a PerspectiveCamera existente so reposicionada/reangulada).
// Câmara do lado da personagem (Z positivo) para o monstro, mais longe no
// eixo Z, projetar mais ao centro do ecra e a personagem mais em baixo -
// tal como pedido. **Reafinada (2026-08-11, comparado a referencias tipo
// Archero, a pedido - "a nossa camara ainda nao me convence")**: o
// angulo/distancia anteriores ((0,15,7.5), ~63° a partir da horizontal -
// quase topo puro) tinham sido afastados uma vez para a arena nao parecer
// pequena (pedido anterior no mesmo dia), mas isso deixou tudo demasiado
// "achatado"/distante, sem o efeito dramatico de jogos de referencia como
// o Archero (angulo bem mais raso, personagem maior no ecra). Baixada
// para (0,10,10) - 45° a partir da horizontal - e FOV proprio da luta
// (BATTLE_CAMERA_FOV=55, maior que o normal) para reforcar a perspetiva -
// heroi fica ~2x maior no ecra (verificado por projecao NDC, nao so a
// olho). Testado a caber dentro da largura em varios racios de ecra
// moveis (incl. 375×812, o mais estreito comum) antes de escolher estes
// valores - um angulo/FOV mais dramaticos ainda (testados: 45°/52° e
// 45°/50°) cortavam os cantos da arena fora do ecra em telas estreitas.
const BATTLE_CAMERA_POSITION = { x: 0, y: 10, z: 10 };
const BATTLE_CAMERA_FOV = 55;

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

  camera.fov = BATTLE_CAMERA_FOV;
  camera.updateProjectionMatrix();
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

  camera.fov = NORMAL_CAMERA_FOV;
  camera.updateProjectionMatrix();
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

// Arrastar para rodar a personagem so fora de luta (2026-08-11) - dentro
// da Masmorra/Arena, character.rotation.y passa a ser controlado pela
// direcao do movimento (ver updatePlayerMovement abaixo); sem esta guarda,
// arrastar no ecra durante uma luta rodava a personagem por cima do
// movimento do joystick.
//
// Clique-para-evoluir equipamento no modelo 3D removido (2026-08-11,
// junto com o placeholder - ver comentario acima de `character`): os
// botoes da mini-lista (#equipment-mini-weapon/shield/armor) ja abriam os
// mesmos popups e continuam a ser o unico caminho agora.
canvas.addEventListener("pointerdown", (event) => {
  if (typeof battleInProgress !== "undefined" && battleInProgress) return;
  isDragging = true;
  lastPointerX = event.clientX;
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
    // Animacao do heroi (idle em loop) - so enquanto a cena esta visivel,
    // pelo mesmo motivo do render: nao gastar bateria a animar um modelo
    // que ninguem esta a ver (aba Perfil aberta).
    if (heroMixer) heroMixer.update(dtSeconds);
    updatePlayerMovement(dtSeconds);
    const monsterVisible = typeof battleInProgress !== "undefined" && battleInProgress && isMonsterInFrustum();
    updateHeroFacing(monsterVisible);
    updateHeroAutoAttack(dtSeconds, monsterVisible);
    renderer.render(scene, camera);
  }
}
animate();
