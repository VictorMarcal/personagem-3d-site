-- Schema para login (Google) + leaderboard do Personagem 3D.
-- Corre isto uma vez no SQL Editor do projeto Supabase.
-- Guardado aqui só como referência/histórico — o Supabase não lê este ficheiro.

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index profiles_display_name_lower_idx on public.profiles (lower(display_name));

alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);

create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- is_admin só é alterado manualmente pelo SQL Editor (ver nota no fim do
-- ficheiro); este grant garante que nenhum cliente autenticado consegue
-- escrever nessa coluna, só em display_name.
revoke update on public.profiles from authenticated;
grant update (display_name) on public.profiles to authenticated;

-- Cria a linha de profile automaticamente no primeiro login, evitando
-- uma corrida entre o cliente ler/criar o próprio perfil.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Fonte de verdade do progresso (espelha as antigas chaves personagem.*
-- do localStorage). Privada: só o próprio jogador lê/escreve a sua linha.
create table public.player_progress (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  lifetime_distance_m numeric not null default 0,
  unspent_points integer not null default 0,
  equip_level_vida integer not null default 1,
  equip_level_ataque integer not null default 1,
  equip_level_defesa integer not null default 1,
  last_awarded_level integer not null default 1,
  defeated_creatures jsonb not null default '{}',
  encountered_creatures integer[] not null default '{}',
  unlocked_achievements jsonb not null default '{}',
  best_session_distance_m numeric not null default 0,
  total_trainings_completed integer not null default 0,
  best_pace_mps numeric not null default 0,
  best_streak_days integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.player_progress enable row level security;

create policy "progress_select_own" on public.player_progress
  for select using (auth.uid() = user_id);

create policy "progress_insert_own" on public.player_progress
  for insert with check (auth.uid() = user_id);

create policy "progress_update_own" on public.player_progress
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Projeção pública e estreita para o leaderboard. Nunca expor profiles/
-- player_progress diretamente (profiles tem is_admin).
create table public.leaderboard (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  display_name text not null,
  lifetime_distance_m numeric not null default 0,
  -- Distancia do mes de calendario corrente + "fotografia" do mes anterior,
  -- usadas pelo corte de medalhas mensais (js/monthly-medals.js). Um so
  -- "slot" de mes anterior - ver nota de limitacao na documentacao.
  monthly_distance_m numeric not null default 0,
  previous_month_distance_m numeric not null default 0,
  month_reference text not null default to_char(now(), 'YYYY-MM'),
  previous_month_reference text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.leaderboard enable row level security;

create policy "leaderboard_select_all" on public.leaderboard
  for select using (true);

create policy "leaderboard_insert_own" on public.leaderboard
  for insert with check (auth.uid() = user_id);

create policy "leaderboard_update_own" on public.leaderboard
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Historico de sessoes de treino individuais (data, distancia, duracao),
-- usado pela aba de Perfil. Imutavel depois de gravado - sem UPDATE/DELETE,
-- a RLS nega por omissao. client_id + indice unico tornam o insert
-- idempotente (a fila local de retry, em js/training.js, pode reenviar o
-- mesmo registo sem criar duplicado).
create table public.training_sessions (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  client_id uuid not null,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  distance_m numeric not null,
  duration_seconds numeric not null,
  created_at timestamptz not null default now()
);

create unique index training_sessions_user_client_idx
  on public.training_sessions (user_id, client_id);

create index training_sessions_user_started_idx
  on public.training_sessions (user_id, started_at);

alter table public.training_sessions enable row level security;

create policy "training_sessions_select_own" on public.training_sessions
  for select using (auth.uid() = user_id);

create policy "training_sessions_insert_own" on public.training_sessions
  for insert with check (auth.uid() = user_id);

-- Migracao: sessoes eram imutaveis por design (sem UPDATE/DELETE), mas o
-- "Repor personagem" do Debug precisa de poder apagar o historico do
-- proprio jogador para dar reset completo tambem na aba de Perfil.
create policy "training_sessions_delete_own" on public.training_sessions
  for delete using (auth.uid() = user_id);

-- Migracao: substitui o antigo sistema de "quartos" (4 pontos a cada 25%
-- de progresso dentro do nivel) por 1 ponto por nivel subido (mini-bosses/
-- bosses passam a dar pontos extra na primeira derrota - ver js/battle.js).
-- Corre isto uma vez, ja com a tabela player_progress criada:
alter table public.player_progress drop column if exists last_awarded_quarters;
alter table public.player_progress add column if not exists last_awarded_level integer not null default 1;

-- Migracao: defeated_levels (so a lista de niveis) passa a
-- defeated_creatures, um mapa { nivel: estrelas } - guarda tambem o
-- melhor resultado (1-3 estrelas) contra cada criatura (ver js/monsters.js).
alter table public.player_progress drop column if exists defeated_levels;
alter table public.player_progress add column if not exists defeated_creatures jsonb not null default '{}';

-- Migracao: conquistas expandidas - recorde pessoal de ritmo, sequencias
-- de dias, e medalhas mensais (ver js/achievements.js, js/monthly-medals.js).
alter table public.player_progress add column if not exists best_pace_mps numeric not null default 0;
alter table public.player_progress add column if not exists best_streak_days integer not null default 0;

alter table public.leaderboard add column if not exists monthly_distance_m numeric not null default 0;
alter table public.leaderboard add column if not exists previous_month_distance_m numeric not null default 0;
alter table public.leaderboard add column if not exists month_reference text not null default to_char(now(), 'YYYY-MM');
alter table public.leaderboard add column if not exists previous_month_reference text not null default '';

-- Historico imutavel de medalhas Ouro/Prata/Bronze por mes. Nota de
-- confianca: qualquer jogador autenticado pode inserir uma linha creditando
-- QUALQUER user_id (nao so o proprio) - necessario porque quem fizer login
-- primeiro depois da virada do mes pode ter de publicar a medalha de outra
-- pessoa (nao ha Edge Functions/service role neste projeto). Protegido so
-- pelo unique(month, medal) e pela ausencia de UPDATE/DELETE. Aceitavel
-- para um grupo pequeno de amigos de confianca.
create table public.monthly_medals (
  id bigint generated always as identity primary key,
  month text not null,
  medal text not null check (medal in ('gold', 'silver', 'bronze')),
  user_id uuid not null references public.profiles(id) on delete cascade,
  display_name text not null,
  distance_m numeric not null,
  awarded_at timestamptz not null default now(),
  unique (month, medal)
);

alter table public.monthly_medals enable row level security;

create policy "monthly_medals_select_all" on public.monthly_medals
  for select using (true);

create policy "monthly_medals_insert_authenticated" on public.monthly_medals
  for insert to authenticated with check (true);

-- Migracao: criaturas com que ja se entrou em combate pelo menos uma vez -
-- so estas mostram a Vida revelada no card (ver js/monsters.js, js/battle.js).
alter table public.player_progress add column if not exists encountered_creatures integer[] not null default '{}';

-- Migracao: soma vitalicia de distancia descartada por exceder MAX_SPEED_KMH
-- (ver js/training.js) - nunca conta para XP/leaderboard, so para o jogador
-- ver quanto ficou de fora (aba Perfil, card Resumo).
alter table public.player_progress add column if not exists discarded_speed_distance_m numeric not null default 0;

-- Migracao: modo de treino (caminhar/correr/bicicleta) e distancia efetiva
-- por sessao, apos o multiplicador de "justica de esforco" entre modos
-- (ver js/debug.js getXpMultiplier e secção 4 da documentação).
-- distance_m continua a ser a distancia real percorrida (GPS), imutavel
-- como sempre; effective_distance_m e a distancia que contou de facto para
-- XP/pontos/leaderboard/conquistas nesse momento - guardada explicitamente
-- (em vez de recalculada a partir do multiplicador atual) para o historico
-- nunca mudar retroativamente se os multiplicadores forem afinados mais
-- tarde no Debug.
alter table public.training_sessions add column if not exists mode text not null default 'correr';
alter table public.training_sessions add column if not exists effective_distance_m numeric;
-- Sessoes anteriores a esta funcionalidade so tinham um modo implicito, sem
-- multiplicador (equivalente a correr, fator 1.0) - o proprio distance_m
-- ja era o valor todo creditado para XP nessa altura.
update public.training_sessions set effective_distance_m = distance_m where effective_distance_m is null;
alter table public.training_sessions alter column effective_distance_m set not null;
alter table public.training_sessions alter column effective_distance_m set default 0;

-- Migracao: recorde de distancia de sessao e de ritmo, separados por modo
-- de treino (js/achievements.js generateSessionDistanceAchievements/
-- PACE_ACHIEVEMENTS - conquistas separadas por Caminhar/Correr/Bicicleta,
-- pedido explicitamente). best_session_distance_m/best_pace_mps (colunas
-- ja existentes, sem sufixo) continuam a representar especificamente
-- Correr - Caminhar/Bicicleta comecam do zero nestas colunas novas.
alter table public.player_progress add column if not exists best_session_distance_m_caminhar numeric not null default 0;
alter table public.player_progress add column if not exists best_session_distance_m_bicicleta numeric not null default 0;
alter table public.player_progress add column if not exists best_pace_mps_caminhar numeric not null default 0;
alter table public.player_progress add column if not exists best_pace_mps_bicicleta numeric not null default 0;

-- Migracao: novo sistema de status do jogador - substitui os 3 niveis de
-- equipamento (equip_level_vida/ataque/defesa, que so subiam Vida/Ataque/
-- Defesa em linha reta) por 4 status investiveis (Energia/Forca/
-- Resistencia/Foco - ver js/equipment.js, secção 7 da documentação). Foco e
-- novo (Destreza/Letalidade/Regeneração), sem equivalente antigo. Os
-- monstros nao foram alterados, continuam com o formula antiga.
alter table public.player_progress add column if not exists nivel_energia integer not null default 0;
alter table public.player_progress add column if not exists nivel_forca integer not null default 0;
alter table public.player_progress add column if not exists nivel_resistencia integer not null default 0;
alter table public.player_progress drop column if exists equip_level_vida;
alter table public.player_progress drop column if exists equip_level_ataque;
alter table public.player_progress drop column if exists equip_level_defesa;

-- Migracao: remove o Foco (nivel_foco) - decisao revertida antes de
-- qualquer jogador investir pontos nele. Destreza/Letalidade/Regeneracao
-- passam a ser alimentadas diretamente por Resistencia/Forca/Energia (ver
-- js/equipment.js, secção 7 da documentação), sem um 4º status separado.
alter table public.player_progress drop column if exists nivel_foco;

-- Depois do TEU primeiro login real no site (para a tua linha em profiles
-- existir), corre isto à parte, substituindo pelo teu uid (Authentication
-- → Users no dashboard, ou "select id, email from auth.users;"):
--
-- update public.profiles set is_admin = true where id = '<o-teu-uid>';
