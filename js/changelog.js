// Changelog em linguagem simples para os jogadores (aba Perfil, card
// "Versao da Aplicacao") - traduz o historico de commits/versoes tecnicas
// (ver DOCUMENTACAO.md) para o que realmente mudou do ponto de vista de
// quem joga, ao estilo das notas de atualizacao de outros jogos. Cada
// entrada agrupa uma versao "menor" (x.Y) e os patches dela (x.Y.z),
// mais recente primeiro. Ao lancar uma versao nova, acrescentar aqui em
// vez de listar cada commit tecnico separadamente.
const CHANGELOG = [
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
