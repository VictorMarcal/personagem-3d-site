const rotateOverlay = document.getElementById("rotate-overlay");

function isTouchDevice() {
  return "ontouchstart" in window || navigator.maxTouchPoints > 0;
}

// A rotacao FISICA do aparelho, nao o formato da janela. matchMedia
// ("(orientation: landscape)") mede a janela (largura >= altura) - com o
// teclado do telemovel aberto, e com interactive-widget=resizes-content no
// index.html, a janela encolhe em altura e passa a ser mais larga do que alta,
// por isso o aviso "rode o dispositivo" tapava os campos de login enquanto se
// escrevia a palavra-passe (bug reportado no Trello a 2026-09-21, com
// screenshot em bootlands.com). screen.orientation nao muda com o teclado.
// So se cai para matchMedia em browsers sem nenhuma das duas APIs.
function isLandscape() {
  if (window.screen && screen.orientation && typeof screen.orientation.type === "string") {
    return screen.orientation.type.startsWith("landscape");
  }
  if (typeof window.orientation === "number") return Math.abs(window.orientation) === 90;
  return window.matchMedia("(orientation: landscape)").matches;
}

function updateRotateOverlay() {
  const shouldShow = isTouchDevice() && isLandscape();
  rotateOverlay.classList.toggle("visible", shouldShow);
}

window.addEventListener("resize", updateRotateOverlay);
window.addEventListener("orientationchange", updateRotateOverlay);
if (window.screen && screen.orientation && screen.orientation.addEventListener) {
  screen.orientation.addEventListener("change", updateRotateOverlay);
}
updateRotateOverlay();
