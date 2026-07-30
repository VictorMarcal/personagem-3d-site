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
  last_awarded_quarters integer not null default 0,
  defeated_levels integer[] not null default '{}',
  unlocked_achievements jsonb not null default '{}',
  best_session_distance_m numeric not null default 0,
  total_trainings_completed integer not null default 0,
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
  updated_at timestamptz not null default now()
);

alter table public.leaderboard enable row level security;

create policy "leaderboard_select_all" on public.leaderboard
  for select using (true);

create policy "leaderboard_insert_own" on public.leaderboard
  for insert with check (auth.uid() = user_id);

create policy "leaderboard_update_own" on public.leaderboard
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Depois do TEU primeiro login real no site (para a tua linha em profiles
-- existir), corre isto à parte, substituindo pelo teu uid (Authentication
-- → Users no dashboard, ou "select id, email from auth.users;"):
--
-- update public.profiles set is_admin = true where id = '<o-teu-uid>';
