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
| `js/auth.js` | Login Google (Supabase Auth), popup de escolha de nome, gate do card de Debug, orquestração do arranque pós-login |
| `js/progress-sync.js` | Migração/hidratação do progresso local ↔ Supabase, sincronização contínua (`queueProgressSync`) |
| `js/leaderboard.js` | Renderização do card de leaderboard |
| `js/main.js` | Cena 3D (Three.js): personagem, equipamentos, monstro placeholder, câmara, rotação por arraste, raycasting de equipamento |
| `js/debug.js` | Centraliza **todas** as variáveis afináveis do jogo + ferramentas de debug (reset, simulador de distância) |
| `js/equipment.js` | Stats do personagem, níveis de equipamento, fórmula de valor de status, upgrade |
| `js/experience.js` | Curva de nível do personagem, cálculo de progresso |
| `js/monsters.js` | Geração de monstros/bosses, regra de desbloqueio, renderização do carrossel "Batalhas" |
| `js/achievements.js` | Sistema de conquistas, categorias, conquistas de frequência/combate/liderança |
| `js/monthly-medals.js` | Contador de distância mensal, corte/rollover de mês, medalhas Ouro/Prata/Bronze |
| `js/battle.js` | Lógica de combate por turnos, popup fullscreen de batalha |
| `js/training.js` | GPS, tracking de distância, sessões de treino, filtros de ruído, fila local de sessões pendentes para `training_sessions` |
| `js/profile.js` | Aba de Perfil: navegação Jogo/Perfil, status/equipamento, histórico de treinos, agregados semana/mês, gráficos SVG |
| `js/orientation.js` | Aviso de rodar para retrato em dispositivos touch |
| `supabase/schema.sql` | Referência do schema Postgres (tabelas, RLS) — corre-se manualmente no SQL Editor do Supabase, não é lido pelo site |

Ordem de carregamento dos scripts (importa por causa de dependências entre módulos):
`storage-keys → auth → progress-sync → leaderboard → main → debug → equipment → experience → monsters → achievements → monthly-medals → battle → training → profile → orientation`

## 4. Sistema de treino (GPS)

- Geolocation API (`watchPosition`), distância calculada por **fórmula de Haversine**
- **Filtros anti-ruído** (todos ajustáveis no Debug):
  - `MAX_ACCURACY_M = 20` — ignora leituras de GPS pouco precisas
  - `MIN_MOVEMENT_M = 3` — ignora "deriva" de GPS parado
  - `MAX_SPEED_KMH = 30` — ignora saltos irreais (permite bicicleta, rejeita erro de GPS/veículo mais rápido)
- Sessão persiste em `localStorage` (checkpoint a cada 10s + save imediato no `pagehide`) e **retoma automaticamente** após um refresh acidental
- Ao parar um treino: soma a distância à experiência vitalícia, incrementa contagem de treinos, atualiza melhor distância de sessão, verifica conquistas

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

- `LEVEL_UP_POINTS = 1` ponto por cada nível de personagem subido (substituiu o antigo sistema de "quartos": 4 pontos distribuídos a cada 25% de progresso dentro do nível)
- Pontos só contam com base em **distância confirmada** (nunca a sessão de treino em curso, que pode ainda ser perdida)
- **Bónus por derrotar criaturas** (só na primeira derrota — re-lutar não dá pontos outra vez), escalado pela vida do jogador restante no momento da vitória — quanto mais apertada a luta, menos pontos:
  - ≥ 50% de vida → pontuação máxima
  - 25%–49% de vida → pontuação máxima − 1
  - < 25% de vida → pontuação máxima − 2 (nunca abaixo de 0)
  - `MINIBOSS_MAX_POINTS = 3`, `BOSS_MAX_POINTS = 5`
- Com os valores de produção, até ao nível 100 (assumindo todas as 10 mini-bosses + 10 bosses derrotados com vida acima de 50%): 99 pontos de nível + até 30 de mini-bosses (10 × 3) + até 50 de bosses (10 × 5) = **até 179 pontos no máximo** — a forma como se luta (arriscar vs jogar seguro) é relevante para a pontuação

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
- Podem ser **re-lutados** depois de derrotados ("Lutar novamente"), mas os pontos de bónus (secção 6) só são dados na primeira derrota
- **Estrelas** (1-3) por criatura derrotada, com base na vida do jogador restante no fim da luta (mesmos limiares dos pontos de bónus — secção 6): guarda-se sempre o **melhor resultado** de sempre, uma re-luta pior nunca faz perder estrelas já conquistadas. Sempre visíveis no card (cinza antes de conquistadas)
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
- `leaderboardRank` — "Nº 1 do Leaderboard", desbloqueia ao ver o próprio `user_id` no topo, fica **permanente** mesmo caindo depois no ranking
- `monthlyMedal` — medalhas Ouro/Prata/Bronze mensais; só aparecem na lista depois de ganhas (não há "meta" fixa para mostrar antes, depende dos outros jogadores)
- `pace` — distância + tempo limite; `personalRecord` — bater o próprio recorde de ritmo (só a partir da 2ª sessão)

Cada conquista tem ícone (emoji como placeholder), nome e um destaque visual verde quando desbloqueada (sem barra de progresso — foi removida a pedido).

**Popup de detalhe**: clicar em qualquer conquista (resumo ou popup completo) abre um pequeno popup central com ícone, nome, descrição e progresso atual (ou "Desbloqueada!"). A descrição é **gerada a partir do tipo/parâmetros** (`getAchievementDescription`), não escrita à mão por conquista — evita repetição para as ~40 conquistas existentes.

