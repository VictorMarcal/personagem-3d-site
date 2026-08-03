# Personagem 3D — Estado da Arte

> Documento gerado a partir de toda a conversa de desenvolvimento. Descreve o estado atual do projeto: arquitetura, fórmulas, decisões de design e limitações conhecidas.

**Repositório:** [VictorMarcal/personagem-3d-site](https://github.com/VictorMarcal/personagem-3d-site)
**Site publicado:** https://victormarcal.github.io/personagem-3d-site/ (GitHub Pages)

## 1. O que é

Um site que transforma distância percorrida na vida real (GPS) em progressão de um personagem 3D estilo RPG: sobe de nível, ganha pontos de status, evolui equipamento (armadura/arma/escudo), desbloqueia e derrota monstros/bosses em duelos por turnos, e desbloqueia conquistas.

## 2. Stack técnico

- **HTML/CSS/JS puro**, sem framework, sem build step
- **Three.js r142** (build clássica não-modular, via CDN jsDelivr) — escolhida deliberadamente em vez de ES modules porque testes locais via `file://` bloqueiam módulos ES6 por CORS
- **Supabase** (Postgres + Auth + Row Level Security, via CDN `@supabase/supabase-js@2`) — login Google e fonte de verdade do progresso (ver secção 14)
- **`localStorage`** como cache/buffer offline (fonte de verdade era só isto antes do login existir; ver secção 14)
- **GitHub Pages** para hosting estático
- Sem dependências de build (npm, bundlers) — tudo corre diretamente no browser

## 3. Estrutura de ficheiros

| Ficheiro | Responsabilidade |
|---|---|
| `index.html` | Estrutura da página, todos os elementos de UI |
| `css/style.css` | Todo o estilo (tema escuro, mobile-first) |
| `js/storage-keys.js` | Constantes de chaves de `localStorage` do progresso (`personagem.*`) — centralizadas porque `auth.js` precisa delas antes dos ficheiros que historicamente as declaravam |
| `js/tab-lock.js` | Bloqueio entre abas/janelas do mesmo dispositivo (treino e luta) — ver secções 4 e 9 |
| `js/auth.js` | Login Google (Supabase Auth), popup de escolha de nome, gate do card de Debug, orquestração do arranque pós-login |
| `js/progress-sync.js` | Migração/hidratação do progresso local ↔ Supabase, sincronização contínua (`queueProgressSync`) |
| `js/leaderboard.js` | Card de leaderboard: abas Geral/Mensal/Histórico, fila de renderização anti-corrida |
| `js/main.js` | Cena 3D (Three.js): personagem, equipamentos, monstro placeholder, câmara, rotação por arraste, raycasting de equipamento |
| `js/debug.js` | Centraliza **todas** as variáveis afináveis do jogo + ferramentas de debug (reset, simulador de distância) |
| `js/equipment.js` | Stats do personagem, níveis de equipamento, fórmula de valor de status, upgrade, pontos de status |
| `js/experience.js` | Curva de nível do personagem, cálculo de progresso |
| `js/monsters.js` | Geração de monstros/bosses (incl. arquétipos de status), regra de desbloqueio, renderização do carrossel "Batalhas" |
| `js/achievements.js` | Sistema de conquistas, categorias, conquistas de frequência/combate/liderança (incl. os 12 cartões de medalha mensal) |
| `js/monthly-medals.js` | Contador de distância mensal, corte/rollover de mês, medalhas Ouro/Prata/Bronze |
| `js/battle.js` | Lógica de combate por turnos, popup fullscreen de batalha |
| `js/training.js` | GPS, tracking de distância, sessões de treino, filtros de ruído, fila local de sessões pendentes para `training_sessions` |
| `js/profile.js` | Aba de Perfil: navegação Jogo/Perfil, status/equipamento, histórico de treinos, agregados semana/mês, gráficos SVG |
| `js/orientation.js` | Aviso de rodar para retrato em dispositivos touch |
| `supabase/schema.sql` | Referência do schema Postgres (tabelas, RLS) — corre-se manualmente no SQL Editor do Supabase, não é lido pelo site |

Ordem de carregamento dos scripts (importa por causa de dependências entre módulos):
`storage-keys → tab-lock → auth → progress-sync → leaderboard → main → debug → equipment → experience → monsters → monthly-medals → battle → training → profile → achievements → orientation`

`achievements.js` carrega **depois** de `monthly-medals.js` e `profile.js` porque os 12 cartões de medalha mensal (secção 10) dependem de `MONTH_NAMES_PT` (definido em `profile.js`) já estar disponível quando `achievements.js` corre a sua própria renderização inicial no fim do ficheiro.

**Cache do navegador**: todos os `<script src="js/*.js">` locais levam um parâmetro `?v=YYYYMMDD` (ex: `?v=20260731e`). Sem isto, o browser (e por vezes o CDN do GitHub Pages) pode continuar a servir uma versão em cache de um ficheiro `.js` mesmo depois de um novo `git push`, fazendo funcionalidades novas parecerem "mortas" (botões que não fazem nada) até um hard-refresh manual. Sobe-se a data sempre que algum `js/*.js` muda.

## 4. Sistema de treino (GPS)

- Geolocation API (`watchPosition`), distância calculada por **fórmula de Haversine**
- **Filtros anti-ruído** (todos ajustáveis no Debug):
  - `MAX_ACCURACY_M = 20` — ignora leituras de GPS pouco precisas
  - `MIN_MOVEMENT_M = 3` — ignora "deriva" de GPS parado
  - `MAX_SPEED_KMH = 20` — ignora saltos irreais (sem bicicleta por agora, só andar/correr; rejeita também erro de GPS/veículo). Era 30 antes (permitia bicicleta) — baixado a pedido para excluir bicicleta deliberadamente
- **Aviso de velocidade** (`#speed-warning`, `js/training.js`): enquanto uma leitura de GPS excede `MAX_SPEED_KMH`, mostra um aviso persistente ("distância não está a contar") — só desaparece quando uma leitura seguinte volta a ficar dentro do limite (não é um toast com temporizador). Quando um segmento é rejeitado por velocidade, a âncora de posição não avança (mantém-se a última posição válida), então a leitura seguinte é comparada contra ela com mais tempo decorrido - normaliza a velocidade calculada e tende a aceitar de novo assim que o jogador voltar a um ritmo normal
- **Distância anulada por velocidade**: soma vitalícia (`STORAGE_KEY_DISCARDED_SPEED_M`, sincronizada em `player_progress.discarded_speed_distance_m`) de quanto ficou de fora por exceder o limite - nunca conta para XP/leaderboard, só serve para o jogador ver o total. Mostrada no card Resumo da aba Perfil (secção 15)
- Sessão persiste em `localStorage` (checkpoint a cada 10s + save imediato no `pagehide`) e **retoma automaticamente** após um refresh acidental
- Ao parar um treino: soma a distância à experiência vitalícia, incrementa contagem de treinos, atualiza melhor distância de sessão, verifica conquistas
- **Bloqueio entre abas** (`js/tab-lock.js`, secção 9 tem os detalhes do mecanismo): só uma aba do mesmo dispositivo pode ter um treino ativo de cada vez - a segunda fica com um alerta e não arranca um GPS watch próprio. Corrige um bug real em que duas abas do mesmo telemóvel, cada uma com o seu próprio `totalDistanceM` em memória, contavam a mesma distância percorrida em separado e somavam-na em dobro ao progresso vitalício partilhado

## 5. Curva de nível do personagem

```
incremento(n) = round(LEVEL_BASE × n^LEVEL_EXP)
LEVEL_BASE = 500, LEVEL_EXP = 1.3
```

Escolhida para não ser nem linear nem exponencial — os incrementos crescem, mas a taxa de crescimento desacelera.

| Nível | Distância p/ subir | Total acumulado |
|---:|---:|---:|
| 1→2 | 500 m | 500 m |
| 5→6 | 1.118 m | 10.900 m |
| 10→11 | 3.162 m | 38.475 m |
| 16→17 | ~5.809 m | ~118.771 m |
| — | — | **~8.560 km até ao nível 100** |

## 6. Pontos de status

- **Oferta inicial de `STARTING_UNSPENT_POINTS = 4` pontos** (`js/equipment.js`): valor por omissão devolvido só quando a chave de pontos nunca foi gravada (jogadores já existentes, mesmo com 0 pontos gravados, não são afetados retroativamente). Adicionada porque, sem ela, o primeiro mini-boss (nível 5) era matematicamente quase impossível de vencer só com os pontos ganhos a subir de nível até aí — validado por simulação antes de implementar (ver secção 8). Testado primeiro com 3, subido para 4 depois de testes reais
- `LEVEL_UP_POINTS = 1` ponto por cada nível de personagem subido (substituiu o antigo sistema de "quartos": 4 pontos distribuídos a cada 25% de progresso dentro do nível)
- **Mostrado no HUD do personagem** ("Pontos para distribuir: N", `js/equipment.js` `renderStatsHud`) - antes só se percebia que havia pontos pelos botões "+" aparecerem, sem nenhum número explícito
- Pontos só contam com base em **distância confirmada** (nunca a sessão de treino em curso, que pode ainda ser perdida)
- **Bónus por derrotar criaturas**, escalado pelas estrelas da vitória (secção 8) — quanto mais apertada a luta, menos pontos:
  - 3 estrelas → pontuação máxima
  - 2 estrelas → pontuação máxima − 1
  - 1 estrela → pontuação máxima − 2 (nunca abaixo de 0)
  - `MINIBOSS_MAX_POINTS = 3`, `BOSS_MAX_POINTS = 5`
- **Re-lutar e melhorar as estrelas paga sempre a diferença** (`computeBonusPointsForStars`, comparado com as estrelas anteriores antes de `markCreatureDefeated` as atualizar): ganhar 1ª vez com 1 estrela dá 1 ponto (mini-boss); re-lutar depois e subir para 3 estrelas dá **mais 2** (a diferença até ao máximo de 3), nunca a mesma vitória paga duas vezes nem se perde pontos ao sair pior numa re-luta. Corrigido depois de um bug em que só a primeira vitória de sempre pagava bónus, independentemente das estrelas de re-lutas seguintes
- Com os valores de produção, até ao nível 100 (assumindo todas as 10 mini-bosses + 10 bosses derrotados sempre com 3 estrelas): 4 iniciais + 99 pontos de nível + até 30 de mini-bosses (10 × 3) + até 50 de bosses (10 × 5) = **até 183 pontos no máximo** — a forma como se luta (arriscar vs jogar seguro) é relevante para a pontuação

## 7. Fórmula de valor dos equipamentos

Depois de testar uma curva de potência pura (`valor = base × nível^exp`) e descobrir que ela **garante matematicamente** incrementos decrescentes (o que parecia "pouco gratificante"), adotou-se uma fórmula recursiva aditiva:

```
Valor(1) = STAT_BASE
Valor(n) = round(Valor(n-1) + STAT_FLAT + n × STAT_PERCENT)
```

Isto garante que o incremento **nunca decresce** (na verdade cresce sempre um pouco), evitando o problema da curva de potência.

**Valores de produção** (nota: Ataque e Defesa foram **trocados** entre si — ver secção 9):

| Status | Base | Flat | % | Valor no nível 100 |
|---|---:|---:|---:|---:|
| Vida | 100 | 4 | 89% | ~4.990 |
| Ataque | 50 | 2 | 45% | ~2.523 (curva original da Defesa) |
| Defesa | 10 | 2 | 16% | ~1.016 (curva original do Ataque) |

Todos os 9 parâmetros (base/flat/% × 3 status) são ajustáveis independentemente no card de Debug.

**Recuperação de Vida** (novo 4º status, só da Armadura): fórmula linear simples, não recursiva, em pontos de vida por segundo real —

```
Recuperação (pontos/s) = STAT_RECOVERY_BASE + NívelArmadura × 0.10
STAT_RECOVERY_BASE = 0.1
```

Mostrado no HUD como "Recuperação: X/s". Não afeta nada durante a luta em si — é o ritmo a que a vida do jogador recupera fora de combate (ver secção 9, Sistema de duelos).

## 8. Mini-Bosses e Bosses

- Duas camadas de criaturas (já não há "monstros normais"): **Mini-Boss** a cada `MINIBOSS_LEVEL_STEP = 5` níveis, **Boss** a cada `BOSS_LEVEL_STEP = 10` níveis, até `MAX_LEVEL_TO_GENERATE = 100` (tudo ajustável)
- Níveis múltiplos de 10 ficam reservados exclusivamente para bosses (nunca um mini-boss no mesmo nível de um boss)
- **Nomes próprios** (`MINIBOSS_NAMES`/`BOSS_NAMES` em `js/monsters.js`): tema de "obstáculos mentais ao progresso" (Inércia, Preguiça, Rotina, Conforto, Ego, Platô...), cada mini-boss é uma forma "menor" do boss correspondente (ex: Lethling → Lethargor, Senhor da Inércia). Atribuídos por posição na sequência (o 1º mini-boss/boss gerado leva o 1º nome); se o nível máximo for aumentado no Debug para além dos 10 nomes de cada tipo, os extra caem num nome genérico "Mini-Boss/Boss Nível X"
- **Regra de desbloqueio**: puramente sequencial por combate — a primeira criatura já começa desbloqueada, cada seguinte só desbloqueia depois da anterior ser derrotada. O nível do personagem **não** é um requisito (a dificuldade vem só dos status da criatura, que escalam com o nível dela)
- Podem ser **re-lutados** depois de derrotados ("Lutar novamente"); melhorar as estrelas numa re-luta paga a diferença de pontos em falta (secção 6)
- **Estrelas** (1-3) por criatura derrotada, com base na vida do jogador restante no fim da luta (mesmos limiares dos pontos de bónus — secção 6): guarda-se sempre o **melhor resultado** de sempre, uma re-luta pior nunca faz perder estrelas já conquistadas. Sempre visíveis no card (cinza antes de conquistadas)
- **Arquétipos de status** (`CREATURE_ARCHETYPES`, `js/monsters.js`): em vez de todas as criaturas crescerem sempre na mesma proporção de Vida/Ataque/Defesa (o que tornava "investir tudo em Ataque" sempre a melhor build, sem exceção), cada uma das 20 criaturas recebe um multiplicador desigual por status, atribuído ciclicamente pela posição na sequência ordenada por nível:

  | Arquétipo | Vida | Ataque | Defesa |
  |---|---:|---:|---:|
  | Equilibrado | ×1.00 | ×1.00 | ×1.00 |
  | Tanque | ×1.20 | ×0.85 | ×1.20 |
  | Glass Cannon | ×0.80 | ×1.35 | ×0.70 |
  | Bruiser | ×1.05 | ×1.15 | ×0.85 |
  | Fortaleza | ×0.95 | ×0.85 | ×1.45 |

  `computeCreatureStatValue(type, creature)` aplica o multiplicador do arquétipo por cima do valor base (`computeStatValue`, secção 7), arredondado. O arquétipo **não é mostrado ao jogador** — só se sente a diferença ao lutar, na mesma lógica de mistério já usada para Ataque/Defesa. Multiplicadores calibrados por simulação (não analítico): valores mais extremos testados inicialmente (ex: Tanque ×1.4/×0.7/×1.3) criavam lutas literalmente impossíveis de vencer com o orçamento de pontos disponível nesse nível; os valores finais foram suavizados até nenhuma combinação de criatura/nível ficar sem pelo menos uma divisão de pontos vencedora
- **Vida escondida ("`****`") até entrar em combate**: o card de cada criatura só mostra "Vida: ****" até o jogador entrar em batalha com ela pela primeira vez (ganhando ou perdendo) — só depois revela o valor real (`isCreatureEncountered`, `STORAGE_KEY_ENCOUNTERED_CREATURES`). Ataque e Defesa nunca são mostrados no card, ficam sempre desconhecidos (mistério deliberado)
- Card "Batalhas": mostra só uma janela de **5 criaturas em carrossel horizontal**, sempre centrada na próxima por derrotar (nunca a lista inteira)

## 9. Sistema de duelos

- Botão "Batalhar" em cada monstro desbloqueado → abre um **popup fullscreen** (o `#viewer` 3D torna-se `position: fixed` a cobrir o ecrã todo, câmara afasta-se, personagem à esquerda, monstro placeholder de cor diferente à direita)
- Turnos automáticos, jogador ataca sempre primeiro: Ataque(jogador) → Defesa(monstro) → Ataque(monstro) → Defesa(jogador) → repete
- **Fórmula de dano** (com piso mínimo para nunca dar zero/negativo, o que causaria ciclos infinitos):

```
Bruto = Ataque_atacante − BATTLE_DEFENSE_PERCENT × Defesa_defensor
Base = max(BATTLE_FLOOR_PERCENT × Ataque_atacante, Bruto)
Variação = DAMAGE_VARIANCE_MIN + aleatório(0, 1 − DAMAGE_VARIANCE_MIN)
Dano = round(Base × Variação)
BATTLE_DEFENSE_PERCENT = 0.6, BATTLE_FLOOR_PERCENT = 0.5, DAMAGE_VARIANCE_MIN = 0.8
```

A variação aleatória aplica-se **depois** do piso mínimo, não antes. Foi tentado o contrário primeiro, mas builds com defesa forte (dano bruto sempre abaixo do piso) acabavam sempre no mesmo número exato — a variação nunca era visível. Aplicada depois do `max()`, há sempre variação visível seja qual for a origem do dano base (bruto ou piso), e o piso continua a impedir dano zero/negativo (0,8× de qualquer piso positivo continua positivo). Com os valores de produção, uma base de 20 sai sempre entre 16 e 20.

- **Porquê a troca de curvas Ataque/Defesa**: com as curvas originais (Defesa maior que Ataque), o dano dava sempre negativo em qualquer nível/build. Trocar as curvas resolveu a maior parte dos casos, mas builds extremos (100% investidos numa só stat) ainda podiam ficar presos em impasses ou derrotas garantidas — daí a necessidade do piso mínimo.
- **Dano flutuante**: cada acerto mostra um número a subir e desvanecer por cima da cabeça de quem foi atingido (`showFloatingCombatText`, `js/main.js`), projetado a partir da posição 3D real da cabeça (`head`/`monsterHead`) para o ecrã — só precisa de projetar uma vez por acerto, já que a câmara e as posições ficam fixas durante toda a luta
- **Vida do jogador persiste entre lutas** — não recomeça cheia automaticamente. Recupera com o tempo real decorrido (secção 7, Recuperação), calculado sob demanda (valor guardado + segundos passados × Recuperação, sem timer a correr em segundo plano). Lutar com vida parcial é uma escolha do jogador, não há bloqueio — a recuperação simplesmente não avança durante a luta em si (só volta a contar a partir do valor com que se fica no fim, ganhando ou perdendo). É um mecanismo anti-spam de batalhas, só local (não sincroniza entre dispositivos). Fora de combate, o mesmo número flutuante ("+0.2" etc.) aparece por cima da cabeça do personagem a cada segundo enquanto a vida não estiver completa
- Vitória contra um boss marca-o como derrotado e desbloqueia o próximo da sequência
- **Bloqueio entre abas** (`js/tab-lock.js`): impede duas abas do mesmo dispositivo lutarem em simultâneo, cada uma a pagar o bónus de "primeira derrota"/estrelas em separado. Mecanismo genérico partilhado com o treino (secção 4): cada aba tem um id próprio (`TAB_ID`), guarda um bloqueio em `localStorage` com esse id + um heartbeat (`Date.now()`); uma aba só consegue reclamar o bloqueio se não houver outro id "vivo" a segurá-lo (heartbeat com menos de `TAB_LOCK_STALE_MS = 15000` ms) — uma aba fechada/crashada sem libertar o bloqueio expira sozinha ao fim desse tempo, em vez de ficar presa para sempre
  - **`TAB_ID` guardado em `sessionStorage`, não gerado de novo a cada carregamento**: sobrevive a um refresh (F5) da mesma aba, mas começa vazio numa aba genuinamente nova (isolamento de `sessionStorage` por aba é garantia do próprio browser). Corrige um bug crítico real: com `TAB_ID = crypto.randomUUID()` a cada carregamento, um simples refresh da aba com um treino ou uma luta em curso gerava um id novo, que via o bloqueio deixado por si própria (antes do refresh, com heartbeat ainda recente) como pertencendo a "outra aba viva" e recusava-se a retomar — a aba voltava ao ecrã inicial como se a atividade nunca tivesse começado, mesmo com os dados ainda intactos em `localStorage` (só ficavam "presos" até o bloqueio expirar sozinho ao fim de 15s)

## 10. Conquistas

Card "Conquistas": mostra as 5 mais recentes (desbloqueadas primeiro, por ordem de desbloqueio; depois as mais próximas de completar), sempre num grid plano. Botão "Ver todas" abre popup fullscreen, organizado por **categorias** (`CATEGORY_BY_TYPE`/`CATEGORY_ORDER` em `js/achievements.js`, mesmo padrão de títulos de grupo já usado no histórico da aba Perfil): **Distância**, **Frequência**, **Combate**, **Liderança**, **Ritmo**.

**Arquitetura**: `checkAndUnlockAchievements()` continua 100% síncrona, só lê `localStorage`. Para os tipos que dependem do Supabase, um valor derivado fica cacheado localmente (ex: `melhorSequenciaDias`), atualizado por uma função assíncrona chamada nos sítios onde esses dados já são pedidos por outro motivo (login, ou quando o leaderboard/Perfil já buscam o mesmo dado) — sem chamadas de rede dedicadas extra, exceto uma única busca de `training_sessions` no login.

**Tipos implementados:**
- `sessionDistance` / `lifetimeDistance` — melhor distância numa sessão / distância acumulada de sempre
- `trainingCount` — número de treinos concluídos
- `streak` — maior sequência de dias distintos treinados **de sempre** (não a sequência atual — uma vez alcançada, fica para sempre, mesmo que a sequência se quebre depois)
- `fullMonthTrained` / `activeWeekend` — treinar todos os dias de um mês civil / sábado e domingo da mesma semana ISO
- `bossDefeated` — gerado automaticamente por boss (sincronizado com a lista de monstros)
- `creatureStars` / `allMiniBossesThreeStars` / `allBossesThreeStars` / `allCreaturesDefeated` — baseadas nas estrelas por criatura (secção 8)
- `leaderboardRank` — **"Geral"**, desbloqueia ao ver o próprio `user_id` no topo do leaderboard geral (secção 14), fica **permanente** mesmo caindo depois no ranking
- Medalha mensal — **12 cartões fixos, um por mês de calendário** (Janeiro a Dezembro, `generateMonthlyMedalAchievements` em `js/achievements.js`), ao contrário das outras conquistas dinâmicas: sempre visíveis, nunca "aparecem do nada". Para cada mês, procura-se em qualquer ano se já foi ganha uma medalha `monthly_medals` (secção 14) nesse mês de calendário — a mais recente, se houver mais que uma:
  - **Já ganha** (`monthlyMedal`): mostra a medalha real (🥇/🥈/🥉) e o ano em que foi ganha (ex: "Julho 2026")
  - **Mês corrente, ainda por decidir** (`monthlyMedalPending`): bloqueado, ícone das 3 medalhas juntas (🥇🥈🥉) — só no fecho do mês (`js/monthly-medals.js`) se sabe a cor final
  - **Mês futuro, ainda não chegou este ano** (`monthlyMedalFuture`): mesmo ícone bloqueado, sem alegar falhanço
  - **Mês já passado sem pódio** (`monthlyMedalMissed`): mesmo ícone bloqueado, fica assim até ganhar esse mês de calendário nalgum ano
  - `isAchievementUnlocked` tem um caso especial para o id sintético `medal_month_MM` — não é gravado diretamente por `unlockAchievement` como as outras conquistas, é derivado a cada leitura a partir dos ids reais `medal_<cor>_<ano>_<mes>`
- `pace` — distância + tempo limite; `personalRecord` — bater o próprio recorde de ritmo (só a partir da 2ª sessão)

Cada conquista tem ícone (emoji como placeholder), nome e um destaque visual verde quando desbloqueada (sem barra de progresso — foi removida a pedido).

**Popup de detalhe**: clicar em qualquer conquista (resumo ou popup completo) abre um pequeno popup central com ícone, nome, descrição e progresso atual (ou "Desbloqueada!"). A descrição é **gerada a partir do tipo/parâmetros** (`getAchievementDescription`), não escrita à mão por conquista — evita repetição para as ~40 conquistas existentes.

**Importante**: o simulador de distância por tempo (Debug) trata o tempo simulado como uma sessão de treino real para efeitos de conquistas — sem isto, conquistas de distância nunca desbloqueariam ao testar via simulador.

**Medalhas mensais — modelo de confiança**: quem fizer login primeiro depois da virada do mês publica a "fotografia" do top 3 desse mês em `monthly_medals`, potencialmente creditando outros jogadores. A política de RLS `monthly_medals_insert_authenticated` deixa qualquer jogador autenticado inserir uma linha para qualquer `user_id` — não há Edge Functions/service role neste projeto. Protegido só por `unique(month, medal)` e ausência de UPDATE/DELETE. Aceitável para um grupo pequeno de amigos de confiança; não usar assim num contexto público. Limitação aceite: só existe um "slot" de mês anterior por jogador — quem não faz login durante 2+ meses seguidos perde o registo do(s) mês(es) saltado(s). `monthly_medals` é lida por dois sítios independentes: os 12 cartões fixos de conquista (acima) e a aba "Histórico" do leaderboard (secção 14).

## 11. Debug

Card com todos os valores públicos ajustáveis em tempo real (sem precisar de editar código):

- Curva de nível (`LEVEL_BASE`, `LEVEL_EXP`)
- Curvas de status × 3 (`STAT_BASE/FLAT/PERCENT` para Vida, Ataque, Defesa) + `STAT_RECOVERY_BASE`
- Pontos (`LEVEL_UP_POINTS`, `MINIBOSS_MAX_POINTS`, `BOSS_MAX_POINTS`)
- Filtros de GPS (`MAX_ACCURACY_M`, `MIN_MOVEMENT_M`, `MAX_SPEED_KMH`)
- Geração de criaturas (`MINIBOSS_LEVEL_STEP`, `BOSS_LEVEL_STEP`, `MAX_LEVEL_TO_GENERATE`)
- Fórmula de combate (`BATTLE_DEFENSE_PERCENT`, `BATTLE_FLOOR_PERCENT`, `DAMAGE_VARIANCE_MIN`)
- **Simulador de distância por tempo**: liga/desliga um timer que soma `segundos × fator` à distância vitalícia, fator ajustável em tempo real — para testar níveis altos sem andar de verdade
- **Reset de personagem**: apaga nível, status, pontos, monstros derrotados, conquistas e o histórico de treinos (`training_sessions` no Supabase, usado pela aba Perfil) — com confirmação. O mesmo botão (`resetCharacterAndDistance`) está também disponível a **qualquer jogador** (não só admins) ao fundo da aba Perfil, numa secção "Zona de Perigo" — não repõe nada relacionado com medalhas mensais (`monthly_medals`), que é uma tabela partilhada e imutável mesmo para o próprio dono (secção 10); um jogador que já tenha ganho uma medalha volta a "reclamá-la" automaticamente no login seguinte (`claimOwnMedals`, `js/monthly-medals.js`), mesmo depois de um reset

`STARTING_UNSPENT_POINTS` (secção 6) e `CREATURE_ARCHETYPES` (secção 8) **não** estão no card de Debug — ao contrário dos outros valores acima, ficam hardcoded no código (`js/equipment.js`/`js/monsters.js`), não em `localStorage`. Mudar exige editar e fazer deploy, não só ajustar um input.

## 12. UI / UX

- Mobile-first; página com scroll (deixou de ser "uma tela só" quando o conteúdo cresceu)
- Aviso para rodar o dispositivo aparece só em ecrãs touch em modo paisagem (deteção via JS: `matchMedia` + `maxTouchPoints`, não só CSS)
- HUD do personagem sobreposto ao visualizador 3D: nível, os 4 status (Vida mostrada como `atual/máximo`, atualizada ao vivo a cada segundo enquanto estiver a recuperar — para sozinho ao chegar ao máximo), e o nível de cada equipamento com botão **"+"** que só aparece quando há pontos disponíveis
- Equipamento pode ser evoluído de duas formas: a) tocar na peça no modelo 3D (espada=Ataque, escudo=Defesa, corpo=Vida/Armadura) b) botão "+" no HUD
- Personagem gira por arraste/toque (câmara fixa); toque curto sem arrastar seleciona equipamento (raycasting Three.js)

