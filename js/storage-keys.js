// Chaves de localStorage para o progresso do personagem (personagem.*).
// Centralizadas aqui porque js/auth.js precisa de as ler/escrever antes
// dos ficheiros que historicamente as declaravam (equipment/experience/
// monsters/achievements), que continuam a ser os donos da lógica.
const STORAGE_KEY_LIFETIME_M = "personagem.distanciaTotalM";

// Calorias vitalicias (2026-08-10, secção 17.1 da documentação) - passa a
// ser a unidade base do nivel/XP (substitui STORAGE_KEY_LIFETIME_M nesse
// papel, que continua a existir so como estatistica informativa de
// distancia real). STORAGE_KEY_MONTHLY_KCAL e o equivalente mensal de
// STORAGE_KEY_MONTHLY_DISTANCE_M, usado no leaderboard/medalhas mensais.
const STORAGE_KEY_LIFETIME_KCAL = "personagem.caloriasTotaisKcal";
const STORAGE_KEY_MONTHLY_KCAL = "personagem.caloriasMesAtualKcal";

// Recorde de calorias numa unica sessao (secção 10 - conquistas de
// calorias, 2026-08-10) - nao separado por modo (calorias ja normalizam
// esforco entre modos, ao contrario da distancia de sessao acima).
const STORAGE_KEY_BEST_SESSION_CALORIES_KCAL = "personagem.melhorSessaoCaloriasKcal";

const STORAGE_KEYS_EQUIPMENT = {
  pontosDisponiveis: "personagem.pontosDisponiveis",
  ultimoNivelPremiado: "personagem.ultimoNivelPremiado",
  // Status investidos com pontos (2026-08-04, substituem os niveis diretos
  // de Vida/Ataque/Defesa): Energia->Vida+Regeneracao, Forca->Ataque+Letalidade,
  // Resistencia->Defesa+Destreza (secção 6/7 da documentação). Comecam em 0
  // (nunca investido), ao contrario dos niveis antigos que comecavam em 1 -
  // aqui 0 pontos = 0 bonus extra, sem valor de base embutido.
  nivelEnergia: "personagem.nivelEnergia",
  nivelForca: "personagem.nivelForca",
  nivelResistencia: "personagem.nivelResistencia",
  // Antigas (nivelEquipVida/Ataque/Defesa) - mantidas so para nao apagar
  // dados de quem ja tinha pontos investidos; deixam de ser escritas ou
  // lidas pelo sistema novo.
  nivelEquipVida: "personagem.nivelEquipVida",
  nivelEquipAtaque: "personagem.nivelEquipAtaque",
  nivelEquipDefesa: "personagem.nivelEquipDefesa",
};

// Moedas (2026-08-04 - secção 7/16 da documentação): oferta inicial de 100,
// ganhas a treinar, a derrotar mini-bosses/bosses e a desbloquear
// conquistas; gastas a evoluir o nivel de melhoria da arma atual.
const STORAGE_KEY_MOEDAS = "personagem.moedas";

// Nivel de melhoria (1-99) de cada peca de equipamento (2026-08-05 -
// substitui por completo o sistema anterior de 10 tiers + posse/drop por
// peca): Arma/Escudo/Armadura sao agora uma peca so por tipo, que sobe de
// nivel gastando moedas (nunca por drop/RNG), ate ao nivel de personagem
// atual (nao pode ultrapassar-se a si proprio) ou ao maximo de 99. Um
// numero simples por peca, nao um mapa - ver secção 7 da documentação.
const STORAGE_KEY_WEAPON_LEVEL = "personagem.nivelArma";
const STORAGE_KEY_SHIELD_LEVEL = "personagem.nivelEscudo";
const STORAGE_KEY_ARMOR_LEVEL = "personagem.nivelArmadura";

const STORAGE_KEY_DEFEATED_CREATURES = "personagem.monstrosDerrotados";

// Criaturas com que ja se entrou em combate pelo menos uma vez (ganhando
// ou perdendo) - controla se a Vida aparece revelada no card ou como "****".
const STORAGE_KEY_ENCOUNTERED_CREATURES = "personagem.criaturasEncontradas";

const STORAGE_KEY_UNLOCKED_ACHIEVEMENTS = "personagem.conquistasDesbloqueadas";

