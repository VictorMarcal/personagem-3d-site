// Constantes de equilibrio do jogo (bases, expoentes, passos de nivel,
// filtros de GPS, etc). Carrega-se antes de equipment.js/experience.js/
// monsters.js porque estes chamam os getters logo na primeira renderizacao.
//
// SUBSTITUIU O CARD DE DEBUG (2026-08-14, a pedido: "destroi todo o debug
// que so esta a dar problemas"). Ate aqui estes valores tinham override
// persistido em localStorage, editavel num card so para admin. Parecia
// inofensivo - eram "afinacoes" - mas LEVEL_BASE e LEVEL_EXP definem a
// CURVA DE NIVEIS, e os overrides nunca eram sincronizados entre
// dispositivos nem com o servidor.
//
// Bug real que motivou a remocao: um dispositivo tinha LEVEL_BASE=500
// guardado localmente enquanto o padrao no codigo era 70. O mesmo jogador,
// com exatamente as mesmas calorias na base de dados, aparecia no nivel 4
// nesse telemovel e no nivel 9 em qualquer outro sitio - e nada no ecra
// dava a entender porque. Perdeu-se bastante tempo a procurar um problema
// de sincronizacao que nao existia: os dados estavam certos, a formula e
// que era diferente em cada lado.
//
// Sem overrides, estes valores sao os mesmos para toda a gente, sempre.
// Afinar passa a ser editar este ficheiro e fazer deploy - o que e o
// correto para numeros que definem a economia do jogo.

// Nivel 1: 500 XP (= 500 kcal) para subir. LEVEL_BASE multiplica o custo de
// TODOS os niveis (o incremento e proporcional), nao so do primeiro - o
// nivel e sempre recalculado ao vivo a partir das calorias vitalicias,
// nunca guardado por si so, por isso mudar isto reavalia todo o historico
// de imediato e sem migracao.
const LEVEL_BASE = 500;
const LEVEL_EXP = 1.3;

// Curvas de status dos MONSTROS (computeCreatureStatValue, js/monsters.js).
// Ataque e Defesa trocam de curva de crescimento (decisao tomada ao
// discutir o sistema de duelos): Ataque cresce como a Defesa crescia antes,
// e vice-versa, para o dano de combate nunca ficar negativo.
const STAT_BASE = { vida: 100, ataque: 50, defesa: 10 };
const STAT_FLAT = { vida: 4, ataque: 2, defesa: 2 };
const STAT_PERCENT = { vida: 0.89, ataque: 0.45, defesa: 0.16 };

// Sistema de status do JOGADOR (2026-08-04) - distinto do dos monstros
// acima. Vida/Ataque/Defesa = base fixa + bonus do equipamento + (nivel do
// status investido)^expoente. Expoente > 1 da uma curva que acelera mas sem
// explodir como uma exponencial pura (testado - base^nivel chegava a
// centenas de quatriloes no nivel 100). Ver secção 7 da documentação.
const PLAYER_BASE_VIDA = 100;
const PLAYER_BASE_ATAQUE = 10;
const PLAYER_BASE_DEFESA = 10;
const ENERGIA_EXPONENT = 1.8;
const FORCA_EXPONENT = 1.5;
const RESISTENCIA_EXPONENT = 1.2;

// Destreza/Letalidade/Regeneracao: cada uma alimentada pelo nivel investido
// no status correspondente (Resistencia/Forca/Energia) + o bonus secundario
// da peca de equipamento que a governa (Escudo/Arma/Armadura), na forma
// "base + (nivel + bonus)^expoente". Resultado em pontos percentuais,
// exceto Regeneracao (vida/segundo).
const DESTREZA_BASE = 2;
const DESTREZA_EXPONENT = 0.56;
const LETALIDADE_BASE = 1;
const LETALIDADE_EXPONENT = 0.639;
// Multiplicador de dano num critico - ignora Defesa por completo e nao tem
// variacao aleatoria (ao contrario do dano normal).
const LETALIDADE_MULTIPLICADOR = 1.5;
const REGENERACAO_BASE = 0.2;
const REGENERACAO_EXPONENT = 0.8;

const LEVEL_UP_POINTS = 1;