## 13. Decisões de design relevantes (porquês)

- **Sem OrbitControls**: câmara fixa por pedido explícito; só o personagem roda
- **jsDelivr em vez de unpkg + preconnect**: reduz latência inicial de carregamento do Three.js
- **`100dvh` em vez de `100vh`**: lida melhor com a barra de endereço móvel que aparece/desaparece
- **Emojis como ícones de conquistas**: placeholder deliberado, consistente com o resto do site (cápsulas, caixas coloridas) — substituível por ícones customizados no estilo "flat, duas cores" mais tarde
- **Um `.hidden { display: none; }` genérico no CSS**: adicionado depois de um bug em que elementos de batalha ficavam sempre visíveis por faltar a regra CSS correspondente à classe
- **`?v=YYYYMMDD` nos `<script src>` locais**: ver secção 3 — sem isto, cache do navegador/CDN podia fazer uma funcionalidade nova parecer "morta" (botão sem efeito) depois de um deploy, mesmo com o código já correto no repositório
- **`.leaderboard-list.hidden` em vez de depender só de `.hidden`**: `.hidden` e `.leaderboard-list` (que define `display: flex`) têm a mesma especificidade CSS; como `.leaderboard-list` vem depois no ficheiro, ganhava sempre ao `.hidden`, e as 3 abas do leaderboard apareciam todas empilhadas ao mesmo tempo, independentemente de qual estava selecionada. Regra semelhante à de `#battle-hud.hidden`, já existente por um motivo parecido
- **Bloqueio entre abas via `localStorage` + heartbeat, não `BroadcastChannel`**: mais simples (um só mecanismo, sem duas formas de comunicação a coexistir) e cobre também o caso de uma segunda aba abrir **depois** de o treino/luta já ter começado na primeira (que não teria recebido uma mensagem de broadcast anterior à sua própria existência) - a segunda aba só precisa de ler o estado atual do bloqueio, não de "ouvir" um evento passado
- **`getStoredNumber` nunca usa `Number(raw) || defaultValue`**: `0` é um valor legítimo (ex: pontos por gastar depois de gastar tudo) mas é "falsy" em JavaScript, então esse padrão fazia qualquer valor guardado como `0` ser lido de volta como o `defaultValue` em vez do zero real. Bug crítico real: um jogador ficava num ciclo infinito de pontos "fantasma" sempre que chegava a 0 (a próxima leitura fingia que ainda tinha os pontos da oferta inicial, permitindo gastar mais do que devia, repetidamente). Corrigido para `raw === null ? defaultValue : (Number.isNaN(parsed) ? defaultValue : parsed)` — o mesmo padrão que `getDebugValue` (`js/debug.js`) já usava corretamente desde o início
- **Número de versão no rodapé** (`#site-version`, formato `vX.X.X`): texto estático em `index.html`, sem constante partilhada nem exibido noutro sítio (não precisa de mais que isso). Dá ao jogador/dono do site uma confirmação visual imediata de que um deploy chegou a esta sessão do browser, sem ter de inspecionar a rede ou fazer hard-refresh às cegas — complementa o `?v=YYYYMMDD` dos scripts (secção 3), que resolve cache mas não é visível ao jogador. **Convenção: subir manualmente a cada alteração** (patch `x.x.N` para afinações/correções pequenas, minor `x.N.0` para funcionalidades novas, major `N.0.0` reservado a reformulações grandes) — o valor mais recente fica sempre visível em produção, é o próprio commit que a alteração introduz que já traz o número atualizado

