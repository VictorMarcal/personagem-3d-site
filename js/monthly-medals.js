// Medalhas mensais (Ouro/Prata/Bronze para o top 3 do leaderboard de cada
// mes de calendario). Depende de globais de js/auth.js (supabaseClient,
// currentUserId, currentDisplayName) e de js/profile.js (formatMonthKey).

function getMonthlyDistanceM() {
  return Number(localStorage.getItem(STORAGE_KEY_MONTHLY_DISTANCE_M)) || 0;
}

function addToMonthlyDistance(deltaM) {
  if (deltaM <= 0) return;
  localStorage.setItem(STORAGE_KEY_MONTHLY_DISTANCE_M, String(getMonthlyDistanceM() + deltaM));
  queueProgressSync();
}

function getMonthReference() {
  return localStorage.getItem(STORAGE_KEY_MONTH_REFERENCE) || formatMonthKey(new Date());
}

function setMonthReference(monthKey) {
  localStorage.setItem(STORAGE_KEY_MONTH_REFERENCE, monthKey);
}