// --- Filtros de GPS (secção 4) --------------------------------------------
const MAX_ACCURACY_M = 20;
const MIN_MOVEMENT_M = 3;
// Teto de seguranca UNICO (2026-08-10, substitui os tetos/pisos por modo que
// existiam antes de haver deteccao automatica de atividade, secção 4.1) - so
// filtra erro de GPS/veiculo (nenhum humano sustem isto a pe/de bicicleta),
// nao decide esforco (isso e a formula MET, por velocidade real de cada
// segmento).
const MAX_SAFE_SPEED_KMH = 45;

// Limiares que classificam cada segmento por atividade (pela velocidade
// media de uma janela deslizante) - so escolhem QUAL formula MET usar
// (andar/correr/bicicleta), ja nao bloqueiam nada.
const ACTIVITY_STOPPED_MAX_KMH = 2;
const ACTIVITY_WALK_MAX_KMH = 6.5;
const ACTIVITY_RUN_MAX_KMH = 14;

// Janela deslizante (s) da velocidade media que alimenta a classificacao
// acima - evita reclassificar a cada oscilacao pontual (ex: parar num
// semaforo). Historese (s) - so muda de categoria depois de estar
// continuamente na nova faixa por este tempo. Descidos de 45/25 para 20/8
// (2026-08-11, corrigido a pedido - "demora muito tempo para detetar entre
// treino e parado... 30 segundos ate detetar que estava a caminhar"): os
// dois atrasos somavam-se, dando perto dos 30s sentidos na pratica.
const ACTIVITY_WINDOW_SECONDS = 20;
const ACTIVITY_HYSTERESIS_SECONDS = 8;

// Desempate por acelerometro (2026-08-12, secção 4.3): so a velocidade nao
// distingue "pernas a mexer" de "rodas a rolar" - a subir de bicicleta
// devagar a velocidade cai nas faixas de caminhar/correr. Desvio-padrao
// (m/s2) da magnitude da aceleracao acima do qual se considera que HA
// passada. ATENCAO: os primeiros dados reais (2026-08-14) mostram que este
// valor NAO separa as duas atividades - pedalar mediu 4.26 e caminhar 5.83,
// ambos muito acima de 1.2, por isso o desempate praticamente nunca dispara.
// O discriminador certo e a frequencia (cadencia da passada), nao a
// amplitude. Por resolver - ver secção 4.3.
const STEP_SIGNAL_THRESHOLD_MS2 = 1.2;

// Resolucao H3 dos hexagonos de descoberta (secção 18). 9 = ~427m de
// diametro, ~0.11 km2, ~14 hexagonos numa caminhada de 5km - medido, nao
// estimado. A 8 (1122m) seriam so ~5 por caminhada, grosseiro demais; a 10
// (160m) seriam ~37, acende dezenas so a dar a volta ao quarteirao.
// ATENCAO: os IDs H3 sao especificos da resolucao - mudar isto NAO apaga o
// historico (a coluna `resolution` fica gravada em cada linha), mas as
// celulas ja descobertas noutra resolucao deixam de contar.
const HEX_RESOLUTION = 9;

// --- Monstros e combate (secções 8 e 9) -----------------------------------
const MINI_BOSS_LEVEL_STEP = 5;
const BOSS_LEVEL_STEP = 10;
const MAX_LEVEL_TO_GENERATE = 100;
const MINI_BOSS_MAX_POINTS = 3;
const BOSS_MAX_POINTS = 5;
const BATTLE_DEFENSE_PERCENT = 0.6;
const BATTLE_FLOOR_PERCENT = 0.5;
const DAMAGE_VARIANCE_MIN = 0.8;
// % da Vida MAXIMA do monstro recuperada a cada troca de ataques durante a
// luta. Percentagem em vez de vida/segundo (como o jogador) porque os
// monstros nao tem status de Energia para alimentar essa formula - uma % da
// propria Vida maxima escala com o nivel/arquetipo sem precisar de um numero
// fixo por monstro.
const MONSTER_REGEN_PERCENT = 1;

// --- Getters -------------------------------------------------------------
// Mantidos com a mesma assinatura de quando havia overrides no localStorage,
// para o resto do codigo nao precisar de mudar. Hoje devolvem constantes.
function getLevelBase() { return LEVEL_BASE; }
function getLevelExp() { return LEVEL_EXP; }
function getStatBase(type) { return STAT_BASE[type]; }
function getStatFlat(type) { return STAT_FLAT[type]; }
function getStatPercent(type) { return STAT_PERCENT[type]; }