## 14. Contas e Leaderboard (Supabase)

- **Login obrigatório com Google** — sem modo convidado; `#auth-modal` cobre o ecrã todo até haver sessão confirmada
- Depois do primeiro login, popup pede o **nome da personagem** (nunca o nome real da conta Google) — nomes são **únicos** (índice único case-insensitive em `profiles.display_name`, erro `23505` tratado no popup)
- **Supabase passa a ser a fonte de verdade do progresso** (`player_progress`: distância vitalícia, pontos, níveis de equipamento, monstros derrotados, conquistas, distância anulada por velocidade). `localStorage` fica como cache/buffer offline — continua a funcionar sem rede, sincroniza quando volta a haver ligação
- `treino.*` (checkpoint de sessão GPS em curso) e `debug.*` (afinação de jogo) **nunca** são sincronizados — ficam sempre só locais
- Sincronização contínua via `queueProgressSync()` (debounce ~400ms, snapshot completo, seguro para reenviar) chamada a seguir a cada mutação de progresso existente
- **Card de Leaderboard com 3 abas** (`js/leaderboard.js`), mesmo aspeto visual em todas (`#N`, nome, distância — sem ícones de medalha nas linhas, essas ficam só na conquista mensal e no Histórico):
  - **Geral**: top 10 por `lifetime_distance_m`, mais a posição do próprio jogador com um "···" separador se não estiver no top 10
  - **Mensal**: top 10 por `monthly_distance_m`, com um filtro extra `.eq("month_reference", mêsAtual)` — sem isto, jogadores que ainda não fizeram login desde a virada do mês apareceriam com a distância do mês anterior, presa na sua linha até ao próximo login deles
  - **Histórico**: lista os meses já fechados (tabela `monthly_medals`), mais recente primeiro, com o ouro/prata/bronze de cada um — usa os mesmos dados das conquistas mensais fixas (secção 10)
  - `renderLeaderboardCard()` é chamado de vários pontos (login, sync de progresso, fecho mensal) sem coordenação entre si; para duas chamadas sobrepostas nunca intercalarem e duplicarem visualmente uma linha, todas as chamadas passam por uma **fila de promessas** (`leaderboardRenderQueue`) que garante execução sequencial, nunca em paralelo
