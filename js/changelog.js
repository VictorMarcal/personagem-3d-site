// Changelog em linguagem simples para os jogadores (aba Perfil, card
// "Versao da Aplicacao") - traduz o historico de commits/versoes tecnicas
// (ver DOCUMENTACAO.md) para o que realmente mudou do ponto de vista de
// quem joga, ao estilo das notas de atualizacao de outros jogos. Cada
// entrada agrupa uma versao "menor" (x.Y) e os patches dela (x.Y.z),
// mais recente primeiro. Ao lancar uma versao nova, acrescentar aqui em
// vez de listar cada commit tecnico separadamente.
const CHANGELOG = [
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
