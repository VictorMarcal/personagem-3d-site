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
  // de Vida/Ataque/Defesa): Energia->Vida+Regeneracao, Forca->Ataque,
  // Resistencia->Defesa (secção 6/7 da documentação). Comecam em 0
  // (nunca investido), ao contrario dos niveis antigos que comecavam em 1 -
  // aqui 0 pontos = 0 bonus extra, sem valor de base embutido.
  // Velocidade de Ataque/Alcance (2026-09-16, substituem Letalidade/Destreza)
  // deixaram de vir de um status investido - vem diretamente do nivel da
  // Arma/Escudo (computeAttackSpeed/computeAttackRangeM, js/equipment.js).
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

// Nivel de melhoria (1-99) de cada peca de equipamento (2026-08-05 -
// substitui por completo o sistema anterior de 10 tiers + posse/drop por
// peca): Arma/Escudo/Armadura sao agora uma peca so por tipo, que sobe de
// nivel com materiais do mapa (secção 21), ate ao nivel de personagem
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
// existente sem sufixo, Caminhar tem sufixo. A chave `.bicicleta` deixou de
// ser escrita/lida em 2026-09-10 (bicicleta removida a pedido).
const STORAGE_KEY_BEST_SESSION_DISTANCE_M = "personagem.melhorDistanciaSessaoM";
const STORAGE_KEY_BEST_SESSION_DISTANCE_M_CAMINHAR = "personagem.melhorDistanciaSessaoM.caminhar";

const STORAGE_KEY_TOTAL_TRAININGS = "personagem.totalTreinosConcluidos";

// Contador vitalício de lutas travadas (2026-08-07) - só sobe, nunca é
// reduzido por perder uma luta.
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
// `.bicicleta` deixou de ser usada em 2026-09-10.
const STORAGE_KEY_BEST_PACE_MPS = "personagem.melhorRitmoMps";
const STORAGE_KEY_BEST_PACE_MPS_CAMINHAR = "personagem.melhorRitmoMps.caminhar";

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

// Estrelas colecionaveis ja apanhadas (secção 19). As POSICOES nao sao
// guardadas - saem de um gerador determinista semeado no osm_id do concelho
// (js/stars.js); so faz falta saber quais e que ja foram apanhadas.
const STORAGE_KEY_COLLECTED_STARS = "personagem.estrelasApanhadas";

// Economia de recursos (secção 21, 2026-09-07). Substitui as moedas por km.
// hexVisitas: por hexagono, { m: multiplicador, d: dia da ultima visita }.
// recursos: stock atual de cada um. producaoDesde: instante da ultima
// recolha, para o acumulado ser calculado ao vivo em vez de gravado a cada
// hora (a app nao esta aberta a maior parte do tempo).
const STORAGE_KEY_HEX_VISITS = "personagem.hexVisitas";
const STORAGE_KEY_RESOURCES = "personagem.recursos";
const STORAGE_KEY_RESOURCES_SINCE = "personagem.recursosDesde";
const STORAGE_KEY_WAREHOUSE_LEVEL = "personagem.nivelArmazem";

// Minas ja encontradas (secção 21). As POSICOES nao sao guardadas - sao
// deterministas a partir do osm_id do concelho; so faz falta saber quais e
// que ja foram encontradas.
const STORAGE_KEY_MINES = "personagem.minasEncontradas";

// Missoes mensais (secção 22, 2026-09-10). As 9 missoes de cada mes (3
// dificuldades x 3 tipos) sao deterministas a partir do mes (nao guardadas);
// aqui guarda-se so o ESTADO: { mes, ativas: {facil,media,dificil},
// concluidas: ["facil:correr_km", ...], rejeitadaEm: {facil,media,dificil} }.
// `concluidas` passou a guardar "slot:tipo" (2026-09-16, a pedido - permite
// concluir os 3 tipos de cada dificuldade no mesmo mes, nao so 1) - ver
// tipoJaConcluido() em js/missions.js.
const STORAGE_KEY_MISSIONS = "personagem.missoesMensais";

// Contadores VITALICIOS de missoes concluidas (2026-09-16, a pedido -
// medalhas por completar missoes). Ao contrario de STORAGE_KEY_MISSIONS
// acima (mensal, reposto todos os meses), isto nunca e reposto.
// { total, facil, media, dificil, mesesCompletos }. mesesCompletos conta
// quantos meses ja se completaram as 9 missoes desse mes ("Mês Perfeito").
// Ver js/achievements.js (getMissionsLifetimeCounters/
// registarMissaoConcluidaVitalicio, chamada por verificarMissaoAtiva em
// js/missions.js).
const STORAGE_KEY_MISSIONS_LIFETIME = "personagem.missoesConcluidasVitalicio";