function getPlayerBaseVida() { return PLAYER_BASE_VIDA; }
function getPlayerBaseAtaque() { return PLAYER_BASE_ATAQUE; }
function getPlayerBaseDefesa() { return PLAYER_BASE_DEFESA; }
function getEnergiaExponent() { return ENERGIA_EXPONENT; }
function getForcaExponent() { return FORCA_EXPONENT; }
function getResistenciaExponent() { return RESISTENCIA_EXPONENT; }
function getDestrezaBase() { return DESTREZA_BASE; }
function getDestrezaExponent() { return DESTREZA_EXPONENT; }
function getLetalidadeBase() { return LETALIDADE_BASE; }
function getLetalidadeExponent() { return LETALIDADE_EXPONENT; }
function getLetalidadeMultiplicador() { return LETALIDADE_MULTIPLICADOR; }
function getRegeneracaoBase() { return REGENERACAO_BASE; }
function getRegeneracaoExponent() { return REGENERACAO_EXPONENT; }

function getLevelUpPoints() { return LEVEL_UP_POINTS; }
function getMaxAccuracyM() { return MAX_ACCURACY_M; }
function getMinMovementM() { return MIN_MOVEMENT_M; }
function getMaxSafeSpeedKmh() { return MAX_SAFE_SPEED_KMH; }
function getMaxSafeSpeedMps() { return MAX_SAFE_SPEED_KMH / 3.6; }
function getActivityStoppedMaxKmh() { return ACTIVITY_STOPPED_MAX_KMH; }
function getActivityWalkMaxKmh() { return ACTIVITY_WALK_MAX_KMH; }
function getActivityRunMaxKmh() { return ACTIVITY_RUN_MAX_KMH; }
function getActivityWindowSeconds() { return ACTIVITY_WINDOW_SECONDS; }
function getActivityHysteresisSeconds() { return ACTIVITY_HYSTERESIS_SECONDS; }
function getStepSignalThresholdMs2() { return STEP_SIGNAL_THRESHOLD_MS2; }
function getHexResolution() { return HEX_RESOLUTION; }
function getMiniBossLevelStep() { return MINI_BOSS_LEVEL_STEP; }
function getBossLevelStep() { return BOSS_LEVEL_STEP; }
function getMaxLevelToGenerate() { return MAX_LEVEL_TO_GENERATE; }
function getMiniBossMaxPoints() { return MINI_BOSS_MAX_POINTS; }
function getBossMaxPoints() { return BOSS_MAX_POINTS; }
function getBattleDefensePercent() { return BATTLE_DEFENSE_PERCENT; }
function getBattleFloorPercent() { return BATTLE_FLOOR_PERCENT; }
function getDamageVarianceMin() { return DAMAGE_VARIANCE_MIN; }
function getMonsterRegenPercent() { return MONSTER_REGEN_PERCENT; }

// --- Re-render geral ------------------------------------------------------
// Chamada no fim do arranque pos-login (js/auth.js), depois de o progresso
// ser reconciliado, e no fim de um reset de personagem. Nao tem nada de
// "debug" - so garante que tudo o que depende do progresso e redesenhado de
// uma vez (antes chamava-se refreshAllAfterConfigChange, do tempo em que
// tambem corria ao guardar variaveis no card de Debug).
function refreshAllUi() {
  // Passa as calorias da sessao em curso, se houver treino ativo, pela
  // mesma razao de js/training.js beginWatch(): a barra de nivel nunca deve
  // mostrar uma previa que ainda pode ser perdida.
  updateXPDisplay(typeof sessionCaloriesKcal === "number" ? sessionCaloriesKcal : 0);
  renderStatsHud();
  renderMonsters();
  renderAchievementsSummary();
  renderTodaysTrainings();
}

