# Personagem 3D — Estado da Arte

> Documento gerado a partir de toda a conversa de desenvolvimento. Descreve o estado atual do projeto: arquitetura, fórmulas, decisões de design e limitações conhecidas.

**Repositório:** [VictorMarcal/personagem-3d-site](https://github.com/VictorMarcal/personagem-3d-site)
**Site publicado:** https://victormarcal.github.io/personagem-3d-site/ (GitHub Pages)

## 1. O que é

Um site que transforma distância percorrida na vida real (GPS) em progressão de um personagem 3D estilo RPG: sobe de nível, ganha pontos de status, evolui equipamento (armadura/arma/escudo), desbloqueia e derrota monstros/bosses em duelos por turnos, e desbloqueia conquistas.

## 2. Stack técnico

- **HTML/CSS/JS puro**, sem framework, sem build step
- **Three.js r142** (build clássica não-modular, via CDN jsDelivr) — escolhida deliberadamente em vez de ES modules porque testes locais via `file://` bloqueiam módulos ES6 por CORS
- **`localStorage`** para toda a persistência (sem backend/base de dados)
- **GitHub Pages** para hosting estático
- Sem dependências de build (npm, bundlers) — tudo corre diretamente no browser

## 3. Estrutura de ficheiros

| Ficheiro | Responsabilidade |
|---|---|
| `index.html` | Estrutura da página, todos os elementos de UI |
| `css/style.css` | Todo o estilo (tema escuro, mobile-first) |
| `js/main.js` | Cena 3D (Three.js): personagem, equipamentos, monstro placeholder, câmara, rotação por arraste, raycasting de equipamento |
| `js/debug.js` | Centraliza **todas** as variáveis afináveis do jogo + ferramentas de debug (reset, simulador de distância) |
| `js/equipment.js` | Stats do personagem, níveis de equipamento, fórmula de valor de status, upgrade |
| `js/experience.js` | Curva de nível do personagem, cálculo de progresso |
| `js/monsters.js` | Geração de monstros/bosses, regra de desbloqueio, renderização do carrossel "Batalhas" |
| `js/achievements.js` | Sistema de conquistas |
| `js/battle.js` | Lógica de combate por turnos, popup fullscreen de batalha |
| `js/training.js` | GPS, tracking de distância, sessões de treino, filtros de ruído |
| `js/orientation.js` | Aviso de rodar para retrato em dispositivos touch |

Ordem de carregamento dos scripts (importa por causa de dependências entre módulos):
`main → debug → equipment → experience → monsters → achievements → battle → training → orientation`

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

- `QUARTERS_PER_LEVEL = 4` pontos por nível, distribuídos a cada 25% de progresso dentro do nível atual (não só no fim) — dá feedback mais frequente
- Pontos só contam com base em **distância confirmada** (nunca a sessão de treino em curso, que pode ainda ser perdida)

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

## 8. Monstros e Bosses

- `MONSTER_LEVEL_STEP = 3`, `BOSS_LEVEL_STEP = 10`, `MAX_LEVEL_TO_GENERATE = 60` (ajustável)
- Níveis múltiplos de 10 ficam reservados exclusivamente para bosses (sem monstro duplicado no mesmo nível)
- **Regra de desbloqueio**: nível do personagem ≥ nível da criatura **E** a criatura anterior na sequência já derrotada (bosses não têm exceção — também seguem esta regra)
- Podem ser **re-lutados** depois de derrotados ("Lutar novamente")
- Card "Batalhas": mostra só uma janela de **5 criaturas em carrossel horizontal**, sempre centrada na próxima por derrotar (nunca a lista inteira)

## 9. Sistema de duelos

- Botão "Batalhar" em cada monstro desbloqueado → abre um **popup fullscreen** (o `#viewer` 3D torna-se `position: fixed` a cobrir o ecrã todo, câmara afasta-se, personagem à esquerda, monstro placeholder de cor diferente à direita)
- Turnos automáticos, jogador ataca sempre primeiro: Ataque(jogador) → Defesa(monstro) → Ataque(monstro) → Defesa(jogador) → repete
- **Fórmula de dano** (com piso mínimo para nunca dar zero/negativo, o que causaria ciclos infinitos):

```
Dano = max(BATTLE_FLOOR_PERCENT × Ataque_atacante, Ataque_atacante − BATTLE_DEFENSE_PERCENT × Defesa_defensor)
BATTLE_DEFENSE_PERCENT = 0.6, BATTLE_FLOOR_PERCENT = 0.5
```

- **Porquê a troca de curvas Ataque/Defesa**: com as curvas originais (Defesa maior que Ataque), o dano dava sempre negativo em qualquer nível/build. Trocar as curvas resolveu a maior parte dos casos, mas builds extremos (100% investidos numa só stat) ainda podiam ficar presos em impasses ou derrotas garantidas — daí a necessidade do piso mínimo.
- Vida do jogador é sempre recalculada do zero no início de cada batalha (nunca herda dano de lutas anteriores)
- Vitória contra um boss marca-o como derrotado e desbloqueia o próximo da sequência

## 10. Conquistas

Card "Conquistas": mostra as 5 mais recentes (desbloqueadas primeiro, por ordem de desbloqueio; depois as mais próximas de completar). Botão "Ver todas" abre popup fullscreen com a grelha completa (5 colunas × N linhas).

**Tipos implementados:**
- `sessionDistance` — melhor distância numa única sessão contínua (1km, 5km, 10km, meia maratona, maratona)
- `trainingCount` — número de treinos concluídos (1, 5, 10, 25, 50)
- `bossDefeated` — gerado automaticamente por boss (sincronizado com a lista de monstros)
- `pace` — distância + tempo limite (ex: 5km em menos de 25 min)

Cada conquista tem ícone (emoji como placeholder), nome e um destaque visual verde quando desbloqueada (sem barra de progresso — foi removida a pedido).

**Importante**: o simulador de distância por tempo (Debug) trata o tempo simulado como uma sessão de treino real para efeitos de conquistas — sem isto, conquistas de distância nunca desbloqueariam ao testar via simulador.

## 11. Debug

Card com todos os valores públicos ajustáveis em tempo real (sem precisar de editar código):

- Curva de nível (`LEVEL_BASE`, `LEVEL_EXP`)
- Curvas de status × 3 (`STAT_BASE/FLAT/PERCENT` para Vida, Ataque, Defesa)
- Pontos por nível (`QUARTERS_PER_LEVEL`)
- Filtros de GPS (`MAX_ACCURACY_M`, `MIN_MOVEMENT_M`, `MAX_SPEED_KMH`)
- Geração de monstros (`MONSTER_LEVEL_STEP`, `BOSS_LEVEL_STEP`, `MAX_LEVEL_TO_GENERATE`)
- Fórmula de combate (`BATTLE_DEFENSE_PERCENT`, `BATTLE_FLOOR_PERCENT`)
- **Simulador de distância por tempo**: liga/desliga um timer que soma `segundos × fator` à distância vitalícia, fator ajustável em tempo real — para testar níveis altos sem andar de verdade
- **Reset de personagem**: apaga nível, status, pontos, monstros derrotados e conquistas (com confirmação)

## 12. UI / UX

- Mobile-first; página com scroll (deixou de ser "uma tela só" quando o conteúdo cresceu)
- Aviso para rodar o dispositivo aparece só em ecrãs touch em modo paisagem (deteção via JS: `matchMedia` + `maxTouchPoints`, não só CSS)
- HUD do personagem sobreposto ao visualizador 3D: nível, os 3 status, e o nível de cada equipamento com botão **"+"** que só aparece quando há pontos disponíveis
- Equipamento pode ser evoluído de duas formas: a) tocar na peça no modelo 3D (espada=Ataque, escudo=Defesa, corpo=Vida/Armadura) b) botão "+" no HUD
- Personagem gira por arraste/toque (câmara fixa); toque curto sem arrastar seleciona equipamento (raycasting Three.js)

