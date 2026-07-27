const rotateOverlay = document.getElementById("rotate-overlay");

function isTouchDevice() {
  return "ontouchstart" in window || navigator.maxTouchPoints > 0;
}

function isLandscape() {
  return window.matchMedia("(orientation: landscape)").matches;
}

function updateRotateOverlay() {
  const shouldShow = isTouchDevice() && isLandscape();
  rotateOverlay.classList.toggle("visible", shouldShow);
}

window.addEventListener("resize", updateRotateOverlay);
window.addEventListener("orientationchange", updateRotateOverlay);
updateRotateOverlay();