- **`leaderboard`**: tabela pública de leitura (top 10 + posição do próprio jogador se não estiver no top 10), cada jogador só escreve a sua própria linha (RLS)
- **Debug é admin-only**: flag `is_admin` em `profiles`, alterável só manualmente via SQL Editor — nunca exposta a nenhum caminho do cliente (fronteira real de segurança são as políticas RLS, não a UI escondida)
- Falhas de rede a meio do arranque pós-login não travam o resto do jogo — cada passo (perfil, migração/hidratação, nome, leaderboard) tem o seu próprio `try/catch`, para os cartões de Monstros/Conquistas nunca ficarem vazios por causa de um erro noutro passo

## 15. Aba de Perfil e histórico de treinos

- Navegação sem framework: dois botões no cabeçalho (`Jogo`/`Perfil`) alternam `.hidden` entre dois containers (`#view-jogo`/`#view-perfil`) — mesmo padrão já usado nos modais
- A cena 3D (`js/main.js`) pausa o `renderer.render(...)` enquanto a aba Perfil está visível (poupa GPU/bateria), sem parar o loop `requestAnimationFrame`
- **`training_sessions`** (Postgres): uma linha por sessão de treino (`started_at`, `ended_at`, `distance_m`, `duration_seconds`), imutável depois de gravada (sem UPDATE/DELETE). É a peça que faltava para qualquer métrica não-agregada — antes só existiam totais vitalícios
- **Captura fiável**: ao contrário do progresso (snapshot substituível), uma sessão é um evento discreto — fica numa fila local (`personagem.filaSessoesTreino`) até ser confirmada no Supabase, com `client_id` + índice único para o reenvio nunca duplicar. Retry no evento `online` e no arranque seguinte
- **Tudo agregado no cliente** (sem views/RPC no Postgres) — busca todas as sessões do próprio jogador e reduz em JS; volume trivial para um grupo de amigos
- **Semana** = semana ISO (começa à segunda); **mês** = mês de calendário; ambos em hora local
- Conteúdo da aba: status/equipamento (dados já existentes, só leitura), histórico agrupado por mês (últimos 24 meses com treino, dias dentro de cada mês, cada dia mostra também a **velocidade média** desse dia — `distância ÷ duração`), distância total e sessão mais longa da semana/mês atual, dias distintos treinados (base para as conquistas de sequência), e três gráficos **SVG desenhados à mão** (sem biblioteca nova): evolução da semana atual e do mês atual (uma barra por dia, com setas ‹ › para recuar até à semana/mês do primeiro treino de sempre) e evolução de todos os meses (uma barra por mês, incluindo meses vazios)
- **Card Resumo** (`renderProfileSummary`): distância total e sessão mais longa da semana/mês atual, dias distintos treinados, **Recorde de distância** (`getBestSessionDistanceM()` — a maior distância numa única sessão de sempre, já existia para as conquistas de distância, só passou a aparecer aqui também), **Recorde de velocidade** (`getBestPaceMps()` — o mesmo valor já usado pela conquista `pace_personal_record`, convertido para km/h), e **distância anulada por excesso de velocidade** (secção 4)
- Cada barra mostra sempre um **rótulo visível por baixo** (dia da semana, dia do mês, ou abreviatura do mês no gráfico de todos os meses) — o valor exato continua só no `<title>` nativo ao passar o rato (não funciona por toque em mobile), mas identificar qual barra é qual já não depende disso
- **Todas as distâncias mostradas ao jogador são em km** (`formatDistanceKm()`, js/experience.js) e **velocidades em km/h** (`formatSpeedKmh()`, js/experience.js) — os dados continuam guardados/calculados em metros e m/s, só a apresentação muda
- **"Zona de Perigo"** (secção final da aba): botão de repor personagem e distância, igual ao do Debug mas disponível a qualquer jogador (secção 11)