## 13. Decisões de design relevantes (porquês)

- **Sem OrbitControls**: câmara fixa por pedido explícito; só o personagem roda
- **jsDelivr em vez de unpkg + preconnect**: reduz latência inicial de carregamento do Three.js
- **`100dvh` em vez de `100vh`**: lida melhor com a barra de endereço móvel que aparece/desaparece
- **Emojis como ícones de conquistas**: placeholder deliberado, consistente com o resto do site (cápsulas, caixas coloridas) — substituível por ícones customizados no estilo "flat, duas cores" mais tarde
- **Um `.hidden { display: none; }` genérico no CSS**: adicionado depois de um bug em que elementos de batalha ficavam sempre visíveis por faltar a regra CSS correspondente à classe

## 14. Limitações conhecidas / possíveis próximos passos

- Combate é **totalmente automático** (sem escolhas do jogador durante a luta)
- Ícones de conquistas são emoji, não arte customizada
- Bloqueio de paisagem no mobile é só um **aviso**, não um bloqueio real (tecnicamente impossível de forçar via web/PWA no iOS)
- Não é uma PWA (sem `manifest.json`/service worker) — instalável no ecrã inicial mas sem funcionar totalmente offline
- Se convertida para app: PWA é o caminho mais simples (quase nenhuma alteração de código); Capacitor permite lojas de apps com esforço moderado; reescrita nativa exigiria substituir Three.js por um motor 3D nativo
- Todos os dados vivem em `localStorage` do dispositivo — sem conta/sincronização entre dispositivos
