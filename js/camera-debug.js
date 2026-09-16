// Painel de afinação de câmara (2026-09-16, a pedido - "da me a possibilidade
// de ajustar as camaras te estarem ao meu agrado e ai sim implementamos").
// So aparece com ?debugcamera na URL - nunca visivel para jogadores, sem
// nenhum custo (este ficheiro sai logo no primeiro if) quando o parametro
// nao esta presente.
//
// Deixa mexer ao vivo na posição/FOV/alvo ("olhar para") das duas câmaras da
// aba Eu > Personagem (idle e horda), partindo sempre da posição atual
// (CameraIdlePosition/CameraAtackPosition do Floor.glb, ou o fallback do
// código se o terreno ainda não tiver esses Empties - ver js/main.js). O
// campo de leitura no fundo do painel mostra os valores finais em texto,
// para copiar e enviar de volta - depois disso é que os valores voltam a
// ser gravados no código (ou movida a posição do Empty no Blender).
//
// Depende de: js/main.js (camera, character, applyNormalCamera,
// applyHordaCamera, CAM_TARGET_FACTOR). Carrega depois dele.
(function initCameraDebugPanel() {
  const params = new URLSearchParams(window.location.search);
  if (!params.has("debugcamera")) return;

  const panel = document.getElementById("camera-debug-panel");
  if (!panel) return;
  panel.classList.remove("hidden");

  const tabIdle = document.getElementById("camera-debug-tab-idle");
  const tabHorda = document.getElementById("camera-debug-tab-horda");
  const closeBtn = document.getElementById("camera-debug-close");
  const copyBtn = document.getElementById("camera-debug-copy");
  const readout = document.getElementById("camera-debug-readout");

  const CAMPOS = ["x", "y", "z", "fov", "lx", "ly", "lz"];
  const input = {};
  const valueEl = {};
  CAMPOS.forEach((campo) => {
    input[campo] = document.getElementById(`camera-debug-${campo}`);
    valueEl[campo] = document.getElementById(`camera-debug-${campo}-value`);
  });

  let vistaAtual = "idle";
  const debugLookAt = new THREE.Vector3(0, 0, 0);

  function numero(campo) {
    return Number(input[campo].value) || 0;
  }

  function aplicarValoresAtuais() {
    camera.position.set(numero("x"), numero("y"), numero("z"));
    camera.fov = numero("fov");
    camera.updateProjectionMatrix();
    debugLookAt.set(numero("lx"), numero("ly"), numero("lz"));
    camera.lookAt(debugLookAt);
    atualizarLeituras();
  }

  function atualizarLeituras() {
    CAMPOS.forEach((campo) => {
      valueEl[campo].textContent = numero(campo).toFixed(campo === "fov" ? 0 : 2);
    });
    readout.textContent =
      `Vista: ${vistaAtual}\n` +
      `Posição: x=${numero("x").toFixed(2)}, y=${numero("y").toFixed(2)}, z=${numero("z").toFixed(2)}\n` +
      `FOV: ${numero("fov").toFixed(0)}\n` +
      `Olhar: x=${numero("lx").toFixed(2)}, y=${numero("ly").toFixed(2)}, z=${numero("lz").toFixed(2)}`;
  }

  // Ao trocar de vista, arranca da posição REAL dessa câmara agora mesmo
  // (chama a função a sério, que já sabe ler o Floor.glb) - as sliders
  // partem sempre do que já está implementado, nunca de zero.
  function carregarVista(vista) {
    vistaAtual = vista;
    tabIdle.classList.toggle("active", vista === "idle");
    tabHorda.classList.toggle("active", vista === "horda");

    if (vista === "idle" && typeof applyNormalCamera === "function") {
      applyNormalCamera();
    } else if (vista === "horda" && typeof applyHordaCamera === "function") {
      applyHordaCamera();
    }

    input.x.value = camera.position.x;
    input.y.value = camera.position.y;
    input.z.value = camera.position.z;
    input.fov.value = camera.fov;

    // A câmara não guarda o alvo do lookAt - usa-se o mesmo alvo que a
    // função real aplicou (0,0,0 na horda; character.position.y*fator na
    // idle, com fallback a 0 se a personagem ainda não tiver carregado).
    input.lx.value = 0;
    input.lz.value = 0;
    if (vista === "idle" && typeof character !== "undefined" && typeof CAM_TARGET_FACTOR !== "undefined") {
      input.ly.value = character.position.y * CAM_TARGET_FACTOR;
    } else {
      input.ly.value = 0;
    }

    aplicarValoresAtuais();
  }

  CAMPOS.forEach((campo) => {
    input[campo].addEventListener("input", aplicarValoresAtuais);
  });
  tabIdle.addEventListener("click", () => carregarVista("idle"));
  tabHorda.addEventListener("click", () => carregarVista("horda"));
  closeBtn.addEventListener("click", () => panel.classList.add("hidden"));
  copyBtn.addEventListener("click", () => {
    if (navigator.clipboard) navigator.clipboard.writeText(readout.textContent).catch(() => {});
  });

  // A cena (terreno/torre/personagem) carrega de forma assíncrona - espera
  // um pouco antes da primeira leitura para não arrancar com posições de
  // fallback só porque o Floor.glb ainda não chegou. Trocar de aba
  // idle/horda a seguir relê sempre o valor mais recente de qualquer forma.
  setTimeout(() => carregarVista("idle"), 800);
})();
