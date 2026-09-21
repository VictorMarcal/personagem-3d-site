// Changelog em linguagem simples para os jogadores (aba Perfil, card
// "Versao da Aplicacao") - traduz o historico de commits/versoes tecnicas
// (ver DOCUMENTACAO.md) para o que realmente mudou do ponto de vista de
// quem joga, ao estilo das notas de atualizacao de outros jogos. Cada
// entrada agrupa uma versao "menor" (x.Y) e os patches dela (x.Y.z),
// mais recente primeiro. Ao lancar uma versao nova, acrescentar aqui em
// vez de listar cada commit tecnico separadamente.
const CHANGELOG = [
  {
    version: "v6.50.1",
    title: "Teclado no Login",
    changes: [
      "Corrigido: ao escrever a palavra-passe no telemóvel, o teclado fazia aparecer o aviso 'rode o dispositivo para o modo retrato' por cima dos campos. Agora o aviso só aparece se o telemóvel estiver mesmo deitado.",
    ],
  },
  {
    version: "v6.50.0",
    title: "Bem-vindo ao Bootlands",
    changes: [
      "A app passa a chamar-se Bootlands (antes Personagem 3D). O jogo é o mesmo, só o nome mudou.",
    ],
  },
  {
    version: "v6.49.3",
    title: "Missões Mais Simples",
    changes: [
      "O texto das missões deixa de ter a palavra 'acumulado' (por exemplo, 'Corre 15 km'). O progresso continua a somar-se ao longo dos treinos.",
    ],
  },
  {
    version: "v6.49.2",
    title: "Câmara da Fortaleza",
    changes: [
      "A vista normal da Fortaleza passa a usar a câmara mais alta e recuada (a mesma do ataque das hordas), que mostra o terreno todo à volta da torre.",
    ],
  },
  {
    version: "v6.49.1",
    title: "Missões por Cores",
    changes: [
      "Os cartões de missão deixam de ter a etiqueta Fácil/Média/Difícil: a dificuldade passa a ser só a cor (verde, amarelo e vermelho, em tons suaves).",
    ],
  },
  {
    version: "v6.49.0",
    title: "Calorias Sempre Certas",
    changes: [
      "As calorias totais (e o XP) nunca podem passar da soma das calorias dos teus treinos. Se algum valor ficar inflacionado, a app corrige-o sozinha ao abrir.",
    ],
  },
  {
    version: "v6.48.1",
    title: "Novidades em Destaque",
    changes: [
      "As medalhas e os relatórios de batalha que ainda não abriste ficam destacados (fundo e contorno laranja, com um brilho suave) até clicares neles.",
    ],
  },
  {
    version: "v6.48.0",
    title: "Clicar Confirma a Novidade",
    changes: [
      "Os números de novidades das medalhas e dos relatórios de batalha já não desaparecem só por abrires os Troféus: desaparecem quando clicas na medalha ou no relatório.",
      "As medalhas e os relatórios ainda por ver mostram um ponto para saberes quais são.",
    ],
  },
  {
    version: "v6.47.0",
    title: "Relatórios de Batalha Detalhados",
    changes: [
      "Os relatórios de batalha passam a ser clicáveis: a lista mostra a horda, a data e o resultado.",
      "Ao clicar, abre um popup com os monstros derrotados e o total, o dano provocado, o dano sofrido e, em caso de derrota, os recursos perdidos.",
      "Relatórios antigos não têm dano registado e mostram '—' nesses campos.",
    ],
  },
  {
    version: "v6.46.0",
    title: "Explorações da Fortaleza",
    changes: [
      "A Fortaleza tem agora 5 explorações: Serraria (madeira), Pedreira (pedra), Gruta de ferro (ferro), Fazenda (pele) e Poça de barro (barro).",
      "Cada uma produz 1 recurso por hora, sempre, somado ao que os depósitos do mapa rendem.",
    ],
  },
  {
    version: "v6.45.0",
    title: "Depósitos com Nível",
    changes: [
      "As minas passam a chamar-se depósitos e têm nível 1, 2 ou 3 (0,3, 0,6 ou 0,9 recursos por hora), mostrado no centro do ícone.",
      "Só os depósitos produzem: hexágonos descobertos sem depósito já não rendem recursos.",
      "Os multiplicadores de revisita acabaram (e a conquista Terreno Conhecido também).",
    ],
  },
  {
    version: "v6.44.0",
    title: "Novidades Também no Reino",
    changes: [
      "O separador 'Reino' mostra agora um número quando há áreas novas desbloqueadas, minas encontradas ou depósitos cheios por ver.",
      "'Mapa' mostra áreas novas; 'Economia' mostra minas e depósitos.",
    ],
  },
  {
    version: "v6.43.0",
    title: "Números de Novidades",
    changes: [
      "Os separadores 'Reino' e 'Eu' mostram agora um número quando há conquistas ou relatórios de batalha novos por ver.",
      "O número desaparece assim que abres a secção onde essa novidade aparece.",
    ],
  },
  {
    version: "v6.42.1",
    title: "Corrige Posição das Minas Já Encontradas",
    changes: [
      "Corrigido: a mudança anterior (minas a escalar com o concelho) tinha deslocado a posição de minas já encontradas em alguns concelhos, mostrando o ícone fora do território já descoberto.",
    ],
  },
  {
    version: "v6.42.0",
    title: "Minas Escalam com o Concelho",
    changes: [
      "Concelhos maiores passam a ter mais minas de cada recurso (antes eram sempre 10, em qualquer concelho).",
      "Concelhos pequenos mantêm as 10 de sempre - só os grandes ganham mais.",
    ],
  },
  {
    version: "v6.41.0",
    title: "Radar de Minas Renovado",
    changes: [
      "Um só radar agora, com 1km de raio (antes eram dois avisos, a 500m e a 2,5km).",
      "O radar agora também faz o telemóvel vibrar, além do som e do aviso no ecrã.",
    ],
  },
  {
    version: "v6.40.1",
    title: "Som das Minas Não Fica Mudo",
    changes: [
      "Corrigido: o aviso de mina perto e o radar podiam ficar em silêncio a meio de um treino longo (ex: com o ecrã bloqueado) e nunca mais voltar a tocar nessa sessão.",
    ],
  },
  {
    version: "v6.40.0",
    title: "Calorias Só do Esforço Real",
    changes: [
      "O tempo em pausa deixou de contar para as calorias/XP de um treino - só o tempo ativo conta.",
      "O tempo em pausa continua visível no resumo e no histórico, só deixou de valer pontos.",
    ],
  },
  {
    version: "v6.39.5",
    title: "Blur do Mapa Como Antes",
    changes: ["Desfoque do mapa voltou ao valor original."],
  },
  {
    version: "v6.39.4",
    title: "Mapa Ainda Mais Colorido",
    changes: ["Saturação das cores do território já descoberto ajustada de novo, mais forte."],
  },
  {
    version: "v6.39.3",
    title: "Mapa Ainda Mais Colorido",
    changes: ["Saturação das cores do território já descoberto ajustada de novo, mais forte."],
  },
  {
    version: "v6.39.2",
    title: "Mapa Mais Colorido",
    changes: ["Cores do território já descoberto mais saturadas."],
  },
  {
    version: "v6.39.1",
    title: "Mapa Mais Nítido",
    changes: ["Cores do território já descoberto mais vivas, com um pouco menos de desfoque."],
  },
  {
    version: "v6.39.0",
    title: "Um Treino de Cada Vez",
    changes: [
      "Se já tiveres um treino em curso noutro telemóvel, não é possível começar outro em simultâneo aqui.",
    ],
  },
  {
    version: "v6.38.0",
    title: "Sombra Mais Correta no Cenário",
    changes: [
      "Corrigido um retângulo mais escuro que aparecia no chão do cenário, causado pela sombra da luz principal.",
    ],
  },
  {
    version: "v6.37.0",
    title: "Relatórios de Batalha Mais Completos",
    changes: [
      "Cada relatório de horda mostra agora quantos monstros havia e quantos foram derrotados.",
      "Em caso de derrota, mostra a quantidade perdida de cada recurso individualmente, não só um número genérico.",
      "A lista de relatórios ganhou scroll próprio, mostrando os mais recentes sem precisar de outro ecrã.",
    ],
  },
  {
    version: "v6.36.0",
    title: "Ícones dos Recursos Também no Mapa",
    changes: [
      "As minas encontradas no mapa passam a mostrar os mesmos ícones ilustrados usados na Economia, em vez do desenho simples de antes.",
      "Ícone da Madeira atualizado.",
    ],
  },
  {
    version: "v6.35.0",
    title: "Ícones Novos dos Recursos",
    changes: [
      "Ferro, Madeira, Pele, Pedra e Barro passam a ter ícones ilustrados a cores, em vez do desenho simples de linha de antes.",
    ],
  },
  {
    version: "v6.34.1",
    title: "Teto às Calorias de Pausa",
    changes: [
      "Corrigido: deixar o treino aberto/em segundo plano durante muito tempo já não rende calorias sem limite — a pausa só soma até 1 hora, o resto continua a aparecer no histórico mas não conta para XP.",
    ],
  },
  {
    version: "v6.34.0",
    title: "Medalhas de Missões e 9 por Mês",
    changes: [
      "Novo: 24 conquistas de missões — primeira missão de cada dificuldade, marcos de 5/10/25/50/100 (por dificuldade e no total) e \"Mês Perfeito\" por completar as 9 do mês.",
      "Concluir uma missão já não bloqueia as outras 2 da mesma dificuldade — agora dá para completar os 3 tipos de cada dificuldade no mesmo mês (9 no total, em vez de 3).",
    ],
  },
  {
    version: "v6.33.0",
    title: "Personagem Muda-se para a Fortaleza",
    changes: [
      "A secção Personagem inteira (visualizador 3D, XP, stats, equipamento) saiu de Eu e juntou-se ao card da Fortaleza em Reino.",
      "Eu fica só com Troféus e Números.",
    ],
  },
  {
    version: "v6.32.0",
    title: "Adeus Masmorra, Olá Fortaleza",
    changes: [
      "A Masmorra saiu do separador Reino — no lugar dela está agora Fortaleza, com o nível e o limite de armazenamento (antes dentro de Economia).",
    ],
  },
  {
    version: "v6.31.0",
    title: "Anel de Alcance",
    changes: [
      "Novo: um anel no chão à volta da Fortaleza mostra visualmente o Alcance atual da personagem — cresce quando o nível do Escudo sobe.",
    ],
  },
  {
    version: "v6.30.1",
    title: "Contagem da Horda em Horas",
    changes: [
      "O aviso de tempo até à próxima horda mostra agora horas:minutos:segundos, em vez de só minutos:segundos.",
    ],
  },
  {
    version: "v6.30.0",
    title: "Hordas em Produção",
    changes: [
      "As hordas saem da fase de testes: o ataque à Fortaleza passa a acontecer de 23 em 23 horas, em vez de 1 em 1 minuto.",
      "A contagem de hordas é reposta para todos — a próxima horda de cada jogador volta a ser a primeira (1 monstro).",
    ],
  },
  {
    version: "v6.29.3",
    title: "Câmara de Horda Afinada",
    changes: [
      "FOV da câmara de ataque (horda) ajustado para 30°.",
    ],
  },
  {
    version: "v6.29.2",
    title: "Câmara de Horda Afinada",
    changes: [
      "FOV da câmara de ataque (horda) ajustado para 60°, valor final escolhido pelo Victor.",
    ],
  },
  {
    version: "v6.29.1",
    title: "Câmaras Menos Afastadas",
    changes: [
      "As câmaras da aba Eu › Personagem (normal e durante uma horda) já não parecem tão distantes — a personagem e a torre aparecem maiores no ecrã.",
    ],
  },
  {
    version: "v6.29.0",
    title: "Terreno e Câmaras Definitivos da Fortaleza",
    changes: [
      "O cenário à volta da Fortaleza (árvores, terreno) já usa a arte definitiva em vez do placeholder.",
      "As câmaras da aba Eu › Personagem (normal e durante uma horda) passam a seguir o enquadramento definido no próprio cenário.",
      "Os 12 pontos de partida das hordas também já vêm do cenário definitivo.",
    ],
  },
  {
    version: "v6.28.3",
    title: "Monstros Nascem Espalhados",
    changes: [
      "Cada monstro de uma horda nasce agora num pivot escolhido ao acaso entre os 12 pontos de partida (em vez de sempre nos mesmos, por ordem).",
      "Os monstros também deixam de aparecer todos ao mesmo tempo: cada um nasce meio segundo depois do anterior.",
    ],
  },
  {
    version: "v6.28.2",
    title: "Câmara de Cima nas Hordas",
    changes: [
      "Durante um ataque à Fortaleza, a câmara sobe e afasta-se para se ver o terreno todo à volta da torre, em vez de ficar presa perto da personagem.",
    ],
  },
  {
    version: "v6.28.1",
    title: "Derrota Termina a Horda",
    changes: [
      "Se a tua Vida chegar a 0 durante uma horda, o ataque termina logo como derrota, em vez de continuar até matares todos os monstros.",
    ],
  },
  {
    version: "v6.28.0",
    title: "Relatórios de Batalha e Novos Atributos",
    changes: [
      "Novo: card \"Relatórios de Batalhas\" em Troféus, com o resultado das últimas hordas (vitória ou derrota, e quantos recursos foram roubados).",
      "Recebes um aviso quando um depósito de recursos fica cheio.",
      "Som de encontrar uma mina agora soa mais a vitória.",
      "Letalidade foi substituída por Velocidade de Ataque, que sobe com o nível da Arma.",
      "Destreza foi substituída por Alcance, que sobe com o nível do Escudo.",
    ],
  },
  {
    version: "v6.27.2",
    title: "Hordas Mais Frequentes (Teste)",
    changes: [
      "Fase de testes: as hordas passam a acontecer de 1 em 1 minuto, em vez de 5 em 5.",
    ],
  },
  {
    version: "v6.27.1",
    title: "Fortaleza Pode Ser Saqueada",
    changes: [
      "Se a tua Vida chegar a 0 durante um ataque, cada monstro que ainda estiver vivo rouba recursos da Fortaleza.",
    ],
  },
  {
    version: "v6.27.0",
    title: "Hordas na Fortaleza",
    changes: [
      "Novo: de tempos a tempos aparecem hordas de monstros a atacar a Fortaleza, com aviso a contar o tempo até ao ataque — a personagem defende-se sozinha.",
      "Fase de testes: por agora as hordas acontecem de 5 em 5 minutos, só para experimentar a mecânica.",
    ],
  },
  {
    version: "v6.26.1",
    title: "Card de Missões Ativas",
    changes: [
      "As missões que aceitas passam para um novo card \"Missões Ativas\" no topo, e saem do sítio onde estavam.",
    ],
  },
  {
    version: "v6.26.0",
    title: "Missões Sempre à Vista",
    changes: [
      "As 9 missões do mês (3 por dificuldade) estão sempre todas visíveis, sem lista escondida.",
      "Desistir de uma missão perde o progresso e bloqueia essa dificuldade por 12h (em vez de 24h).",
    ],
  },
  {
    version: "v6.25.1",
    title: "Aceitar Missões Durante o Treino",
    changes: [
      "Corrigido: às vezes não dava para carregar em \"Aceitar\" numa missão a meio de um treino.",
    ],
  },
  {
    version: "v6.25.0",
    title: "3 Missões ao Mesmo Tempo",
    changes: [
      "Já podes ter uma missão fácil, uma média e uma difícil ativas ao mesmo tempo, em vez de só uma no total.",
      "Desistir de uma missão só bloqueia essa dificuldade durante 24h, não as outras duas.",
    ],
  },
  {
    version: "v6.24.0",
    title: "Radar de Minas",
    changes: [
      "Novo aviso sonoro (\"tim tim tim\") quando há uma mina num raio de 2,5 km, muito antes do aviso de perto já existente.",
    ],
  },
  {
    version: "v6.23.0",
    title: "Escolhe o Tipo de Missão",
    changes: [
      "Em cada dificuldade já aparecem todas as missões possíveis (corrida, caminhada e as outras) em vez de só uma sorteada — escolhes qual aceitar.",
    ],
  },
  {
    version: "v6.22.0",
    title: "Lista de Missões",
    changes: [
      "Novo botão \"Ver lista de missões\" para veres as três missões do mês de uma vez, mesmo as bloqueadas ou já concluídas, sem ocupar espaço quando fechado.",
    ],
  },
  {
    version: "v6.21.0",
    title: "Missões de Caminhada e Progresso ao Vivo",
    changes: [
      "Agora também há missões de caminhada, além das de corrida, nas três dificuldades.",
      "O progresso das missões de distância já sobe ao vivo enquanto treinas, em vez de só no fim.",
    ],
  },
  {
    version: "v6.20.0",
    title: "Missões Sempre Visíveis",
    changes: [
      "As missões deixam de desaparecer quando começas um treino — continuas a ver a missão ativa e o progresso enquanto treinas.",
      "Corrigida a personagem a aparecer a levitar acima da Fortaleza em alguns níveis.",
    ],
  },
  {
    version: "v6.19.0",
    title: "Câmara Mais Diagonal na Fortaleza",
    changes: [
      "A câmara da aba Personagem passa a ver a Fortaleza de um ângulo mais de lado e mais de cima, para se notar melhor a lateral da torre.",
    ],
  },
  {
    version: "v6.18.2",
    title: "Mais um Ajuste à Fortaleza",
    changes: [
      "Pequeno afinamento aos modelos novos da Fortaleza (níveis 5-9 e 10-14).",
    ],
  },
  {
    version: "v6.18.1",
    title: "Corrige Sobreposição na Fortaleza",
    changes: [
      "Corrigida uma sobreposição de geometria nos modelos novos da Fortaleza e no chão da cena.",
    ],
  },
  {
    version: "v6.18.0",
    title: "Fortaleza com Mais Duas Aparências",
    changes: [
      "A Fortaleza ganha mais dois visuais novos à medida que sobe de nível (níveis 5-9 e 10-14).",
    ],
  },
  {
    version: "v6.17.0",
    title: "Teclado Já Não Tapa a Palavra-Passe",
    changes: [
      "No telemóvel, o teclado deixa de tapar o campo da palavra-passe nos popups de entrar/repor palavra-passe.",
    ],
  },
  {
    version: "v6.16.1",
    title: "\"Acumulado\" Sempre Visível",
    changes: [
      "O aviso de que o progresso das missões é acumulado passa a aparecer no próprio nome da missão — mesmo depois de já a teres aceite.",
    ],
  },
  {
    version: "v6.16.0",
    title: "Missões Mais Claras",
    changes: [
      "Fica claro que o progresso das missões soma-se ao longo de vários treinos — não precisas de fazer tudo de seguida numa sessão só.",
    ],
  },
  {
    version: "v6.15.2",
    title: "Erro de Login Mais Visível",
    changes: [
      "A mensagem \"Email ou palavra-passe incorretos\" passa a aparecer numa caixa de aviso destacada, em vez de só texto a cores.",
    ],
  },
  {
    version: "v6.15.1",
    title: "Erro Visível ao Repor a Palavra-Passe",
    changes: [
      "Corrigido: um erro ao definir a palavra-passe nova ficava em texto cinzento discreto, fácil de não reparar — agora aparece bem visível.",
      "Mensagem clara quando o link de recuperação já expirou ou já foi usado.",
    ],
  },
  {
    version: "v6.15.0",
    title: "Sair da Conta",
    changes: [
      "Nova secção \"Conta\" no separador Eu › Números, com um botão para saíres da tua conta.",
    ],
  },
  {
    version: "v6.14.0",
    title: "Só Email para Entrar",
    changes: [
      "Deixou de haver entrada com Google ou Apple — só email e palavra-passe.",
      "Quem já tinha conta criada por Google ou Apple continua a conseguir entrar: usa \"Esqueceste a palavra-passe?\" com o mesmo email para definir uma palavra-passe nova.",
    ],
  },
  {
    version: "v6.13.0",
    title: "Mapa Real, Outra Vez",
    changes: [
      "O mapa volta a mostrar a foto de satélite real, desfocada onde ainda não treinaste, a cores onde já estiveste.",
      "Já não há grelha de hexágonos por dentro do território — só um contorno na margem, sem poluir o mapa com linhas.",
      "As minas continuam a mostrar o ícone do recurso (árvore, montanha, vulcão, etc.) exatamente como antes.",
    ],
  },
  {
    version: "v6.12.2",
    title: "Mapa com Cara Nova",
    changes: [
      "O mapa deixou de ser uma foto de satélite desfocada — agora é um tabuleiro de hexágonos, água a azul e terra a verde.",
      "Rios, lagos e o mar aparecem desenhados nos sítios certos, tal como existem na realidade.",
      "As minas já encontradas mostram um ícone que combina com o recurso: árvore para madeira, montanha para pedra, vulcão para ferro.",
      "O nevoeiro por explorar é mais simples: só há \"por explorar\" e \"já lá estive\", sem contornos de concelho ou distrito desenhados por cima do mapa.",
      "Corrigido: os rios estavam a aparecer largos demais e podiam pintar de água um caminho normal à beira-rio.",
      "Corrigido: só rios e canais com nome contam como água real — valas e cursos de água menores deixaram de aparecer no mapa sem ser reais rios.",
    ],
  },
  {
    version: "v6.11.0",
    title: "Cards de Treino Mais Simples",
    changes: [
      "Os cards de treinos feitos mostram agora só a distância, a velocidade média e o XP — o resto fica atrás de \"Ver mais detalhes\".",
      "Já não é preciso escolher se um treino foi caminhada ou corrida (deixou de haver dúvidas com a bicicleta, que já não existe).",
      "Os títulos passam a \"Caminhada\" e \"Corrida\".",
      "Os treinos de hoje aparecem sempre por baixo das missões.",
    ],
  },
  {
    version: "v6.10.0",
    title: "Boas-Vindas e Lembrete de Peso",
    changes: [
      "Quem entra pela primeira vez recebe agora uma explicação rápida do jogo e um pedido para indicar o peso.",
      "Se passarem 15 dias sem atualizares o peso, aparece um lembrete ao abrir a app.",
    ],
  },
  {
    version: "v6.9.0",
    title: "Peso Sem Espera",
    changes: [
      "Já não há limite de tempo para atualizares o teu peso — regista quando quiseres.",
    ],
  },
  {
    version: "v6.8.0",
    title: "Entrar com Apple ou Email",
    changes: [
      "Já não é preciso ter conta Google: dá para entrar com a Apple ou criar conta com email e palavra-passe.",
      "Quem esquecer a palavra-passe pode repô-la por email.",
      "O login com a Apple ainda não está ativo (falta configuração do lado da conta) — o botão já lá está, pronto a ligar.",
    ],
  },
  {
    version: "v6.7.2",
    title: "Melhorar Equipamento à Vista",
    changes: [
      "O equipamento em Eu › Personagem passa a ter um card por peça, igual ao card da Fortaleza: o botão \"Melhorar\" e o custo estão sempre à vista, sem popup.",
      "Cada card mostra o que a peça ganha no próximo nível (ataque/defesa/vida e o bónus) e os materiais que custa.",
    ],
  },
  {
    version: "v6.7.1",
    title: "Custo do Escudo e da Armadura",
    changes: [
      "O Escudo passa a pedir madeira (a armação), pele no início (a cobertura) e ferro a partir do nível 30 (a couraça). Lá para o nível 48 o ferro passa a pesar mais que a madeira: escudo de ferro com núcleo de madeira.",
      "A Armadura tem a pele como material principal do início ao fim, com madeira até ao nível 30 (o forro) e ferro a partir daí (as placas).",
      "As três peças ficam com curvas de custo definitivas, cada uma no mesmo espírito da Fortaleza.",
    ],
  },
  {
    version: "v6.7.0",
    title: "Equipamento até ao Nível 100",
    changes: [
      "O Arco, o Escudo e a Armadura passam a ter 100 níveis (eram 20), cada um com um modelo 3D novo a cada 5 níveis.",
      "O custo de cada melhoria passa a ser uma curva de materiais como a da Fortaleza. O Arco precisa sempre de madeira (o corpo), com pele no início (a corda) e ferro a partir do nível 30 (as pontas).",
      "O bónus de Força/Resistência/Energia que o equipamento dá continua a chegar ao máximo por volta do nível 20 — os níveis a partir daí sobem o dano/defesa/vida e o visual. Quem já tinha uma peça no máximo antigo não perde nada.",
      "As curvas do Escudo e da Armadura são provisórias — vão ser afinadas.",
    ],
  },
  {
    version: "v6.6.0",
    title: "A Fortaleza até ao Nível 100",
    changes: [
      "A Fortaleza passa a ter 100 níveis (eram 10).",
      "Cada melhoria custa materiais diferentes conforme o nível: começas com madeira e pele, depois entra a pedra, a partir do nível 50 o barro, e a partir do 75 o ferro. A necessidade de cada material vai sempre a subir enquanto for preciso.",
      "A pedra é sempre o material que mais pesa, a partir do momento em que entra.",
      "O limite de armazenamento continua a crescer com o nível, sempre com folga para o custo da melhoria seguinte.",
    ],
  },
  {
    version: "v6.5.0",
    title: "Adeus à Bicicleta",
    changes: [
      "O modo Bicicleta foi removido. A app passa a detetar só Caminhar e Correr.",
      "Velocidades acima de ~16 km/h deixam de contar — a distância feita de bicicleta, de carro ou por erro de GPS não dá quilómetros, calorias nem XP.",
      "Saíram os troféus de distância, de ritmo e de recorde pessoal de bicicleta. Os treinos de bicicleta que já fizeste continuam no teu histórico.",
      "Deixa de ser preciso dar permissão de movimento ao telemóvel — o acelerómetro só servia para distinguir pedalar de correr.",
      "Podes converter um treino antigo de bicicleta para Caminhar ou Correr no cartão do treino.",
    ],
  },
  {
    version: "v6.4.0",
    title: "Missões Mensais e Troféus de Exploração",
    changes: [
      "Cada mês tem três missões — uma fácil, uma média e uma difícil — e cada uma dá recursos ao ser concluída. Aparecem no separador Treinar.",
      "Só podes ter uma missão aceite de cada vez. O progresso conta a partir do momento em que aceitas.",
      "Se desistires de uma missão, ficas 24 horas sem poder aceitar outra. Concluir não trava nada — aceitas logo a seguinte.",
      "Concluídas as três dentro do mês, esperas pelo mês seguinte por missões novas.",
      "Troféus novos de exploração: hexágonos descobertos, concelhos desbloqueados, minas encontradas, uma mina de cada recurso, e levar um hexágono ao multiplicador máximo.",
      "Os troféus de \"Madrugador\" e \"Notívago\" passaram a dizer certo: contam pela hora a que COMEÇAS o treino, não a que acabas.",
    ],
  },
  {
    version: "v6.3.0",
    title: "Os Recursos Seguem a Conta",
    changes: [
      "O stock de recursos, o nível da Fortaleza, as minas que encontraste e os multiplicadores dos hexágonos passam a estar ligados à tua conta — abres noutro telemóvel e está tudo lá.",
      "A produção continua a contar mesmo com a app fechada: quando voltas, o tempo todo que passou é creditado de uma vez.",
      "Ao juntar dois dispositivos, fica sempre o maior de cada recurso — nunca perdes produção.",
    ],
  },
  {
    version: "v6.2.0",
    title: "Todos os Hexágonos Rendem",
    changes: [
      "Cada hexágono que descobres passa a dar 0,1/h de cada recurso — antes só as minas rendiam e o resto do território não fazia nada.",
      "Um hexágono com uma mina que já encontraste dá 0,5/h do recurso dessa mina.",
      "Voltar a passar por um hexágono continua a fazê-lo render mais (até ao dobro).",
      "Corrigido: a produção não estava a acumular de todo até se pagar alguma coisa — agora conta a partir do momento em que abres a Economia. E deixa de ser preciso abrir o Mapa para as minas contarem.",
    ],
  },
  {
    version: "v6.1.0",
    title: "A Fortaleza",
    changes: [
      "O \"Armazém\" passou a chamar-se Fortaleza — é o teu forte, onde guardas os materiais e que destranca as melhorias maiores à medida que sobe de nível.",
      "A linha da capacidade ficou mais curta: \"Limite: 200 → 650 por recurso\", em vez da frase comprida.",
      "No ecrã de treino, o valor de XP aparece só como número, sem o \"kcal\" ao lado.",
    ],
  },
  {
    version: "v6.0.0",
    title: "Três Separadores: Treinar, Reino, Eu",
    changes: [
      "A navegação passou de quatro separadores para três. Treinar é um ecrã só, uma ação. Reino é tudo o que é lá fora — Mapa, Economia, Masmorra. Eu é tudo o que é teu — Personagem, Troféus, Números.",
      "As sub-abas são sempre as mesmas três e nunca mudam de ordem. Antes o \"Mundo\" escondia e mostrava abas conforme o momento, e ninguém sabia onde estava.",
      "Os recursos e o armazém saíram do cartão do mapa para Reino › Economia. A carteira de recursos aparece agora também por cima do equipamento, que é onde se gastam.",
      "O equipamento deixou de ser pastilhas a flutuar sobre o modelo 3D e passou a uma lista com o custo à vista. Os botões dizem \"Melhorar\"; ficam cinzentos quando ainda não dá.",
      "A personagem 3D deixou de aparecer em dois sítios — vive só em Eu › Personagem.",
      "O ecrã de treino mostra a distância em grande com três valores de apoio; o resto do detalhe fica atrás de \"Ver detalhe da sessão\".",
      "Os emojis da navegação e do equipamento deram lugar a ícones desenhados. Texto pequeno ficou mais escuro para se ler melhor, e o laranja passou a ser só de ações — os avisos têm cor própria.",
    ],
  },
  {
    version: "v5.4.0",
    title: "Adeus às Moedas",
    changes: [
      "As moedas foram removidas do jogo. Já não tinham uso desde que o equipamento passou a evoluir com materiais do mapa — eram ganhas mas não se gastavam em nada.",
      "Saíram também as conquistas ligadas a moedas (moedas ganhas e moedas investidas) e o contador de moedas no topo do ecrã.",
      "Nada do que importa mudou: nível, XP, pontos de status, materiais e medalhas mensais ficam exatamente como estavam.",
    ],
  },
  {
    version: "v5.3.0",
    title: "Peso Atualizável Todos os Dias",
    changes: [
      "O peso passa a poder ser atualizado a cada 24 horas, em vez de só a cada 15 dias.",
      "O histórico e o gráfico de evolução continuam iguais — só a espera entre alterações é que encurtou.",
    ],
  },
  {
    version: "v5.2.0",
    title: "Calorias Justas em Treinos Mistos",
    changes: [
      "Se num treino correste, andaste e pedalaste, cada bocado passa a contar com o esforço que lhe pertence — antes o treino todo era pago ao ritmo do tipo que mais pesou.",
      "Treinos de um só tipo dão exatamente o mesmo valor de sempre.",
    ],
  },
  {
    version: "v5.1.0",
    title: "Treinos Mostram o que Aconteceu Mesmo",
    changes: [
      "Se num treino correste, andaste e pedalaste, o card passa a mostrar quantos quilómetros fizeste em cada um — e não só o tipo que mais pesou.",
      "Treinos de um só tipo continuam simples, sem repetição.",
      "Vale para os treinos a partir de hoje; os anteriores mostram só o total.",
    ],
  },
  {
    version: "v5.0.0",
    title: "O Mapa Passa a Produzir",
    changes: [
      "Cada concelho esconde 50 minas — 10 de cada recurso: Ferro, Madeira, Pele, Pedra e Barro. Só elas produzem, e produzem mesmo com a app fechada.",
      "As minas não aparecem no mapa até lá chegares. A app toca um aviso quando estás a menos de 500 metros de uma que ainda não encontraste.",
      "Voltar a passar pelo mesmo sítio faz esse hexágono render mais, até ao dobro. Se deixares de lá ir, o bónus vai desvanecendo — mas tens dois dias de folga, porque descansar faz parte de treinar.",
      "O equipamento deixa de se comprar com moedas e passa a pedir materiais: o arco quer madeira e ferro, o escudo madeira e pele, a armadura pele e ferro.",
      "Novo armazém, construído com pedra e barro. É ele que limita quanto podes guardar — e sem espaço não consegues pagar as evoluções grandes.",
      "As peças passam de 99 para 20 níveis. Os 99 eram decorativos: à conta antiga davam umas duas voltas ao mundo por peça.",
      "No mapa, cada mina que encontraste mostra o ícone do recurso, com um arco à volta que cresce à medida que voltas lá.",
      "Os recursos sobem à vista: o contador incrementa sozinho à medida que vais produzindo.",
      "O ponto que te marca no mapa passa a ter um cone a apontar para onde segues, em vez de ser só um círculo a piscar.",
      "As estrelas colecionáveis foram substituídas por isto — mesmo mapa, mas com consequências.",
      "Os números desta economia são um primeiro palpite e vão ser afinados com dados reais de utilização.",
    ],
  },
  {
    version: "v4.2.0",
    title: "Histórico de Peso",
    changes: [
      "Cada vez que atualizas o peso, fica registado com a data — e há um gráfico no Perfil a mostrar a tua evolução.",
      "Só podes alterar o peso a cada 15 dias. A app diz-te quantos dias faltam.",
      "O teu peso atual já entrou no histórico, datado do teu primeiro treino, para não ficares bloqueado à espera.",
    ],
  },
  {
    version: "v4.0.0",
    title: "Subir de Nível Deixa de Ser uma Parede",
    changes: [
      "A Masmorra e a Arena ficam escondidas por agora, até o combate estar pronto. O teu progresso nelas fica tudo guardado.",
      "Os níveis passam a custar cinco vezes menos. A escala anterior era demasiado dura: ao nível 20, um único nível levava cinco meses de treino.",
      "Agora, ao teu ritmo, um nível pela casa dos 10 leva menos de duas semanas.",
      "O teu nível sobe já, sem fazeres nada — é sempre recalculado a partir das calorias que acumulaste, e recebes de uma vez os pontos de todos os níveis que ganhaste.",
      "Não perdes nada: as calorias, os pontos já investidos, o equipamento e as conquistas ficam exatamente como estavam.",
    ],
  },
  {
    version: "v3.12.0",
    title: "Muito Menos Bateria",
    changes: [
      "A app gastava bateria a desenhar o herói em 3D a toda a velocidade durante o treino inteiro — muitas vezes com o telemóvel no bolso, sem ninguém a olhar.",
      "Durante um treino, a cena passa a ser desenhada muito mais devagar. Fora do treino também baixou, sem se notar.",
      "Em telemóveis com ecrãs de alta densidade, a app desenhava até nove vezes os pixéis necessários. Deixou de o fazer.",
      "Nas lutas nada muda — aí continua fluido, porque estás a jogar.",
    ],
  },
  {
    version: "v3.11.0",
    title: "Treinos de Hoje em Cards",
    changes: [
      "Cada treino que já fizeste hoje aparece agora no seu próprio card, com a mesma cara do painel de treino: o tipo em cima, a distância em grande, e os tempos, a velocidade média e as calorias por baixo.",
      "A velocidade média conta só o tempo ativo — o tempo parado não a puxa para baixo.",
      "Antes era uma linha só de texto que não mostrava o tempo em pausa nem separava as calorias.",
      "Nos treinos anteriores a hoje, os campos que ainda não eram guardados aparecem como «—» em vez de zero — não é que não tenha havido pausa, é que não se sabe.",
    ],
  },
  {
    version: "v3.10.0",
    title: "Calorias de Bicicleta Mais Certas",
    changes: [
      "As calorias de bicicleta deixam de dar saltos: antes, 0,1 km/h a mais podia fazer o esforço saltar 25% de repente. Agora sobem de forma suave com a velocidade.",
      "Comparado com um relógio desportivo real, o erro das calorias de uma volta caiu de 10% para 5%.",
      "Os treinos antigos ficam como estão — não te tiramos XP que já ganhaste.",
    ],
  },
  {
    version: "v3.9.0",
    title: "Tempo Parado e Calorias Totais",
    changes: [
      "O tempo em que a app deteta que estás parado passa a contar como tempo em pausa, mesmo que não tenhas carregado em Pausa. Parado é parado.",
      "Por causa disso, a tua velocidade média passa a ser a velocidade a que andaste mesmo — num treino de teste subiu de 1,6 para 4,4 km/h.",
      "O XP passa a ser as calorias totais: o esforço do tempo ativo mais o que o teu corpo gasta em repouso enquanto estás parado. É o mesmo critério que os relógios desportivos usam.",
      "Vês as duas: calorias ativas e calorias totais, com o XP a seguir — para perceberes de onde vem o número.",
      "O resumo do fim do treino mostra os mesmos números que vês durante o treino.",
    ],
  },
  {
    version: "v3.6.0",
    title: "Resumo no Fim do Treino",
    changes: [
      "Ao terminares um treino aparece um resumo: tipo de treino, tempo ativo, tempo em pausa, tempo total, distância, velocidade média e calorias — separadas entre ativas e totais.",
      "Durante o treino passa a haver só um botão, «Pausa», no sítio do «Iniciar Treino». O Terminar está dentro do popup da pausa, para não se acabar um treino por engano.",
      "Corrigido: os botões de treino apareciam mesmo quando não havia treino nenhum a decorrer.",
    ],
  },
  {
    version: "v3.5.0",
    title: "Pausar o Treino",
    changes: [
      "Já podes pausar um treino a meio — para um café, um semáforo longo, uma paragem para descansar.",
      "Enquanto estás em pausa vês o tempo parado a contar, e escolhes entre Retomar e Terminar.",
      "O tempo em pausa não conta para o teu treino, e o que andares durante a pausa também não conta para a distância.",
      "Se recarregares a página a meio de uma pausa, ela continua onde estava.",
    ],
  },
  {
    version: "v3.4.0",
    title: "Calorias de Bicicleta Corrigidas",
    changes: [
      "As voltas de bicicleta estavam a contar calorias a menos — até um terço. A app usava a velocidade média incluindo o tempo parado, e uma paragem longa fazia uma volta a sério parecer um passeio.",
      "Agora a app mede o tempo em que estiveste mesmo a andar e é essa a velocidade que conta; o tempo parado conta como descanso.",
      "Comparado com os dados de um relógio desportivo, o erro passou de 33% para menos de 10%.",
      "Só afeta a bicicleta. A pé as contas já estavam certas, por causa da fórmula usada.",
      "Os treinos antigos ficam como estão — não havia como saber quanto tempo estiveste parado.",
    ],
  },
  {
    version: "v3.3.0",
    title: "Mapa de Exploração",
    changes: [
      "O mapa dos Territórios passa a mostrar o mundo real visto de satélite, mas desfocado e às escuras — como um mapa de jogo por descobrir.",
      "Os hexágonos onde já treinaste ficam a cores e nítidos. Quanto mais exploras, mais mundo acendes.",
      "Ao descobrires 3 zonas no mesmo concelho, o concelho inteiro clareia e o seu contorno aparece com o nome — mesmo nas partes onde ainda não puseste os pés. São 308 em Portugal, dá para colecionar.",
      "Afasta o mapa e vês o distrito; aproxima e vês os nomes dos concelhos que já conquistaste.",
      "Um ponto azul mostra onde estás, e há um botão para recentrar o mapa em ti.",
      "Sempre que abres o mapa, ele começa na vista do país e voa até ao sítio onde estás.",
    ],
  },
  {
    version: "v3.1.0",
    title: "Corrigir o Tipo de Treino",
    changes: [
      "Se a app se enganar no tipo de treino (é fácil confundir pedalar devagar com correr), passas a poder corrigi-lo na lista de Treinos de Hoje — as calorias são recalculadas automaticamente.",
      "A app começa a medir a cadência do movimento durante o treino, para aprender a distinguir pedalar de correr sozinha. Quando acertar de forma fiável, a correção manual desaparece.",
    ],
  },
  {
    version: "v3.0.0",
    title: "Nova Escala de Níveis",
    changes: [
      "Cada nível passa a custar bastante mais XP — a progressão fica mais lenta e com mais margem para crescer. Os níveis atuais foram recalculados nesta nova escala.",
      "Não perdes nada: as calorias, os pontos investidos, o equipamento e as conquistas ficam todos exatamente como estavam.",
      "Corrigido: o nível mostrado podia ser diferente de telemóvel para telemóvel. Agora a fórmula é a mesma para toda a gente, sempre.",
    ],
  },
  {
    version: "v2.13.0",
    title: "Progresso Sempre Sincronizado",
    changes: [
      "Corrigido: em certos casos o telemóvel ficava com um nível/progresso desatualizado e não recuperava sozinho — chegou a mostrar nível 4 em vez de 10.",
      "O arranque passa a juntar o que está no telemóvel com o que está no servidor, campo a campo, em vez de escolher só um dos lados. Nenhum dos dois perde informação.",
    ],
  },
  {
    version: "v2.12.1",
    title: "Correção: Calorias a Menos com Falhas de GPS",
    changes: [
      "Corrigido: treinos com falhas de sinal ficavam com muito menos calorias do que o esforço real — um treino de bicicleta de 18 km chegou a contar só um terço.",
      "As calorias passam a ser calculadas no fim do treino a partir da distância e duração totais, em vez de somadas troço a troço.",
      "Os treinos já afetados foram recalculados.",
    ],
  },
  {
    version: "v2.12.0",
    title: "Territórios por Descobrir",
    changes: [
      "Nova aba Missões: o mapa está dividido em hexágonos e cada zona onde treinas pela primeira vez fica acesa no teu mapa pessoal.",
      "Treina em sítios novos para descobrir mais território — repetir o mesmo percurso não acende nada de novo.",
      "As missões e recompensas em si chegam a seguir; por agora só a exploração é registada.",
    ],
  },
  {
    version: "v2.11.0",
    title: "Bicicleta Deixa de Ser Confundida com Corrida",
    changes: [
      "A app passa a usar o acelerómetro para perceber se estás mesmo a dar passadas — a subir uma encosta de bicicleta devagar já não é contado como corrida ou caminhada.",
      "Empurrar a bicicleta a subir passa a contar corretamente como caminhada.",
    ],
  },
  {
    version: "v2.10.0",
    title: "O Herói Ganhou Vida",
    changes: [
      "O herói passa a ter animação: fica com um idle a correr em loop em vez de estar completamente estático.",
      "O arco e o escudo acompanham agora o movimento das mãos, porque estão ligados aos ossos do modelo.",
    ],
  },
  {
    version: "v2.9.1",
    title: "Equipamento nas Mãos Certas",
    changes: [
      "O arco e o escudo passam a ser colocados nos pontos definidos no próprio modelo 3D, em vez de posições aproximadas — as flechas saem agora da mão do herói.",
      "Novo modelo do herói (ainda em progresso).",
    ],
  },
  {
    version: "v2.9.0",
    title: "Ecrã Não Adormece Durante o Treino",
    changes: [
      "O ecrã passa a manter-se ligado enquanto treinas — antes, se bloqueasses o telemóvel, o browser suspendia o GPS e a distância desse período perdia-se.",
      "Cada treino passa a registar a qualidade do sinal de GPS, para se perceber onde (e se) se perde distância.",
    ],
  },
  {
    version: "v2.8.2",
    title: "Correção: Calorias Infladas ao Ficar Parado",
    changes: [
      "Corrigido: ficar parado vários minutos a meio de um treino e depois voltar a andar podia inflacionar muito as calorias registadas nesse troço.",
    ],
  },
  {
    version: "v2.8.1",
    title: "Correção: Calorias Perdidas ao Recarregar",
    changes: [
      "Corrigido: as calorias contadas num treino voltavam a 0 sempre que davas refresh à página a meio dele — agora sobrevivem, tal como a distância já sobrevivia.",
    ],
  },
  {
    version: "v2.8.0",
    title: "Arco com Modelo 3D Real",
    changes: [
      "O arco do herói ganhou um modelo 3D a sério — herói, escudo e arco já usam todos modelos reais.",
    ],
  },
  {
    version: "v2.7.9",
    title: "Escudo com Modelo 3D Real",
    changes: [
      "O escudo do herói ganhou um modelo 3D a sério, em vez de ficar sem representação visual.",
    ],
  },
  {
    version: "v2.7.8",
    title: "Modelo do Herói Atualizado",
    changes: [
      "Novo modelo 3D do herói (ainda em progresso).",
    ],
  },
  {
    version: "v2.7.7",
    title: "Deteção de Atividade Mais Rápida",
    changes: [
      "Corrigido: podia demorar perto de 30 segundos a detetar que tinhas começado a caminhar/correr depois de estares parado — agora é bem mais rápido.",
    ],
  },
  {
    version: "v2.7.6",
    title: "Modelo do Herói Atualizado",
    changes: [
      "Novo modelo 3D do herói (ainda em progresso).",
    ],
  },
  {
    version: "v2.7.5",
    title: "Modelo do Herói Atualizado",
    changes: [
      "Novo modelo 3D do herói (ainda em progresso).",
    ],
  },
  {
    version: "v2.7.4",
    title: "Limpeza do Modelo do Herói",
    changes: [
      "Removidas as formas geométricas antigas que ainda estavam por baixo do modelo novo do herói.",
      "Tocar no modelo 3D deixa de abrir os popups de evolução de equipamento — usa os botões Arco/Escudo/Armadura no topo do ecrã (já faziam a mesma coisa).",
    ],
  },
  {
    version: "v2.7.3",
    title: "Herói com Modelo 3D Real",
    changes: [
      "O herói (Personagem e Masmorra) ganhou um modelo 3D a sério, em vez das formas geométricas de antes.",
    ],
  },
  {
    version: "v2.7.2",
    title: "Câmara da Arena Mais Dramática",
    changes: [
      "A câmara da Masmorra desce e aproxima-se — ângulo mais baixo, herói bem maior no ecrã, menos vista de \"drone\".",
    ],
  },
  {
    version: "v2.7.1",
    title: "Chão Novo na Masmorra",
    changes: [
      "A arena da Masmorra ganhou um chão 3D a sério, em vez do retângulo cinzento de antes.",
      "Novo aviso na Masmorra: esta área está em construção, o progresso pode ser perdido enquanto isso durar.",
    ],
  },
  {
    version: "v2.7.0",
    title: "O Herói Ataca!",
    changes: [
      "Câmara da arena mais afastada — deixa de parecer tão apertada.",
      "O herói passa a mirar sempre o monstro à vista e a disparar sozinho quando estás parado — anda com o joystick para reposicionares, para para atacares.",
      "O monstro ainda não ataca de volta nem há recompensas ao derrotá-lo — isso chega numa próxima atualização.",
    ],
  },
  {
    version: "v2.6.0",
    title: "Nova Arena da Masmorra",
    changes: [
      "A Masmorra/Arena ganhou uma vista nova de cima, tipo jogo mobile, com um joystick virtual para andares pela arena.",
      "O monstro fica no centro, tu arrancas mais perto de ti — por agora é só para explorares a arena, o combate propriamente dito volta numa próxima atualização.",
    ],
  },
  {
    version: "v2.5.1",
    title: "Correção: Flecha ao Contrário",
    changes: [
      "Corrigido: a flecha do arqueiro voava com a ponta para trás.",
      "A flecha passa a mirar o corpo do monstro em vez da cabeça (o dano continua a aparecer por cima da cabeça).",
    ],
  },
  {
    version: "v2.5.0",
    title: "A Personagem Passa a Arqueira",
    changes: [
      "Novo visual: a espada deu lugar a um arco — o escudo mantém-se.",
      "Os ataques em combate passam a ser disparos de flechas, com uma animação nova a acompanhar.",
      "A conquista \"Arma no máximo\" passa a chamar-se \"Arco no máximo\".",
    ],
  },
  {
    version: "v2.4.1",
    title: "Correção: Distância Presa a 0",
    changes: [
      "Corrigido: em alguns telemóveis, treinos curtos a pé podiam ficar sempre com 0.00 km e 0 kcal mesmo a caminhar sem parar (o GPS reportava depressa demais para o filtro de ruído conseguir somar o percurso).",
    ],
  },
  {
    version: "v2.4.0",
    title: "Calorias no Perfil",
    changes: [
      "Novo: calorias desta semana e deste mês no card Resumo, ao lado da distância.",
      "Os gráficos de Evolução (semana/mês/todos os meses) ganharam um seletor para veres em Distância ou em Calorias.",
    ],
  },
  {
    version: "v2.3.0",
    title: "Novo Separador \"Mundo\"",
    changes: [
      "Novo separador \"Mundo\" (era \"Arena\") — passa a ser o primeiro ecrã ao abrir a app, com a personagem 3D sempre visível.",
      "Dentro de Mundo: Campo (era o separador \"Treino\", fica aberto por omissão), Masmorra (combate contra monstros, era \"Arena\"/\"Batalhas\"), e já com o lugar reservado para Arena (PvP) e Missões — ambos \"Em breve\".",
      "Personagem volta a ser só sobre a tua personagem: nível, stats e equipamento.",
    ],
  },
  {
    version: "v2.2.0",
    title: "Navegação Simplificada",
    changes: [
      "O separador \"Treino\" deixou de existir — tudo o que lá estava (Iniciar Treino, distância, calorias ao vivo) passou para o separador Personagem, logo no topo.",
      "O separador \"Batalhas\" passou a chamar-se \"Arena\".",
      "Barra de navegação com 4 separadores em vez de 5.",
    ],
  },
  {
    version: "v2.1.0",
    title: "8 Conquistas Novas de Calorias",
    changes: [
      "Nova categoria \"Calorias\" nas Conquistas: recorde de calorias numa sessão (Primeira Fagulha, Em Chamas, Fornalha, Incêndio Total) e calorias acumuladas ao longo da vida (Aquecimento Vitalício, Combustível Sério, Fornalha Humana, Lenda Calórica).",
      "Ao contrário das conquistas de distância, estas não são separadas por modo — calorias já são justas entre caminhar, correr e pedalar.",
    ],
  },
  {
    version: "v2.0.1",
    title: "Limpeza: Distância Efetiva Retirada",
    changes: [
      "\"Distância efetiva\" deixou de existir de vez — já não aparecia no ecrã de treino nem influenciava nada, ficava só como resto do sistema antigo.",
      "As conquistas de distância por modo passam a comparar a distância real percorrida, não um valor ajustado por esforço (isso já é o que as calorias/nível medem).",
    ],
  },
  {
    version: "v2.0.0",
    title: "Calorias Passam a Ser a Unidade de Progresso",
    changes: [
      "Nível, XP, leaderboard e medalhas mensais passam a ser calculados por calorias reais (fórmula MET), não por distância — mais justo entre quem anda, corre e pedala.",
      "O nível de todos os jogadores existentes foi preservado na mudança — ninguém perde progresso.",
      "Distância continua a ser mostrada em todo o lado (histórico, gráficos, conquistas de distância) — só deixou de decidir o nível.",
    ],
  },
  {
    version: "v1.20.1",
    title: "Corrige Treino Sem Pausa",
    changes: [
      "O treino já entra em pausa corretamente depois de ficares parado — antes a atividade detetada podia ficar \"presa\" na última que estavas a fazer.",
    ],
  },
  {
    version: "v1.20.0",
    title: "Deteção Automática de Atividade",
    changes: [
      "Já não precisas de escolher Caminhar/Correr/Bicicleta antes de treinar — a atividade é detetada automaticamente pelo teu ritmo.",
      "O ecrã de treino agora mostra a velocidade nominal (atual) e a média, lado a lado, e a atividade detetada no momento.",
      "Calorias da sessão calculadas em tempo real (ainda não contam para XP — só informativo por agora).",
      "Lista dos treinos já feitos hoje, no ecrã inicial do painel de Treino.",
      "Os limites de velocidade por modo foram substituídos por um único teto de segurança, que só filtra erros de GPS/veículo.",
    ],
  },
  {
    version: "v1.19.0",
    title: "Peso Corporal no Perfil",
    changes: [
      "Novo campo \"Peso (kg)\" na aba Perfil - vai ser usado para calcular calorias nos treinos numa próxima atualização.",
    ],
  },
  {
    version: "v1.18.1",
    title: "Corrige Golpe Depois de Morrer em Luta",
    changes: [
      "A personagem já não consegue desferir mais um golpe depois de a vida chegar a 0 numa luta — a recuperação de vida entre ataques não pode mais reanimar quem já perdeu.",
    ],
  },
  {
    version: "v1.18.0",
    title: "Mais 39 Conquistas Novas",
    changes: [
      "Marcos de Nível (10/25/50/100), inspirados no número que agora aparece no cabeçalho.",
      "Moedas ganhas e moedas investidas ao longo da vida, em vários patamares.",
      "Levar a Arma, o Escudo ou a Armadura ao nível máximo (e uma extra por levar as 3 ao máximo).",
      "\"Madrugador\" e \"Notívago\", por treinar muito cedo ou muito tarde.",
      "\"Poliglota do Treino\", por experimentares os 3 modos (Caminhar, Correr, Bicicleta).",
      "\"Colecionador\", por desbloquear várias outras conquistas.",
      "Meses de calendário distintos treinados, não precisam de ser seguidos.",
      "Número total de lutas travadas (ganhas ou perdidas).",
    ],
  },
  {
    version: "v1.17.8",
    title: "Caminhar Com Mais Margem",
    changes: [
      "O limite máximo de velocidade de Caminhar subiu de 7 para 9 km/h.",
    ],
  },
  {
    version: "v1.17.7",
    title: "Limites de Velocidade Mais Justos (Correr/Bicicleta)",
    changes: [
      "O limite máximo de velocidade de Correr desceu de 20 para 15 km/h - 20 km/h sustido é ritmo de recorde mundial de maratona, o que deixava passar como \"Correr\" ritmos que eram claramente de bicicleta tranquila.",
      "O limite mínimo de velocidade de Bicicleta subiu de 10 para 13 km/h, pelo mesmo motivo.",
    ],
  },
  {
    version: "v1.17.6",
    title: "Nível à Vista",
    changes: [
      "O teu nível passou a aparecer também no topo da página, ao lado do teu nome, sem precisares de ir à aba Personagem para ver.",
    ],
  },
  {
    version: "v1.17.5",
    title: "Fim da Farmagem",
    changes: [
      "Derrotar um monstro que já tinhas vencido com 3 estrelas deixou de dar moedas - continua a poder lutar-se de novo para testar builds, só já não rende dinheiro. Antes de chegares às 3 estrelas continua a pagar normalmente.",
    ],
  },
  {
    version: "v1.17.4",
    title: "Lutas Com Mais Vida",
    changes: [
      "Quem ataca agora avança um pouco para o outro lado, para as lutas parecerem menos estáticas.",
      "O número de vida recuperada durante a luta passou a mostrar o valor exato (ex: \"+2.1\"), tal como já acontecia fora de combate.",
      "Corrigido um problema visual em que dois avisos a aparecer ao mesmo tempo (ex: moedas ganhas + uma conquista desbloqueada) ficavam exatamente um em cima do outro, escondendo um deles - agora empilham-se.",
    ],
  },
  {
    version: "v1.17.3",
    title: "Monstros Também Recuperam",
    changes: [
      "Os monstros passaram a recuperar um pouco de vida durante a luta, tal como tu já fazias - antes só o jogador recuperava em combate.",
    ],
  },
  {
    version: "v1.17.2",
    title: "Cartões Mais Separados",
    changes: [
      "Os cartões do Perfil (e de outras abas com vários cartões seguidos) passaram a ter uma linha fina a separá-los, para ficar claro onde um acaba e o outro começa.",
    ],
  },
  {
    version: "v1.17.1",
    title: "Notas de Atualização",
    changes: [
      "Novo cartão \"Versão da Aplicação\" na aba Perfil, com as novidades de cada atualização explicadas em linguagem simples - exatamente o que estás a ler agora.",
      "A recuperação de vida (Regeneração) deixou de parar por completo durante uma luta - agora continua a recuperar um pouco a cada troca de ataques, tal como já acontecia fora de combate.",
    ],
  },
  {
    version: "v1.16.3",
    title: "Treino Mais Detalhado",
    changes: [
      "O ecrã de Treino ganhou um relógio e a velocidade média ao vivo, e a distância em XP passou a estar sempre visível.",
      "O aviso de velocidade passou a dizer o modo escolhido e se estás muito rápido ou muito lento.",
      "Ao encontrar moedas a treinar, aparece agora um cartão a dizer quantas e a que quilómetro.",
      "O botão \"Parar Treino\" ficou preto, para se destacar melhor.",
      "O nome no cabeçalho passou a ser o teu nome de jogador, em vez de \"Personagem 3D\".",
      "A lista de Arma/Escudo/Armadura junto ao personagem já pode ser tocada para abrir a evolução, sem precisares de acertar na peça certa no modelo 3D.",
    ],
  },
  {
    version: "v1.15.2",
    title: "Perfil Mais Limpo",
    changes: [
      "O separador Perfil deixou de mostrar os status do personagem (esses já estão na aba Personagem) - passou a focar-se só no histórico de treinos.",
      "O histórico deixou de juntar vários treinos do mesmo dia numa única linha \"Misto\" - agora aparece cada treino em separado, do mais recente para o mais antigo.",
      "Treinos sem distância nenhuma ou muito curtos (menos de 10 segundos) deixaram de ficar registados, para não sujar o histórico.",
    ],
  },
  {
    version: "v1.14.1",
    title: "Limites de Velocidade Mais Justos",
    changes: [
      "Passou a haver um limite mínimo de velocidade por modo - já não é possível escolher \"Correr\" e ires devagar a fingir que estás a correr.",
      "O limite máximo de velocidade da bicicleta subiu de 25 para 37 km/h.",
    ],
  },
  {
    version: "v1.13.1",
    title: "HUD e Combate Renovados",
    changes: [
      "O ecrã do personagem foi reorganizado: nível e equipamento aparecem agora por cima do palco 3D, e os status por baixo.",
      "O ecrã de batalha também foi redesenhado: a vida do jogador e do monstro aparecem lado a lado, e a última ação do combate fica em destaque.",
    ],
  },
  {
    version: "v1.12.2",
    title: "Novo Visual: Campo Aberto",
    changes: [
      "O site ganhou um visual novo, com uma barra de separadores no fundo do ecrã (Personagem, Treino, Batalhas, Troféus, Perfil).",
      "A lista de monstros em Batalhas passou de um carrossel horizontal para uma lista vertical, com um cartão por criatura.",
      "Vários ajustes visuais: palco do personagem maior, status numa única linha.",
    ],
  },
  {
    version: "v1.11.4",
    title: "Afinações de Equilíbrio do Equipamento",
    changes: [
      "O limite de velocidade da bicicleta desceu para 25 km/h (mais realista).",
      "Os bónus do equipamento passaram a aparecer mais claramente nos status Energia/Força/Resistência.",
      "Deixou de haver um limite de nível de personagem para evoluir o equipamento.",
      "Cada peça de equipamento (Arma/Escudo/Armadura) passou a ter a sua própria curva de crescimento.",
    ],
  },
  {
    version: "v1.10.0",
    title: "Equipamento Simplificado",
    changes: [
      "O equipamento deixou de ter níveis/tiers e sorte de drop - passou a ser uma única peça por tipo (Arma, Escudo, Armadura), que evolui de forma contínua do nível 1 ao 99, só a gastar moedas.",
    ],
  },
  {
    version: "v1.9.4",
    title: "Recompensas e Combate Melhorados",
    changes: [
      "Ganhar moedas, subir de nível ou ganhar uma medalha mensal passou a mostrar um aviso no ecrã.",
      "Os números de dano na luta ganharam cores diferentes por tipo (dano normal, crítico, esquiva).",
      "As lutas ficaram um pouco mais lentas, para dar tempo de ler o que está a acontecer.",
      "Deixou de ser possível fechar a aba a meio de uma luta sem um aviso.",
    ],
  },
  {
    version: "v1.8.0",
    title: "Equipamento Por Sorte",
    changes: [
      "Arma, Escudo e Armadura passaram a ser conquistados por sorte (drop), a treinar ou a derrotar monstros - já não dependiam só do teu nível.",
    ],
  },
  {
    version: "v1.7.0",
    title: "Escudo e Armadura Ganham Vida",
    changes: [
      "Escudo e Armadura passaram a ter os mesmos níveis e sistema de melhoria com moedas que já existia na Arma.",
    ],
  },
  {
    version: "v1.6.2",
    title: "Troféus dos Amigos",
    changes: [
      "Passou a ser possível clicar no nome de qualquer jogador no leaderboard para ver os troféus que já desbloqueou.",
    ],
  },
  {
    version: "v1.5.3",
    title: "Chegam as Moedas",
    changes: [
      "Novo sistema de moedas: ganham-se a treinar, a lutar e a desbloquear conquistas, e gastam-se a evoluir a Arma.",
      "O teu nível passou também a aparecer no leaderboard.",
    ],
  },
  {
    version: "v1.4.2",
    title: "Novos Status do Personagem",
    changes: [
      "Os status do personagem foram reorganizados em Energia, Força e Resistência, cada um a alimentar dois status finais (ex: Força também ajuda a Letalidade).",
      "Foi adicionada uma tabela com 10 níveis de Arma.",
    ],
  },
  {
    version: "v1.3.7",
    title: "Conquistas e Gráficos Mais Precisos",
    changes: [
      "As conquistas de distância e de ritmo passaram a ser calculadas por modo de treino (Caminhar/Correr/Bicicleta).",
      "Os leaderboards passaram a mostrar XP em vez de quilómetros.",
      "Corrigido um problema em que a distância podia \"desaparecer\" por um erro de velocidade em cadeia.",
      "Os gráficos da aba Perfil ganharam uma escala em km.",
    ],
  },
  {
    version: "v1.2.0",
    title: "Barra de Nível em XP",
    changes: [
      "A barra de progresso de nível passou a mostrar XP, e a distância necessária para subir de nível aumentou.",
    ],
  },
  {
    version: "v1.1.3",
    title: "Modos de Treino",
    changes: [
      "Passaste a poder escolher entre Caminhar, Correr e Bicicleta antes de cada treino, cada um com o seu peso justo de XP.",
      "Foi adicionada uma contagem decrescente de 5 segundos antes do treino começar a contar.",
    ],
  },
  {
    version: "v1.0.0",
    title: "O Início",
    changes: [
      "O site passou a mostrar o número da versão instalada, para ser mais fácil saber quando há novidades.",
    ],
  },
];

function renderChangelog() {
  const listEl = document.getElementById("profile-changelog-list");
  if (!listEl) return;

  listEl.innerHTML = "";
  CHANGELOG.forEach((entry) => {
    const item = document.createElement("div");
    item.className = "changelog-entry";

    const title = document.createElement("p");
    title.className = "changelog-entry-title";
    title.innerHTML = `"${entry.title}" <span class="changelog-entry-version">${entry.version}</span>`;
    item.appendChild(title);

    const changesEl = document.createElement("ul");
    changesEl.className = "changelog-entry-changes";
    entry.changes.forEach((change) => {
      const li = document.createElement("li");
      li.textContent = change;
      changesEl.appendChild(li);
    });
    item.appendChild(changesEl);

    listEl.appendChild(item);
  });
}

renderChangelog();
