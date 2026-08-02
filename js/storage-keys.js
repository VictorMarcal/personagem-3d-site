// Chaves de localStorage para o progresso do personagem (personagem.*).
// Centralizadas aqui porque js/auth.js precisa de as ler/escrever antes
// dos ficheiros que historicamente as declaravam (equipment/experience/
// monsters/achievements), que continuam a ser os donos da lógica.
const STORAGE_KEY_LIFETIME_M = "personagem.distanciaTotalM";

const STORAGE_KEYS_EQUIPMENT = {
  pontosDisponiveis: "personagem.pontosDisponiveis",
  nivelEquipVida: "personagem.nivelEquipVida",
  nivelEquipAtaque: "personagem.nivelEquipAtaque",
  nivelEquipDefesa: "personagem.nivelEquipDefesa",
  ultimoNivelPremiado: "personagem.ultimoNivelPremiado",
};

const STORAGE_KEY_DEFEATED_CREATURES = "personagem.monstrosDerrotados";

// Criaturas com que ja se entrou em combate pelo menos uma vez (ganhando
// ou perdendo) - controla se a Vida aparece revelada no card ou como "****".
const STORAGE_KEY_ENCOUNTERED_CREATURES = "personagem.criaturasEncontradas";

const STORAGE_KEY_UNLOCKED_ACHIEVEMENTS = "personagem.conquistasDesbloqueadas";
const STORAGE_KEY_BEST_SESSION_DISTANCE_M = "personagem.melhorDistanciaSessaoM";
const STORAGE_KEY_TOTAL_TRAININGS = "personagem.totalTreinosConcluidos";

// Fila de sessoes de treino ainda nao confirmadas no Supabase (ver
// js/training.js) - diferente das chaves acima porque cada sessao e um
// evento discreto, nao um valor agregado que pode ser reenviado.
const STORAGE_KEY_SESSION_QUEUE = "personagem.filaSessoesTreino";

// Vida atual do jogador (persiste entre lutas, ao contrario do resto do
// combate) + timestamp da ultima atualizacao, para calcular a recuperacao
// por tempo real decorrido. So local (como debug.*) - e um mecanismo
// anti-spam de batalhas, nao precisa de sincronizar entre dispositivos.
const STORAGE_KEY_CURRENT_HP = "personagem.vidaAtual";
const STORAGE_KEY_HP_LAST_UPDATE = "personagem.vidaUltimaAtualizacao";

// Cache local de valores calculados a partir do Supabase (training_sessions/
// leaderboard), para as conquistas dependentes disso poderem ser lidas de
// forma sincrona pelo checkAndUnlockAchievements() como tudo o resto.
const STORAGE_KEY_BEST_STREAK_DAYS = "personagem.melhorSequenciaDias";
const STORAGE_KEY_BEST_PACE_MPS = "personagem.melhorRitmoMps";

// Contador de distancia do mes de calendario corrente, espelha
// leaderboard.monthly_distance_m - usado pelas medalhas mensais
// (js/monthly-medals.js).
const STORAGE_KEY_MONTHLY_DISTANCE_M = "personagem.distanciaMesAtual";
const STORAGE_KEY_MONTH_REFERENCE = "personagem.mesReferencia";

// Soma vitalicia de distancia descartada por exceder MAX_SPEED_KMH (ver
// js/training.js) - nunca conta para a experiencia/leaderboard, so serve
// para o jogador ver quanto ficou de fora por ir depressa demais.
const STORAGE_KEY_DISCARDED_SPEED_M = "personagem.distanciaAnuladaVelocidadeM";
