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
const TAB_ID = crypto.randomUUID();
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