// Hordas de inimigos (2026-09-16, a pedido via Trello). So se guarda QUANDO
// e a proxima e QUANTAS ja aconteceram (define quantos monstros a proxima
// traz) - a horda em curso (posicoes/vida dos monstros) nao e persistida,
// tal como uma luta na Masmorra tambem nao sobrevive a um reload.
// { proximaEm: ts, contagem: numero de hordas ja repelidas }.
// Chave renomeada de "personagem.horda" para "personagem.horda2"
// (2026-09-16, a pedido - "reset das hordas, passar para lvl 1 e periodo
// de ataque de 23h") ao sair da fase de testes (1 min) para produção
// (23h) - toda a gente perde a contagem acumulada nos testes e volta a
// ver a horda 1 (1 monstro), sem precisar de acesso a nenhuma base de
// dados (isto e so local, nunca foi sincronizado).
const STORAGE_KEY_HORDE = "personagem.horda2";

// Relatorios de horda (2026-09-16, a pedido - "secção de relatórios
// batalhas"). Lista das ultimas HORDE_REPORTS_MAX hordas (mais recente
// primeiro): [{ data: ts, numero, resultado: "vitoria"|"derrota",
// recursosRoubadosPorRecurso }].
const STORAGE_KEY_HORDE_REPORTS = "personagem.hordaRelatorios";

// Badges de notificacao nos separadores/sub-abas (2026-09-18, a pedido -
// "deve existir um numero... a indicar que houve alguma conquista/
// notificação/relatorio... os numeros desaparecem assim que todas as
// notificações forem vistas"). Guardam so um TIMESTAMP (ms) - "visto ate
// aqui" - nao uma lista de ids: contarConquistasNaoVistas()/
// contarHordaRelatoriosNaoVistos() (js/achievements.js/js/horde.js)
// comparam contra o `unlockedAt`/`data` de cada item. So local (preferencia
// por dispositivo, como ui.separadorAtivo em js/nav.js) - nunca sincronizado,
// visitar a mesma conta noutro aparelho mostra os badges outra vez, aceite
// como o comportamento mais simples.
const STORAGE_KEY_ACHIEVEMENTS_SEEN_AT = "personagem.conquistasVistasEm";
const STORAGE_KEY_HORDE_REPORTS_SEEN_AT = "personagem.hordaRelatoriosVistosEm";

// Badges do separador "Reino" (2026-09-18, a pedido - "vai existir para
// Areas desbloqueadas, para Minas encontradas, para Depositos cheios").
// Mesmo "visto ate um timestamp" das duas de cima, mas concelhos/minas/
// recursos nao tem timestamp proprio nos dados ja sincronizados
// (unlockedConcelhos/minas_encontradas/stock sao so listas/numeros) - por
// isso guarda-se aqui, so localmente, um mapa {id: quando-notei-pela-
// primeira-vez} para cada um. Nunca sincronizado, nao faz falta - e so
// para decidir o que e "novo" neste aparelho.
const STORAGE_KEY_REINO_MAPA_SEEN_AT = "personagem.mapaVistoEm";
const STORAGE_KEY_REINO_ECONOMIA_SEEN_AT = "personagem.economiaVistaEm";
// {osmId: timestamp} - preenchido em computeUnlockedRegions() (js/hexes.js)
// na primeira vez que cada concelho aparece em unlockedConcelhos.
const STORAGE_KEY_CONCELHOS_NOTADOS_EM = "personagem.concelhosNotadosEm";
// {minaId: timestamp} - preenchido em verificarMinas() (js/resources.js) no
// momento em que cada mina e encontrada (paralelo ao STORAGE_KEY_MINES real,
// que so guarda os ids, sem quando).
const STORAGE_KEY_MINAS_NOTADAS_EM = "personagem.minasNotadasEm";
// {recursoId: timestamp} - o momento em que cada recurso TRANSITOU para
// cheio (avisarRecursosCheios(), js/resources-ui.js). Removido quando volta
// a nao estar cheio - um novo enchimento conta como notificacao nova outra
// vez, mesmo padrao de recursosCheiosAvisados (o toast em memoria) so que
// persistente.
const STORAGE_KEY_RECURSOS_CHEIOS_EM = "personagem.recursosCheiosEm";
