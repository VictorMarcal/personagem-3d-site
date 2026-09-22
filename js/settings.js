// Menu de Definicoes (2026-09-22, a pedido - "quero adicionar um menu de
// settings a app"): engrenagem no canto superior direito do cabecalho, com
// "Dar feedback" e "Sair". signOutBootlands() vive em js/profile.js
// (partilhada com o botao de Sair que ja existia em Perfil > Conta).

const btnSettingsMenu = document.getElementById("btn-settings-menu");
const settingsMenuEl = document.getElementById("settings-menu");

function closeSettingsMenu() {
  settingsMenuEl.classList.add("hidden");
  btnSettingsMenu.setAttribute("aria-expanded", "false");
}

btnSettingsMenu.addEventListener("click", (e) => {
  e.stopPropagation();
  const abrir = settingsMenuEl.classList.contains("hidden");
  settingsMenuEl.classList.toggle("hidden", !abrir);
  btnSettingsMenu.setAttribute("aria-expanded", String(abrir));
});

// Qualquer clique fora do menu fecha-o - mesmo espirito de um <select> nativo.
document.addEventListener("click", (e) => {
  if (!settingsMenuEl.classList.contains("hidden") && !settingsMenuEl.contains(e.target)) {
    closeSettingsMenu();
  }
});

document.getElementById("btn-settings-sign-out").addEventListener("click", () => {
  closeSettingsMenu();
  signOutBootlands();
});

// --- Dar feedback ----------------------------------------------------------
//
// Cartao Trello "Sistema de feedback dentro da app" (coluna Ideias): campo de
// texto + screenshot opcional + enviar. Guardado em feedback_reports
// (Supabase) com jogador, versao e navegador - o Victor pede para "ver os
// feedbacks" de vez em quando, e essa leitura/passagem para o Trello e feita
// a partir da base de dados diretamente, nao daqui.
const FEEDBACK_SCREENSHOT_MAX_BYTES = 5 * 1024 * 1024;

const feedbackModalEl = document.getElementById("feedback-modal");
const feedbackMessageEl = document.getElementById("feedback-message");
const feedbackScreenshotInputEl = document.getElementById("feedback-screenshot");
const feedbackPreviewEl = document.getElementById("feedback-preview");
const feedbackPreviewImgEl = document.getElementById("feedback-preview-img");
const btnFeedbackRemoveImage = document.getElementById("btn-feedback-remove-image");
const btnFeedbackSubmit = document.getElementById("btn-feedback-submit");
const feedbackStatusEl = document.getElementById("feedback-status");

let feedbackScreenshotFile = null;
let feedbackPreviewUrl = null;

function updateFeedbackSubmitState() {
  btnFeedbackSubmit.disabled = feedbackMessageEl.value.trim().length === 0;
}

function clearFeedbackScreenshot() {
  feedbackScreenshotFile = null;
  feedbackScreenshotInputEl.value = "";
  if (feedbackPreviewUrl) URL.revokeObjectURL(feedbackPreviewUrl);
  feedbackPreviewUrl = null;
  feedbackPreviewEl.classList.add("hidden");
}

function openFeedbackModal() {
  closeSettingsMenu();
  feedbackMessageEl.value = "";
  clearFeedbackScreenshot();
  feedbackStatusEl.textContent = "";
  updateFeedbackSubmitState();
  feedbackModalEl.classList.remove("hidden");
}

function closeFeedbackModal() {
  feedbackModalEl.classList.add("hidden");
}

document.getElementById("btn-open-feedback").addEventListener("click", openFeedbackModal);
document.getElementById("btn-close-feedback").addEventListener("click", closeFeedbackModal);
feedbackMessageEl.addEventListener("input", updateFeedbackSubmitState);
btnFeedbackRemoveImage.addEventListener("click", clearFeedbackScreenshot);

feedbackScreenshotInputEl.addEventListener("change", () => {
  const file = feedbackScreenshotInputEl.files[0];
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    feedbackStatusEl.textContent = "Só imagens, por favor.";
    feedbackScreenshotInputEl.value = "";
    return;
  }
  if (file.size > FEEDBACK_SCREENSHOT_MAX_BYTES) {
    feedbackStatusEl.textContent = "Imagem demasiado grande (máx. 5 MB).";
    feedbackScreenshotInputEl.value = "";
    return;
  }

  feedbackStatusEl.textContent = "";
  feedbackScreenshotFile = file;
  if (feedbackPreviewUrl) URL.revokeObjectURL(feedbackPreviewUrl);
  feedbackPreviewUrl = URL.createObjectURL(file);
  feedbackPreviewImgEl.src = feedbackPreviewUrl;
  feedbackPreviewEl.classList.remove("hidden");
});

document.getElementById("btn-feedback-submit").addEventListener("click", async () => {
  const mensagem = feedbackMessageEl.value.trim();
  if (!mensagem || !currentUserId) return;

  btnFeedbackSubmit.disabled = true;
  feedbackStatusEl.textContent = "A enviar...";

  let screenshotPath = null;
  if (feedbackScreenshotFile) {
    const extensao = (feedbackScreenshotFile.name.split(".").pop() || "png").toLowerCase().slice(0, 5);
    const caminho = `${currentUserId}/${Date.now()}.${extensao}`;
    const { error: erroUpload } = await supabaseClient.storage
      .from("feedback-screenshots")
      .upload(caminho, feedbackScreenshotFile, { contentType: feedbackScreenshotFile.type });
    // Uma imagem que falhe a enviar nao deve perder o texto do feedback -
    // segue-se sem ela, so se avisa no fim.
    if (!erroUpload) screenshotPath = caminho;
  }

  const { error } = await supabaseClient.from("feedback_reports").insert({
    user_id: currentUserId,
    display_name: (currentProfile && currentProfile.display_name) || null,
    mensagem,
    screenshot_path: screenshotPath,
    user_agent: navigator.userAgent,
    app_version: document.getElementById("site-version").textContent,
  });

  if (error) {
    btnFeedbackSubmit.disabled = false;
    feedbackStatusEl.textContent = "Não foi possível enviar. Tenta novamente.";
    return;
  }

  closeFeedbackModal();
  const avisoImagem = feedbackScreenshotFile && !screenshotPath ? " (a imagem não chegou a enviar-se)" : "";
  showGameToast("Obrigado pelo feedback!" + avisoImagem, "medalha");
});
