# Bootlands — especificação para a reescrita em Unity

## 0. O que é este documento

Isto **não** é um substituto de `DOCUMENTACAO.md` — esse continua a ser o registo vivo de tudo o que aconteceu no jogo web (decisões, bugs, datas, incidentes). Este ficheiro é a versão **destilada**: só as regras e fórmulas **em vigor hoje**, sem a arqueologia de como se chegou lá, organizadas para quem vai reimplementar isto em C#/Unity sem precisar de ler 340 KB de histórico primeiro.

**Âmbito confirmado com o Victor (2026-09-29):**
- É uma **reescrita completa** do jogo em Unity (C#), não só a parte 3D — toda a lógica hoje em JavaScript (missões, hordas, mapa de hexágonos, economia, combate, contas) tem de ser reimplementada.
- Fala com o **mesmo Supabase** — mesmo projeto, mesmas tabelas, mesmas regras de RLS. Isto não é um jogo novo com uma conta nova; é o mesmo jogo, motor diferente.
- O site/PWA atual e a app nativa Android via Capacitor (`android/`, ver `DOCUMENTACAO.md` secção 27) **continuam a ser o produto vivo da beta fechada**, sem pausa nem alterações de prioridade por causa disto. Este documento é preparação para um trabalho futuro, não uma substituição imediata.

**O que este documento cobre**: os números e regras que definem o jogo — curva de nível, fórmulas de status/combate, economia de recursos, missões, hordas, conquistas, o modelo de dados no Supabase e as regras de sincronização entre dispositivos (estas últimas já causaram vários bugs reais na versão web — vale a pena herdar as regras, não só as tabelas).

**O que este documento NÃO cobre** (deliberadamente): nada de Three.js/DOM/CSS — câmaras, joysticks virtuais, carregamento de modelos `.glb`, animações Mixamo, toasts, popups. Unity tem os seus próprios sistemas idiomáticos para tudo isto (Cinemachine, Input System, Animator, UGUI/UI Toolkit) e nenhuma dessas implementações específicas de Three.js é reaproveitável — tentar "traduzir" essa camada, em vez de a desenhar de novo à maneira do Unity, seria trabalho desperdiçado.

---

## 1. Modelo de dados (Supabase) — reutilizado tal como está

Unity fala com o mesmo projeto Supabase via REST (ou um SDK C# como o `supabase-csharp`). Nenhuma tabela muda de forma — só o cliente que as lê/escreve muda de JavaScript para C#.

| Tabela | Conteúdo | RLS |
|---|---|---|
| `profiles` | `display_name` (único, case-insensitive), `is_admin` | cada um só lê/escreve a própria linha |
| `player_progress` | fonte de verdade do progresso: distância/calorias vitalícias, `unspent_points`, `nivel_energia/forca/resistencia`, `nivel_arma/escudo/armadura`, `nivel_fortaleza`, `recursos`/`recursos_desde` (jsonb), `minas_encontradas`, `defeated_creatures`, `unlocked_achievements`, `missoes_mensais` (jsonb), `discarded_speed_distance_m`, `training_lock_owner`/`training_lock_heartbeat_at`, `peso_kg`, etc. | privado, só o dono |
| `leaderboard` | cópia pública/agregada: `lifetime_calories_kcal`, `monthly_calories_kcal`, `month_reference`, `unlocked_achievements` (cópia pública, para o popup de troféus de outro jogador) | leitura pública (top 10 + a própria linha); escrita só da própria linha |
| `training_sessions` | uma linha por treino: `distance_m`, `duration_seconds`, `mode`, `calories_kcal`, `distance_by_mode`, `started_at`, `gps_diag` (jsonb, diagnóstico de sinal) | insert-only do próprio, imutável depois |
| `discovered_hexes` | `(user_id, hex_id)` chave primária, `resolution`, `first_seen_at` | insert/select/delete do próprio |
| `monthly_medals` | fecho de mês: `month`, `medal` (🥇🥈🥉), `user_id`, `calories_kcal`, `distance_m` | insert por qualquer autenticado (modelo de confiança — ver secção 8), sem update/delete, `unique(month, medal)` |
| `weight_history` | `peso_kg` (20–300, `check` na coluna), `recorded_at` | select/insert do próprio |
| `feedback_reports` | feedback dentro da app + `feedback-screenshots` (Storage, leitura pública) | insert do próprio |
| `push_subscriptions` | subscrições Web Push (não aplicável a uma app Unity nativa — ver secção 9) | select/insert/update/delete do próprio |

**Trigger `on_auth_user_created`**: cria a linha de `profiles` e aplica o limite de contas da beta (`beta_limite_contas()`, hoje 20) — `raise exception` se o limite já foi atingido, abortando a criação da conta. Reaproveitado tal como está; Unity só precisa de tratar o erro que isto devolve no signup.

**RPC pública**: `beta_vagas_restantes()` (SECURITY DEFINER, devolve só um número) — usada para o aviso "vagas limitadas" sem expor `profiles`.

### 1.1 Regras de reconciliação (crítico — não simplificar)

O arranque da versão web faz sempre um **merge campo a campo** entre o estado local e o servidor, nunca escolhe um lado por inteiro. Isto já corrigiu vários bugs reais de perda/duplicação de progresso — a reescrita em Unity precisa da mesma disciplina, não só das mesmas tabelas:

| Tipo de campo | Regra | Exemplos |
|---|---|---|
| Monotónicos (só sobem) | `max(local, servidor)` | calorias/distância vitalícias, recordes de sessão/ritmo, níveis investidos e de equipamento, `nivel_fortaleza` |
| Sobem e descem | local se houver mutação por confirmar, senão servidor | `unspent_points`, `peso_kg` |
| Coleções | união, nunca substituição | conquistas desbloqueadas, criaturas encontradas/derrotadas (`max` das estrelas por criatura) |
| Stock de recursos | `max` da base em bruto por recurso + o checkpoint **mais antigo** dos dois (a projeção de produção só corre DEPOIS do merge, já com o mapa hidratado) | `recursos`/`recursos_desde` |
| Missões mensais | meses diferentes → o mais recente; mesmo mês → união das concluídas, maior `progressoM` na ativa de cada dificuldade | `missoes_mensais` |

**Guarda adicional**: `lifetime_calories_kcal` nunca pode exceder a soma das `calories_kcal` de todas as sessões reais do jogador (+ tolerância mínima) — um valor local mais alto é sempre **baixado** para bater com as sessões, nunca o contrário. Existe porque um campo puramente monotónico, sozinho, deixa uma correção manual no servidor ser desfeita pelo próprio dispositivo do jogador ao reconectar.

---

## 2. Contas e autenticação

- Email + palavra-passe, sem modo convidado (`signUp`/`signInWithPassword`, Supabase Auth). Confirmação de email conforme configurado no projeto.
- Primeiro login: escolher nome de personagem (único, case-insensitive) → popup de boas-vindas com o peso corporal (sem opção de saltar, entra com omissão de 70 kg se saltável).
- Lembrete de peso a cada 15 dias sem atualização (dispensável, volta a aparecer no arranque seguinte se dispensado).
- Limite de contas da beta fechada: hoje 20, aplicado no servidor (não replicável só no cliente).

---

## 3. Treino / GPS

### 3.1 O que Unity resolve de graça

A limitação inteira da secção 4.2 do `DOCUMENTACAO.md` — GPS morre com o ecrã bloqueado — é uma restrição do **browser**, não do problema em si. Uma app Unity nativa (Android/iOS) usa a API de localização do próprio sistema operativo diretamente, sem depender de uma página estar visível. Isto elimina de vez a necessidade do "Wake Lock", do diagnóstico `gps_diag` como muleta para perceber perdas de sinal, e do aviso "mantém a app em primeiro plano" — o problema simplesmente deixa de existir. Ainda assim, num telefone Android é preciso pedir a permissão de localização em segundo plano e (dependendo da versão do Android) correr um foreground service com notificação — o mesmo mecanismo já montado para a app Capacitor (`@capacitor-community/background-geolocation`, ver secção 27 do `DOCUMENTACAO.md`) serve de referência do que o SO exige.

### 3.2 Filtros anti-ruído (reimplementar tal como estão)

```
MAX_ACCURACY_M = 20          // ignora leituras de GPS com precisão pior que isto
MIN_MOVEMENT_M = 3           // ignora deriva de GPS parado (independente de velocidade)
MAX_SAFE_SPEED_KMH = 16      // acima disto, o segmento é DESCARTADO (não conta), sem piso mínimo
SPEED_VIOLATION_GRACE_READINGS = 2  // só a 2ª leitura seguida acima do teto conta como violação real
```

**A âncora de posição avança sempre**, mesmo quando um segmento é rejeitado por velocidade — nunca fica presa na última posição válida (isso causa uma "bola de neve": distância real cada vez maior face a uma âncora cada vez mais desatualizada, disparando o filtro em cascata). Usa **duas** âncoras separadas:
- `lastPosition` — avança em toda leitura, usada para velocidade/deteção de atividade/teto de segurança.
- `lastCountedPosition` — só avança quando um segmento é de facto creditado a distância/calorias (evita que leituras de GPS mais frequentes que o tempo necessário para percorrer `MIN_MOVEMENT_M` nunca cheguem a creditar nada).

### 3.3 Deteção automática de atividade (Caminhar/Correr)

Sem escolha manual de modo — classificado pela **velocidade média de uma janela deslizante**:

```
ACTIVITY_WINDOW_SECONDS = 20      // janela da média (ponderada pelo tempo entre amostras)
ACTIVITY_HYSTERESIS_SECONDS = 8   // só confirma mudança de categoria após manter-se estável por este tempo
ACTIVITY_STOPPED_MAX_KMH = 2      // < 2 km/h = parado (não credita distância/calorias)
ACTIVITY_WALK_MAX_KMH = 6.5       // 2–6.5 = caminhar
                                   // 6.5–16 (teto de segurança) = correr
```

"Parado" não credita distância nem calorias, mas a âncora continua a avançar (nunca fica presa). O **modo dominante** da sessão (gravado em `training_sessions.mode`) é o que ocupou mais tempo acumulado, não o modo do último segmento.

### 3.4 Fórmula de calorias (MET, ACSM)

Calculada **por segmento** (velocidade real desse segmento), somada ao longo da sessão:

```
Calorias = MET × peso_kg × horas

Caminhar: VO2 (ml/kg/min) = 0.1 × velocidade(m/min) + 3.5;  MET = VO2 / 3.5
Correr:   VO2 (ml/kg/min) = 0.2 × velocidade(m/min) + 3.5;  MET = VO2 / 3.5

peso_kg: omissão 70 kg se o jogador ainda não o preencheu
```

**Calorias são a unidade base de XP/nível/leaderboard** — não a distância. A distância real continua a ser guardada e mostrada (histórico, conquistas de distância/ritmo), mas não alimenta o nível.

### 3.5 Bloqueio de treino concorrente

Duas camadas, ambas necessárias porque resolvem problemas diferentes:
- **Mesmo dispositivo, duas instâncias** — um identificador de sessão local com heartbeat; só uma pode ter um treino ativo de cada vez.
- **Dois dispositivos, mesma conta** — `player_progress.training_lock_owner`/`training_lock_heartbeat_at`: reclamado ao iniciar um treino, renovado a cada 30s, expira sozinho ao fim de 90s sem sinal de vida (uma app crashada não bloqueia o jogador para sempre).

---

## 4. Nível / XP

```
incremento(n) = round(LEVEL_BASE × n^LEVEL_EXP)
LEVEL_BASE = 100
LEVEL_EXP = 1.1

1 XP = 1 kcal (mostrado ao jogador como XP; internamente são as calorias vitalícias)
```

O nível é sempre **recalculado ao vivo** a partir das calorias vitalícias — nunca uma coluna gravada por si só. Subir de nível concede pontos de status (`LEVEL_UP_POINTS = 1` por nível); a atribuição tem de cobrir **todos** os níveis entre o último premiado e o atual (não só o nível "mais recente"), para uma correção de dados no servidor nunca deixar pontos por atribuir.

| Nível | Calorias para subir | Total acumulado |
|---:|---:|---:|
| 1→2 | 100 | 100 |
| 5→6 | 587 | 1.695 |
| 10→11 | 1.259 | 6.628 |
| 20→21 | 4.913 | 45.198 |
| — | — | ~1.197.725 kcal até ao nível 100 |

---

## 5. Pontos de status e fórmulas

```
STARTING_UNSPENT_POINTS = 4     // oferta inicial, só quando a chave nunca foi gravada
LEVEL_UP_POINTS = 1             // por nível de personagem subido
```

Bónus por derrotar criaturas, escalado pelas estrelas da vitória (nunca paga duas vezes pela mesma vitória — só a **diferença** ao melhorar estrelas numa re-luta):
```
3 estrelas → pontuação máxima (MINI_BOSS_MAX_POINTS=3 / BOSS_MAX_POINTS=5)
2 estrelas → máxima − 1
1 estrela  → máxima − 2 (nunca abaixo de 0)
```

### 5.1 Status do jogador

```
Vida    = PLAYER_BASE_VIDA    + armadura.vida(Lv)    + round(Energia^ENERGIA_EXP)
Ataque  = PLAYER_BASE_ATAQUE  + arma.ataque(Lv)      + round(Força^FORCA_EXP)
Defesa  = PLAYER_BASE_DEFESA  + escudo.defesa(Lv)    + round(Resistência^RESISTENCIA_EXP)

PLAYER_BASE_VIDA = 100, PLAYER_BASE_ATAQUE = 10, PLAYER_BASE_DEFESA = 10
ENERGIA_EXPONENT = 1.8, FORCA_EXPONENT = 1.5, RESISTENCIA_EXPONENT = 1.2

Regeneração (vida/s) = REGENERACAO_BASE + (Energia + armadura.bonusEnergia(Lv))^REGENERACAO_EXPONENT
REGENERACAO_BASE = 0.2, REGENERACAO_EXPONENT = 0.8

Velocidade de Ataque (ataques/s) = ATTACK_SPEED_BASE + ATTACK_SPEED_POR_NIVEL_ARMA × (nível da Arma − 1)
Alcance (m) = ATTACK_RANGE_BASE_M + ATTACK_RANGE_POR_NIVEL_ESCUDO × (nível do Escudo − 1)
ATTACK_SPEED_BASE = 1, ATTACK_SPEED_POR_NIVEL_ARMA = 0.05   (nível 1 = 1/s, nível 100 = 5.95/s)
ATTACK_RANGE_BASE_M = 4, ATTACK_RANGE_POR_NIVEL_ESCUDO = 0.04  (nível 1 = 4m, nível 100 = 7.96m)
```

"Nível efetivo" de Energia/Força/Resistência = pontos investidos + bónus da peça de equipamento correspondente (é este valor, não só os pontos em bruto, que entra nas fórmulas acima e que é mostrado ao jogador). Sem esquiva nem crítico — removidos por completo; Velocidade de Ataque/Alcance substituem-nos.

### 5.2 Status dos monstros (fórmula recursiva aditiva, distinta da do jogador)

```
Valor(1) = STAT_BASE
Valor(n) = round(Valor(n-1) + STAT_FLAT + n × STAT_PERCENT)

STAT_BASE = { vida: 100, ataque: 50, defesa: 10 }
STAT_FLAT = { vida: 4, ataque: 2, defesa: 2 }
STAT_PERCENT = { vida: 0.89, ataque: 0.45, defesa: 0.16 }
```

Cada uma das 20 criaturas geradas (10 mini-bosses + 10 bosses) recebe também um multiplicador de **arquétipo**, atribuído ciclicamente por posição na sequência:

| Arquétipo | Vida | Ataque | Defesa |
|---|---:|---:|---:|
| Equilibrado | ×1.00 | ×1.00 | ×1.00 |
| Tanque | ×1.20 | ×0.85 | ×1.20 |
| Glass Cannon | ×0.80 | ×1.35 | ×0.70 |
| Bruiser | ×1.05 | ×1.15 | ×0.85 |
| Fortaleza | ×0.95 | ×0.85 | ×1.45 |

O arquétipo nunca é mostrado ao jogador. Vida dos monstros escondida ("****") até à primeira luta.

---

## 6. Equipamento (Arma / Escudo / Armadura)

Uma única peça por tipo, nível contínuo 1–100 (`EQUIP_MAX_LEVEL`), sem RNG/drop — sobe pagando materiais, disponível desde o primeiro login.

```
peça.primário(Lv)   = base + round(Lv ^ expoentePrimário)
peça.secundário(Lv) = round(min(1, (Lv-1)/(EQUIP_SECONDARY_RAMP_LEVELS-1))^EQUIP_SECONDARY_EXPONENT × EQUIP_SECONDARY_MAX)

expoentePrimário: Arma = 1.45, Escudo = 1.35, Armadura = 1.05
EQUIP_SECONDARY_EXPONENT = 0.5, EQUIP_SECONDARY_MAX = 20, EQUIP_SECONDARY_RAMP_LEVELS = 20
base: Arma(Ataque) = 5, Escudo(Defesa) = 2, Armadura(Vida) = 3
```

O bónus secundário satura por volta do nível 20 (chega ao máximo e fica); do nível 20 ao 100 só sobe o primário.

### 6.1 Custo por nível (materiais do mapa, secção 7)

Curva de custo por janelas de nível, `base × fator^(nível_de_origem − entrada)`:

| Peça | Recurso | Janela (Nv) | base | fator |
|---|---|:-:|--:|--:|
| Arco (Ataque) | madeira (sempre a maior) | 1–99 | 35 | 1.06 |
| | pele | 1–29 | 22 | 1.06 |
| | ferro | 30–99 | 110 | 1.065 |
| Escudo (Defesa) | madeira | 1–99 | 30 | 1.06 |
| | pele | 1–29 | 25 | 1.06 |
| | ferro | 30–99 | 150 | 1.065 |
| Armadura (Vida) | pele (predominante sempre) | 1–99 | 35 | 1.06 |
| | madeira | 1–29 | 20 | 1.06 |
| | ferro | 30–99 | 130 | 1.06 |

Totais Nv1→100 aproximados: Arco ~325k, Escudo ~349k, Armadura ~313k.

---

## 7. Fortaleza (armazém)

```
WAREHOUSE_MAX_LEVEL = 100
WAREHOUSE_CAP_BASE = 200
WAREHOUSE_CAP_EXP = 1.7

tecto_por_recurso(nível) = round(200 × nível^1.7)
```

Custo de melhoria (por recurso, janelas de nível, `base × fator^(nível_de_origem − entrada)`):

| Recurso | Janela (Nv) | base | fator |
|---|:-:|--:|--:|
| madeira | 1–49 | 100 | 1.05 |
| pele | 1–29 | 22 | 1.075 |
| pedra | 30–49 | 200 | 1.075 |
| pedra | 50–99 | 1200 | 1.075 |
| barro | 50–99 | 700 | 1.075 |
| ferro | 75–99 | 5800 | 1.075 |

O custo fica sempre bem abaixo do teto do próprio nível — nunca há bloqueio circular.

---

## 8. Combate (fórmula de dano)

```
Bruto = Ataque_atacante − BATTLE_DEFENSE_PERCENT × Defesa_defensor
Base = max(BATTLE_FLOOR_PERCENT × Ataque_atacante, Bruto)
Variação = DAMAGE_VARIANCE_MIN + aleatório(0, 1 − DAMAGE_VARIANCE_MIN)
Dano = round(Base × Variação)

BATTLE_DEFENSE_PERCENT = 0.6, BATTLE_FLOOR_PERCENT = 0.5, DAMAGE_VARIANCE_MIN = 0.8
```

A variação aleatória aplica-se **depois** do piso mínimo (não antes) — senão builds com defesa forte davam sempre o mesmo número exato, sem variação visível. Sem esquiva nem crítico (removidos por completo). Regeneração corre também durante o combate: jogador `Regeneração × Δt`; monstro `MONSTER_REGEN_PERCENT` (1%) da própria Vida máxima por troca de ataques.

**Duelos (mini-bosses/bosses)**: sequenciais (só desbloqueia o próximo depois de derrotar o anterior), re-lutáveis, guarda-se sempre o **melhor** resultado (estrelas) de sempre. `MINI_BOSS_LEVEL_STEP = 5`, `BOSS_LEVEL_STEP = 10`, até `MAX_LEVEL_TO_GENERATE = 100` (10 de cada).

**Nota de estado (versão web, 2026-09-29)**: o ciclo de turnos automático descrito acima está **pausado** do lado do monstro na arena top-down atual (o jogador ataca, o monstro não contra-ataca nem há vitória/recompensa quando a vida dele chega a 0) — mas a fórmula de dano em si é a única usada tanto na arena como nas hordas (secção 10), e deve ser a base do combate em Unity independentemente de como a versão web decidir terminar essa peça.

---

## 9. Hordas

```
HORDE_INTERVAL_MS = 23h                  // entre o fim de uma horda e o início da seguinte
HORDE_SPAWN_STAGGER_MS = 500ms           // atraso entre o nascimento de cada monstro
velocidade do monstro = 1 m/s
cadência de ataque do monstro = 1/s, dano à Vida ATUAL do jogador (partilhada com os duelos)
HORDE_ROUBO_POR_RECURSO = 10             // por recurso, uma única vez, se a Vida chegar a 0
placeholder de stats do monstro: vida 20, ataque 4, defesa 0 (por afinar)
```

- **Horda N = N monstros**, mas só sobe quando a horda **anterior é vencida** pelo jogador (uma derrota repete o mesmo número na seguinte).
- Se a Vida do jogador chegar a 0: saque imediato (10 de cada um dos 5 recursos, por cada monstro ainda vivo nesse momento) e a horda termina ali, sem esperar o jogador matar o resto.
- A personagem dispara sozinha à cadência/alcance de Velocidade de Ataque/Alcance (secção 5.1) — mesma fórmula de dano da secção 8.
- Vida partilhada com os duelos (`getCurrentHp`), sem barra de "vida da Fortaleza" à parte.
- Relatório por horda: vitória/derrota, monstros no total/derrotados, dano causado/sofrido, recursos perdidos (se derrota) — últimos 20 guardados.

---

## 10. Território (hexágonos H3)

```
HEX_RESOLUTION = 9   // ~427m diâmetro, ~0.114 km², ~14 hexágonos numa caminhada de 5km
```

- Grelha **hexagonal** via H3 (biblioteca `h3-js`/porta C# equivalente — não reinventar a matemática de hexágonos sobre uma esfera).
- Só se regista um hexágono como descoberto em segmentos que **já contaram como deslocamento real** (mesmos filtros da secção 3.2) — nunca em qualquer leitura de GPS.
- **Privacidade deliberada**: guarda-se só o ID da célula H3, nunca coordenadas exatas.
- `resolution` gravada por linha — mudar a resolução no futuro não invalida o histórico, só deixa de somar enquanto a resolução em vigor for outra.
- **Concelho, não distrito**, é a unidade que desbloqueia território para efeitos de jogo (308 concelhos vs. 18 distritos — granularidade certa para "coleção"). Resolução do concelho a partir de um ponto GPS via **Nominatim** (OpenStreetMap): `reverse` (freguesia) → `details` (hierarquia administrativa) → `lookup` (fronteiras do concelho e do distrito). Rate-limit de 1 pedido/segundo do serviço público — só se pergunta para hexágonos que não caem dentro de nenhum concelho já conhecido (testado localmente, de graça, por ray casting).
- **Nenhuma região está escrita no código** — tudo derivado dos hexágonos já descobertos pelo próprio jogador.

Esta dependência de um serviço público de terceiros (Nominatim) é um ponto a decidir na reescrita: manter a mesma chamada em runtime (mesmo rate-limit a respeitar), ou pré-calcular/empacotar as fronteiras dos 308 concelhos como um asset local no próprio jogo (elimina a dependência externa e o rate-limit, ao custo de um asset maior e sem atualizações automáticas se as fronteiras administrativas mudarem).

---

## 11. Economia de recursos

```
Recursos: Ferro, Madeira, Pele (22% cada) · Pedra, Barro (17% cada)
Arco = madeira + ferro · Escudo = madeira + pele · Armadura = pele + ferro · Fortaleza = pedra + barro
```

**Produção por hora, por depósito encontrado** (sem níveis, sem multiplicadores):

```
ganho_por_hora(recurso) = G + (B × n) × (G + n)
G = EXPLORACAO_POR_HORA = 10     // "exploração" da Fortaleza, sempre ativa, 1 por recurso, mesmo sem nenhum depósito
B = DEPOSITO_BONUS_FRACAO = 0.1
n = depósitos já encontrados desse recurso

n=0 → 10/h · n=1 → 11.1 · n=2 → 12.4 · n=5 → 17.5 · n=10 → 30 · n=20 → 70 · n=24 → 91.6
```

Sem teto próprio — o teto é sempre o armazém da Fortaleza (secção 7). Um hexágono descoberto sem depósito não produz nada por si só; o "chão" de 10/h por recurso vem só das explorações da Fortaleza (sempre ativas desde o nível 1).

**Número de depósitos por concelho**, escala logaritmicamente com a área (ancorado no menor concelho do país, São João da Madeira, 7.9 km²):

```
depósitos_por_recurso = max(10, round(10 × (1 + log10(área_km2 / 7.9))))
// São João da Madeira → 10 · Braga (183 km²) → 24 · Odemira (1721 km², maior do país) → 33
```

Colocação **determinista** a partir do `osm_id` do concelho (mesmas minas em qualquer dispositivo, nada gravado exceto quais já foram encontradas) — um gerador pseudo-aleatório com seed no `osm_id`, baralhando uma "saca" com N de cada recurso e amostrando pontos dentro da fronteira do concelho. Duas minas nunca partilham hexágono. Radar sonoro/visual a 1 km de distância de um depósito ainda não encontrado.

---

## 12. Missões mensais

**9 missões por mês, sem dificuldade rotulada ao jogador** (3 "grupos" internos que só decidem alvo/recompensa):

```
MISSION_MAX_ATIVAS = 3            // até 3 ativas ao mesmo tempo, quaisquer que sejam
MISSION_REJECT_COOLDOWN_MS = 12h  // desistir de UMA trava a ativação de QUALQUER outra por 12h
```

Pools (3 tipos por grupo, sempre os mesmos 9 no total):
```
grupo A: [correr_km, caminhar_km, descobre_hex]      alvo 15/35/70 km (correr/caminhar) · 8 hexágonos
grupo B: [correr_km, caminhar_km, descobre_mina]     alvo 15/35/70 km · 1 depósito de um recurso específico
grupo C: [correr_km, caminhar_km, descobre_concelho] alvo 15/35/70 km · 1 concelho novo
```
Recompensa por grupo: 50 / 120 / 300 unidades de um recurso, sorteado deterministicamente por mês (mesmo mecanismo das missões em si).

**Geradas deterministicamente**, não guardadas: `seed = hash("missoes:" + "AAAA-MM")` → um gerador pseudo-aleatório (ex.: mulberry32) decide o conteúdo do mês. Só o **estado** (ativas, concluídas, cooldown) é persistido.

**Regras de progresso**:
- Conta a partir do **instante em que a missão é aceite**, nunca desde o início do mês.
- `correr_km`/`caminhar_km`: acumulador — soma a distância desse modo específico no fim de cada treino. **Se aceite a meio de um treino já em curso**, tem de subtrair um `offset` capturado no momento de aceitar (a distância já percorrida nessa sessão antes da missão existir) — sem isto, a missão recebe crédito retroativo indevido (bug real corrigido na versão web em 2026-09-29).
- `descobre_hex`/`descobre_mina`/`descobre_concelho`: baseline no momento de aceitar, progresso = contagem atual − baseline.
- Cada um dos 9 **tipos** (não só o grupo) só pode ser concluído **uma vez por mês** — um jogador dedicado pode fechar as 9.
- Verificação **ao vivo**, não só no fim do treino — uma missão que fecha a meio de uma caminhada deve dar feedback imediato (popup, recompensa), não esperar o jogador carregar em "Terminar".
- Conquistas de missões usam contadores **vitalícios próprios**, nunca repostos (distintos do progresso mensal, que reinicia todos os meses).

---

## 13. Conquistas

~123 conquistas (2026-08-10, foi crescendo), organizadas por categoria: Distância, Calorias, Frequência, Combate, Exploração, Missões, Progresso, Liderança, Ritmo. Tipos principais:

- `sessionDistance`/`lifetimeDistance` — recorde de sessão (por modo) e total vitalício (combinado).
- `sessionCalories`/`lifetimeCalories` — mesma lógica, em calorias (não separadas por modo — a fórmula MET já normaliza esforço).
- `trainingCount`, `streak` (maior sequência de dias distintos de sempre), `fullMonthTrained`, `activeWeekend`, `distinctMonths`.
- `bossDefeated`, `creatureStars`, `allMiniBossesThreeStars`, `allBossesThreeStars`, `allCreaturesDefeated`.
- `characterLevel` (marcos de nível), `equipmentMaxed` (uma peça / as 3), `battleCount`.
- `achievementCount` — meta, conta conquistas desbloqueadas (excluindo medalhas mensais de propósito).
- `sessionTime` (`early_bird`/`night_owl`, hora local do início do treino), `allModesTrained`.
- `pace`/`personalRecord` — ritmo por modo.
- **Exploração** (13): hexágonos, concelhos, depósitos encontrados, "todos os recursos".
- **Missões** (24): marcos por tipo/total + "Mês Perfeito" (as 9 no mesmo mês).
- **Medalha mensal**: 12 cartões fixos (um por mês de calendário), procuram em qualquer ano se já houve pódio nesse mês.

**Medalhas mensais — modelo de confiança**: quem faz login primeiro depois da virada do mês publica o top 3 do mês anterior (por calorias) em `monthly_medals` — qualquer jogador autenticado pode inserir uma linha para qualquer `user_id` (sem Edge Function/service role a validar). Aceitável só para um grupo pequeno de confiança; **não replicar este modelo se a base de jogadores crescer** — nessa altura isto deveria passar a ser calculado do lado do servidor.

---

## 14. Constantes de equilíbrio — tabela única

Todas vivem hoje num único ficheiro (`js/game-config.js`) e assim deve continuar em Unity (um `ScriptableObject` ou classe estática única) — a lição da versão web foi cara: valores de economia do jogo nunca podem ser overrides locais por dispositivo (ver DOCUMENTACAO.md secção 11), têm de ser iguais para toda a gente, sempre.

```
LEVEL_BASE = 100                          LEVEL_EXP = 1.1
STAT_BASE = {vida:100, ataque:50, defesa:10}
STAT_FLAT = {vida:4, ataque:2, defesa:2}
STAT_PERCENT = {vida:0.89, ataque:0.45, defesa:0.16}
PLAYER_BASE_VIDA = 100    PLAYER_BASE_ATAQUE = 10   PLAYER_BASE_DEFESA = 10
ENERGIA_EXPONENT = 1.8    FORCA_EXPONENT = 1.5      RESISTENCIA_EXPONENT = 1.2
REGENERACAO_BASE = 0.2    REGENERACAO_EXPONENT = 0.8
ATTACK_SPEED_BASE = 1     ATTACK_SPEED_POR_NIVEL_ARMA = 0.05
ATTACK_RANGE_BASE_M = 4   ATTACK_RANGE_POR_NIVEL_ESCUDO = 0.04
LEVEL_UP_POINTS = 1       STARTING_UNSPENT_POINTS = 4
MAX_ACCURACY_M = 20       MIN_MOVEMENT_M = 3        MAX_SAFE_SPEED_KMH = 16
ACTIVITY_STOPPED_MAX_KMH = 2   ACTIVITY_WALK_MAX_KMH = 6.5   ACTIVITY_RUN_MAX_KMH = 14
ACTIVITY_WINDOW_SECONDS = 20   ACTIVITY_HYSTERESIS_SECONDS = 8
SPEED_VIOLATION_GRACE_READINGS = 2
HEX_RESOLUTION = 9
MINI_BOSS_LEVEL_STEP = 5   BOSS_LEVEL_STEP = 10   MAX_LEVEL_TO_GENERATE = 100
MINI_BOSS_MAX_POINTS = 3   BOSS_MAX_POINTS = 5
BATTLE_DEFENSE_PERCENT = 0.6   BATTLE_FLOOR_PERCENT = 0.5   DAMAGE_VARIANCE_MIN = 0.8
MONSTER_REGEN_PERCENT = 1  (%)
EQUIP_MAX_LEVEL = 100
WEAPON_PRIMARY_EXPONENT = 1.45   SHIELD_PRIMARY_EXPONENT = 1.35   ARMOR_PRIMARY_EXPONENT = 1.05
EQUIP_SECONDARY_EXPONENT = 0.5   EQUIP_SECONDARY_MAX = 20   EQUIP_SECONDARY_RAMP_LEVELS = 20
WAREHOUSE_MAX_LEVEL = 100   WAREHOUSE_CAP_BASE = 200   WAREHOUSE_CAP_EXP = 1.7
EXPLORACAO_POR_HORA (G) = 10   DEPOSITO_BONUS_FRACAO (B) = 0.1
HORDE_INTERVAL_MS = 23h   HORDE_SPAWN_STAGGER_MS = 500ms   HORDE_ROUBO_POR_RECURSO = 10
MISSION_MAX_ATIVAS = 3   MISSION_REJECT_COOLDOWN_MS = 12h
```

(Curvas de custo por recurso — equipamento secção 6.1, Fortaleza secção 7 — ficam como tabelas à parte acima, não cabem numa lista de constantes simples.)

---

## 15. O que Unity ganha "de graça" vs. o que precisa de trabalho novo

**Resolve-se sozinho ao mudar de motor** (não precisa de nenhuma lógica nova, só de configurar a plataforma):
- GPS em segundo plano com o ecrã bloqueado (secção 3.1) — o problema que motivou toda esta reescrita.
- Notificações push nativas de verdade (FCM/APNs), sem a complexidade de Web Push + VAPID que a versão web/Capacitor teve de montar à mão.
- Performance de renderização 3D muito superior a Three.js num WebView.
- Distribuição por loja de aplicações (Play Store/App Store), incluindo atualizações automáticas — hoje inexistente mesmo na app Capacitor (secção 27 do `DOCUMENTACAO.md`).

**Precisa de trabalho novo, sem atalho**:
- Toda a interface (UGUI/UI Toolkit) — nada do HTML/CSS é reaproveitável.
- Toda a cena 3D (câmaras, animações, modelos) — os `.glb` existentes podem servir de referência visual, mas a integração em si (slots de equipamento, animação Mixamo, arena top-down) é código Three.js específico, sem equivalente direto em Unity.
- Um cliente C# para o Supabase (REST direto ou uma biblioteca como `supabase-csharp`), incluindo reimplementar a reconciliação campo-a-campo da secção 1.1.
- A decisão sobre Nominatim (secção 10) — chamar o mesmo serviço externo ou empacotar as fronteiras dos concelhos como asset local.
- GPS em segundo plano no Android/iOS exige permissões e (Android) um foreground service — não é automático só por estar num motor nativo, mas é uma API do próprio SO, não uma limitação estrutural como no browser.

---

## 16. Por decidir antes de começar a codificar

- **2D ou 3D?** Não confirmado com o Victor nesta sessão — o jogo web usa Three.js para um herói/arena/torre em 3D; Unity permite qualquer um dos dois.
- **Reaproveitar os modelos `.glb` existentes** (`assets/*.glb`) ou desenhar de novo para Unity? Formato compatível (glTF), mas todo o rigging/slots/animação teria de ser reconfigurado no Animator do Unity de qualquer forma.
- **Nominatim em runtime vs. dados de concelhos empacotados** (secção 10).
- **Alvo de plataforma**: Android primeiro (como a app Capacitor), iOS depois, ou os dois desde o início — Unity torna isto mais barato de ter os dois em paralelo do que a abordagem Capacitor atual.
- **O que fazer ao ciclo de combate pausado** (secção 8) — decidir os modos de ataque do monstro/vitória-derrota antes ou depois da reescrita, já que a versão Unity vai precisar de uma resposta de qualquer forma.
