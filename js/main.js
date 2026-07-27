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

// Equipamentos placeholder, clicaveis para evoluir os status do personagem
body.userData.equipType = "energia"; // armadura = corpo

const sword = new THREE.Mesh(
  new THREE.BoxGeometry(0.08, 0.9, 0.08),
  new THREE.MeshStandardMaterial({ color: 0xc0c0c0 })
);
sword.position.set(0.55, 1.1, 0);
sword.rotation.z = Math.PI / 10;
sword.castShadow = true;
sword.userData.equipType = "ataque";
character.add(sword);

const shield = new THREE.Mesh(
  new THREE.CylinderGeometry(0.28, 0.28, 0.08, 16),
  new THREE.MeshStandardMaterial({ color: 0x8a5a2b })
);
shield.position.set(-0.55, 1.1, 0);
shield.rotation.x = Math.PI / 2;
shield.castShadow = true;
shield.userData.equipType = "defesa";
character.add(shield);

scene.add(character);

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
  const rect = canvas.getBoundingClientRect();
  pointerNDC.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  pointerNDC.y = -((clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(pointerNDC, camera);
  const hits = raycaster.intersectObjects(equipmentMeshes, false);
  if (hits.length > 0 && hits[0].object.userData.equipType) {
    selectEquipment(hits[0].object.userData.equipType);
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

function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}
animate();