**Importante**: o simulador de distância por tempo (Debug) trata o tempo simulado como uma sessão de treino real para efeitos de conquistas — sem isto, conquistas de distância nunca desbloqueariam ao testar via simulador.

**Medalhas mensais — modelo de confiança**: quem fizer login primeiro depois da virada do mês publica a "fotografia" do top 3 desse mês em `monthly_medals`, potencialmente creditando outros jogadores. A política de RLS `monthly_medals_insert_authenticated` deixa qualquer jogador autenticado inserir uma linha para qualquer `user_id` — não há Edge Functions/service role neste projeto. Protegido só por `unique(month, medal)` e ausência de UPDATE/DELETE. Aceitável para um grupo pequeno de amigos de confiança; não usar assim num contexto público. Limitação aceite: só existe um "slot" de mês anterior por jogador — quem não faz login durante 2+ meses seguidos perde o registo do(s) mês(es) saltado(s).

## 11. Debug

Card com todos os valores públicos ajustáveis em tempo real (sem precisar de editar código):

- Curva de nível (`LEVEL_BASE`, `LEVEL_EXP`)
- Curvas de status × 3 (`STAT_BASE/FLAT/PERCENT` para Vida, Ataque, Defesa) + `STAT_RECOVERY_BASE`
- Pontos (`LEVEL_UP_POINTS`, `MINIBOSS_MAX_POINTS`, `BOSS_MAX_POINTS`)
- Filtros de GPS (`MAX_ACCURACY_M`, `MIN_MOVEMENT_M`, `MAX_SPEED_KMH`)
- Geração de criaturas (`MINIBOSS_LEVEL_STEP`, `BOSS_LEVEL_STEP`, `MAX_LEVEL_TO_GENERATE`)
- Fórmula de combate (`BATTLE_DEFENSE_PERCENT`, `BATTLE_FLOOR_PERCENT`, `DAMAGE_VARIANCE_MIN`)
- **Simulador de distância por tempo**: liga/desliga um timer que soma `segundos × fator` à distância vitalícia, fator ajustável em tempo real — para testar níveis altos sem andar de verdade
- **Reset de personagem**: apaga nível, status, pontos, monstros derrotados, conquistas e o histórico de treinos (`training_sessions` no Supabase, usado pela aba Perfil) — com confirmação

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

## 14. Contas e Leaderboard (Supabase)

- **Login obrigatório com Google** — sem modo convidado; `#auth-modal` cobre o ecrã todo até haver sessão confirmada
- Depois do primeiro login, popup pede o **nome da personagem** (nunca o nome real da conta Google) — nomes são **únicos** (índice único case-insensitive em `profiles.display_name`, erro `23505` tratado no popup)
- **Supabase passa a ser a fonte de verdade do progresso** (`player_progress`: distância vitalícia, pontos, níveis de equipamento, monstros derrotados, conquistas). `localStorage` fica como cache/buffer offline — continua a funcionar sem rede, sincroniza quando volta a haver ligação
- `treino.*` (checkpoint de sessão GPS em curso) e `debug.*` (afinação de jogo) **nunca** são sincronizados — ficam sempre só locais
- Sincronização contínua via `queueProgressSync()` (debounce ~400ms, snapshot completo, seguro para reenviar) chamada a seguir a cada mutação de progresso existente
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
- Conteúdo da aba: status/equipamento (dados já existentes, só leitura), histórico agrupado por mês (últimos 24 meses com treino, dias dentro de cada mês), distância total e sessão mais longa da semana/mês atual, dias distintos treinados (base para as conquistas de sequência), e três gráficos **SVG desenhados à mão** (sem biblioteca nova): evolução da semana atual e do mês atual (uma barra por dia, com setas ‹ › para recuar até à semana/mês do primeiro treino de sempre) e evolução de todos os meses (uma barra por mês, incluindo meses vazios)
- Cada barra mostra sempre um **rótulo visível por baixo** (dia da semana, dia do mês, ou abreviatura do mês no gráfico de todos os meses) — o valor exato continua só no `<title>` nativo ao passar o rato (não funciona por toque em mobile), mas identificar qual barra é qual já não depende disso
- **Todas as distâncias mostradas ao jogador são em km** (`formatDistanceKm()`, js/experience.js) — os dados continuam guardados/calculados em metros, só a apresentação muda

## 16. Limitações conhecidas / possíveis próximos passos

- Combate é **totalmente automático** (sem escolhas do jogador durante a luta)
- Ícones de conquistas são emoji, não arte customizada
- Bloqueio de paisagem no mobile é só um **aviso**, não um bloqueio real (tecnicamente impossível de forçar via web/PWA no iOS)
- Não é uma PWA (sem `manifest.json`/service worker) — instalável no ecrã inicial mas sem funcionar totalmente offline
- Se convertida para app: PWA é o caminho mais simples (quase nenhuma alteração de código); Capacitor permite lojas de apps com esforço moderado; reescrita nativa exigiria substituir Three.js por um motor 3D nativo
- Gráficos SVG mostram sempre o rótulo (dia/mês) por baixo de cada barra, mas o **valor exato** só está disponível no `<title>` nativo do browser ao passar o rato — não funciona por toque em mobile
- Medalhas mensais dependem de confiança entre jogadores (qualquer jogador autenticado pode publicar a medalha de outro — ver secção 10); só 1 "slot" de mês anterior por jogador, perde-se o registo de meses saltados sem login