// Recorde de distancia de sessao, por modo de treino (js/achievements.js
// generateSessionDistanceAchievements) - Correr reaproveita a chave ja
// existente sem sufixo (era o unico modo antes de existirem 3), Caminhar/
// Bicicleta sao registos novos, comecam do zero.
const STORAGE_KEY_BEST_SESSION_DISTANCE_M = "personagem.melhorDistanciaSessaoM";
const STORAGE_KEY_BEST_SESSION_DISTANCE_M_CAMINHAR = "personagem.melhorDistanciaSessaoM.caminhar";
const STORAGE_KEY_BEST_SESSION_DISTANCE_M_BICICLETA = "personagem.melhorDistanciaSessaoM.bicicleta";

const STORAGE_KEY_TOTAL_TRAININGS = "personagem.totalTreinosConcluidos";

// Contadores vitalícios para novas conquistas (2026-08-07, a pedido) -
// distintos dos valores "atuais" já existentes (moedas/luta), que sobem E
// descem: estes só sobem, nunca são reduzidos por gastar moedas ou perder
// uma luta.
const STORAGE_KEY_TOTAL_MOEDAS_GANHAS = "personagem.totalMoedasGanhas";
const STORAGE_KEY_TOTAL_MOEDAS_GASTAS = "personagem.totalMoedasGastas";
const STORAGE_KEY_TOTAL_BATTLES = "personagem.totalLutas";

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

// Numero de meses de calendario DISTINTOS com pelo menos um treino, nunca
// diminui (2026-08-07, conquista "meses treinados") - mesmo padrao de
// cache local de STORAGE_KEY_BEST_STREAK_DAYS acima, recalculado sempre que
// o historico completo de sessoes chega (checkFrequencyAchievementsFromSessions).
const STORAGE_KEY_DISTINCT_MONTHS_TRAINED = "personagem.mesesDistintosTreinados";

// Melhor ritmo (m/s), tambem por modo de treino (mesmo padrao do recorde
// de distancia de sessao acima) - Correr reaproveita a chave ja existente.
const STORAGE_KEY_BEST_PACE_MPS = "personagem.melhorRitmoMps";
const STORAGE_KEY_BEST_PACE_MPS_CAMINHAR = "personagem.melhorRitmoMps.caminhar";
const STORAGE_KEY_BEST_PACE_MPS_BICICLETA = "personagem.melhorRitmoMps.bicicleta";

// Contador de distancia do mes de calendario corrente, espelha
// leaderboard.monthly_distance_m - usado pelas medalhas mensais
// (js/monthly-medals.js).
const STORAGE_KEY_MONTHLY_DISTANCE_M = "personagem.distanciaMesAtual";
const STORAGE_KEY_MONTH_REFERENCE = "personagem.mesReferencia";

// Soma vitalicia de distancia descartada por exceder MAX_SPEED_KMH (ver
// js/training.js) - nunca conta para a experiencia/leaderboard, so serve
// para o jogador ver quanto ficou de fora por ir depressa demais.
const STORAGE_KEY_DISCARDED_SPEED_M = "personagem.distanciaAnuladaVelocidadeM";

// Bloqueios entre abas do mesmo dispositivo (ver js/tab-lock.js) - evitam
// duas abas terem um treino ou uma luta ativos ao mesmo tempo, cada uma a
// contar/pagar a mesma coisa em separado.
const STORAGE_KEY_TRAINING_TAB_LOCK = "treino.lockAba";
const STORAGE_KEY_BATTLE_TAB_LOCK = "personagem.lockBatalhaAba";

// Peso corporal do jogador (kg), editavel no Perfil - pre-requisito da
// formula de calorias/MET planeada (secção 17 da documentação). Omissão
// de 70kg para quem ainda não preencheu (DEFAULT_WEIGHT_KG, js/equipment.js).
const STORAGE_KEY_WEIGHT_KG = "personagem.pesoKg";

// Hexagonos H3 ja descobertos (secção 18) - cache local do que esta em
// discovered_hexes no Supabase, mais uma fila do que ainda falta enviar
// (mesmo padrao de training_sessions: cada descoberta e um evento discreto,
// nao um snapshot, por isso nao pode simplesmente ser reenviada por cima).
const STORAGE_KEY_DISCOVERED_HEXES = "personagem.hexagonosDescobertos";
const STORAGE_KEY_DISCOVERED_HEXES_QUEUE = "personagem.hexagonosPorEnviar";

// Distritos ja identificados a partir dos hexagonos (secção 18.1) - guarda
// nome + fronteira vinda do Nominatim, mais a lista de zonas grandes ja
// perguntadas. E uma CACHE de um servico externo com limite de 1 pedido por
// segundo: sem isto, abrir o mapa dispararia pedidos de cada vez.
const STORAGE_KEY_DISTRICTS = "personagem.distritosDescobertos";
