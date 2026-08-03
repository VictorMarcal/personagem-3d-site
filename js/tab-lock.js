// Bloqueio entre abas/janelas do MESMO dispositivo, via localStorage +
// heartbeat (nao cross-device - duas abas em DOIS telemoveis diferentes
// nao sao detetadas, isso exigiria um lock centralizado no Supabase, fora
// de escopo por agora). Serve para evitar que duas abas do mesmo telemovel
// tenham um treino ou uma luta ativos ao mesmo tempo, cada uma a contar a
// mesma distancia/vitoria em separado e a somar tudo em dobro ao progresso
// partilhado.
//
// Cada aba tem um id aleatorio proprio; uma aba so consegue reclamar um
// bloqueio se nao houver outra aba VIVA a segura-lo (heartbeat recente -
// uma aba fechada/crashada liberta o bloqueio ao fim de TAB_LOCK_STALE_MS,
// para nunca ficar preso para sempre por uma aba que desapareceu sem
// libertar corretamente).
//
// Guardado em sessionStorage (nao gerado de novo a cada carregamento):
// sessionStorage sobrevive a um refresh da MESMA aba mas comeca vazio numa
// aba genuinamente nova - sem isto, um simples F5 na aba com o treino ativo
// gerava um TAB_ID novo, que via o bloqueio deixado por si propria (antes
// do refresh, com heartbeat ainda recente) como pertencendo a "outra aba
// viva" e recusava-se a retomar - o treino em curso parecia perdido (a
// pagina voltava ao ecra inicial) ate o bloqueio expirar sozinho.
const TAB_ID_SESSION_KEY = "personagem.tabId";
const TAB_ID = (function getOrCreateTabId() {
  let id = sessionStorage.getItem(TAB_ID_SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(TAB_ID_SESSION_KEY, id);
  }
  return id;
})();
const TAB_LOCK_STALE_MS = 15000;

function claimTabLock(storageKey) {
  const raw = localStorage.getItem(storageKey);
  if (raw) {
    try {
      const lock = JSON.parse(raw);
      if (lock.tabId !== TAB_ID && Date.now() - lock.heartbeatAt < TAB_LOCK_STALE_MS) {
        return false; // outra aba viva ja tem o bloqueio
      }
    } catch (e) {
      // bloqueio corrompido - ignora e reclama por cima
    }
  }
  localStorage.setItem(storageKey, JSON.stringify({ tabId: TAB_ID, heartbeatAt: Date.now() }));
  return true;
}

// Chamado periodicamente enquanto a atividade (treino/luta) continua nesta
// aba, para o bloqueio nao expirar por engano so por a atividade demorar
// mais que TAB_LOCK_STALE_MS.
function refreshTabLock(storageKey) {
  localStorage.setItem(storageKey, JSON.stringify({ tabId: TAB_ID, heartbeatAt: Date.now() }));
}

// So liberta se o bloqueio ainda for desta aba - nunca apaga por engano o
// bloqueio de outra aba que entretanto o tenha reclamado.
function releaseTabLock(storageKey) {
  const raw = localStorage.getItem(storageKey);
  if (!raw) return;
  try {
    const lock = JSON.parse(raw);
    if (lock.tabId === TAB_ID) localStorage.removeItem(storageKey);
  } catch (e) {
    localStorage.removeItem(storageKey);
  }
}