## 16. Limitações conhecidas / possíveis próximos passos

- Combate é **totalmente automático** (sem escolhas do jogador durante a luta)
- Ícones de conquistas são emoji, não arte customizada
- Bloqueio de paisagem no mobile é só um **aviso**, não um bloqueio real (tecnicamente impossível de forçar via web/PWA no iOS)
- Não é uma PWA (sem `manifest.json`/service worker) — instalável no ecrã inicial mas sem funcionar totalmente offline
- Se convertida para app: PWA é o caminho mais simples (quase nenhuma alteração de código); Capacitor permite lojas de apps com esforço moderado; reescrita nativa exigiria substituir Three.js por um motor 3D nativo
- Gráficos SVG mostram sempre o rótulo (dia/mês) por baixo de cada barra, mas o **valor exato** só está disponível no `<title>` nativo do browser ao passar o rato — não funciona por toque em mobile
- Medalhas mensais dependem de confiança entre jogadores (qualquer jogador autenticado pode publicar a medalha de outro — ver secção 10); só 1 "slot" de mês anterior por jogador, perde-se o registo de meses saltados sem login
- Multiplicadores dos arquétipos de monstro (secção 8) foram calibrados por **simulação de Monte Carlo** (milhares de combates simulados por combinação de nível/arquétipo/divisão de pontos), não por uma fórmula analítica fechada — servem para garantir que nenhuma luta fica impossível com os valores de produção atuais, mas podem precisar de reajuste se `LEVEL_UP_POINTS`, `MINIBOSS_MAX_POINTS`/`BOSS_MAX_POINTS` ou as curvas de status (secção 7) mudarem no Debug
- **Duplicação entre abas do mesmo dispositivo (corrigido, mas houve um caso real)**: antes do bloqueio de abas (secções 4 e 9) existir, um jogador com duas abas do telemóvel abertas ao mesmo tempo acabou com a distância vitalícia e os pontos de status muito acima do que devia ser possível (cada aba contava a mesma distância/vitória em separado, cada uma escrevendo aditivamente no mesmo `localStorage`/Supabase). Corrigido a dois níveis: o mecanismo de bloqueio evita que volte a acontecer; os dados desse jogador foram corrigidos manualmente no Supabase (SQL direto, fora do site) recalculando os pontos legítimos a partir do `defeated_creatures` real dele. **Continua a existir um limite estrutural não resolvido**: o modelo de sincronização é "a última escrita ganha" por dispositivo — duas abas em **dispositivos diferentes** (não só o mesmo telemóvel) ainda poderiam, em teoria, duplicar progresso da mesma forma; o bloqueio atual só protege contra abas do mesmo dispositivo (o mesmo `localStorage`)