// --- Repor personagem -----------------------------------------------------
// Botao na aba Perfil (js/profile.js) - visivel a qualquer jogador, nao so a
// admin. Apaga nivel, status, pontos, equipamento, moedas, conquistas,
// historico de treinos e territorios descobertos.
function resetCharacterAndDistance() {
  const confirmed = confirm(
    "Isto vai repor o nível, os status, os pontos e toda a distância percorrida. Não pode ser desfeito. Continuar?"
  );
  if (!confirmed) return;

  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
  if (saveIntervalId !== null) {
    clearInterval(saveIntervalId);
    saveIntervalId = null;
  }

  localStorage.removeItem(STORAGE_KEY_LIFETIME_M);
  localStorage.removeItem(STORAGE_KEY_LIFETIME_KCAL);
  localStorage.removeItem(STORAGE_KEY_MONTHLY_KCAL);
  localStorage.removeItem(STORAGE_KEYS_EQUIPMENT.pontosDisponiveis);
  localStorage.removeItem(STORAGE_KEYS_EQUIPMENT.nivelEquipVida);
  localStorage.removeItem(STORAGE_KEYS_EQUIPMENT.nivelEquipAtaque);
  localStorage.removeItem(STORAGE_KEYS_EQUIPMENT.nivelEquipDefesa);
  localStorage.removeItem(STORAGE_KEYS_EQUIPMENT.nivelEnergia);
  localStorage.removeItem(STORAGE_KEYS_EQUIPMENT.nivelForca);
  localStorage.removeItem(STORAGE_KEYS_EQUIPMENT.nivelResistencia);
  localStorage.removeItem(STORAGE_KEY_MOEDAS);
  localStorage.removeItem(STORAGE_KEY_WEAPON_LEVEL);
  localStorage.removeItem(STORAGE_KEY_SHIELD_LEVEL);
  localStorage.removeItem(STORAGE_KEY_ARMOR_LEVEL);
  localStorage.removeItem(STORAGE_KEYS_EQUIPMENT.ultimoNivelPremiado);
  localStorage.removeItem(STORAGE_KEYS.active);
  localStorage.removeItem(STORAGE_KEYS.distanciaAcumuladaM);
  localStorage.removeItem(STORAGE_KEYS.ultimaPosicao);
  localStorage.removeItem(STORAGE_KEYS.inicioSessao);
  localStorage.removeItem(STORAGE_KEY_DEFEATED_CREATURES);
  localStorage.removeItem(STORAGE_KEY_UNLOCKED_ACHIEVEMENTS);
  localStorage.removeItem(STORAGE_KEY_BEST_SESSION_DISTANCE_M);
  localStorage.removeItem(STORAGE_KEY_TOTAL_TRAININGS);
  localStorage.removeItem(STORAGE_KEY_CURRENT_HP);
  localStorage.removeItem(STORAGE_KEY_HP_LAST_UPDATE);
  localStorage.removeItem(STORAGE_KEY_SESSION_QUEUE);
  localStorage.removeItem(STORAGE_KEY_BEST_PACE_MPS);
  localStorage.removeItem(STORAGE_KEY_BEST_STREAK_DAYS);
  localStorage.removeItem(STORAGE_KEY_MONTHLY_DISTANCE_M);
  localStorage.removeItem(STORAGE_KEY_MONTH_REFERENCE);
  localStorage.removeItem(STORAGE_KEY_ENCOUNTERED_CREATURES);
  localStorage.removeItem(STORAGE_KEY_DISCARDED_SPEED_M);
  localStorage.removeItem(STORAGE_KEY_TOTAL_MOEDAS_GANHAS);
  localStorage.removeItem(STORAGE_KEY_TOTAL_MOEDAS_GASTAS);
  localStorage.removeItem(STORAGE_KEY_TOTAL_BATTLES);
  localStorage.removeItem(STORAGE_KEY_DISTINCT_MONTHS_TRAINED);
  localStorage.removeItem(STORAGE_KEY_DISCOVERED_HEXES);
  localStorage.removeItem(STORAGE_KEY_DISCOVERED_HEXES_QUEUE);

  // O historico de treinos (aba Perfil) e os territorios descobertos vivem
  // em tabelas a parte - sem isto o reset local nao lhes mexia e ambos
  // voltavam a aparecer no proximo login a partir do Supabase.
  if (currentUserId) {
    supabaseClient
      .from("training_sessions")
      .delete()
      .eq("user_id", currentUserId)
      .then(({ error }) => {
        if (error) console.warn("Falha ao apagar historico de treinos:", error);
      });
    supabaseClient
      .from("discovered_hexes")
      .delete()
      .eq("user_id", currentUserId)
      .then(({ error }) => {
        if (error) console.warn("Falha ao apagar territorios descobertos:", error);
      });
  }

  totalDistanceM = 0;
  lastPosition = null;
  lastCountedPosition = null;
  sessionStartTime = null;

  updateDistanceDisplay();
  showStartScreen();
  refreshAllUi();
  queueProgressSync();
}
