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

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(viewer.clientWidth, viewer.clientHeight);
renderer.shadowMap.enabled = true;

const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1, 0);
controls.enableDamping = true;

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

scene.add(character);

loadingEl.style.display = "none";

function onResize() {
  const { clientWidth, clientHeight } = viewer;
  camera.aspect = clientWidth / clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(clientWidth, clientHeight);
}
window.addEventListener("resize", onResize);

function animate() {
  requestAnimationFrame(animate);
  character.rotation.y += 0.005;
  controls.update();
  renderer.render(scene, camera);
}
animate();
