-- FOX POINT & BOUNTY SYSTEM - schema v2 (multi-team)
-- Esegui tutto nel SQL Editor di Supabase (file 01 di 03, dopo il 00 se riparti da zero)

-- ============ TABELLE ============

create table teams (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  slug       text not null unique,
  join_code  text not null unique default upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)),
  created_at timestamptz not null default now()
);

-- Blader = giocatore (anche esterno al team: i bersagli sono bladers senza account)
create table bladers (
  id           uuid primary key default gen_random_uuid(),
  nickname     text not null unique,
  pro_rank     int,                          -- posizione classifica Pro Bladers Italia
  pbi_nickname text,                         -- nickname su PBI se diverso (per sync futura)
  pbi_id       text,                         -- id profilo PBI
  pro_points   int,                          -- punti PBI all'ultima sincronizzazione
  pro_synced_at timestamptz,                 -- data ultima sincronizzazione con PBI
  user_id      uuid unique references auth.users(id) on delete set null,
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

create table team_members (
  team_id   uuid not null references teams(id) on delete cascade,
  blader_id uuid not null references bladers(id) on delete cascade,
  role      text not null default 'player' check (role in ('player','admin')),
  status    text not null default 'active' check (status in ('active','inactive')),
  joined_at timestamptz not null default now(),
  primary key (team_id, blader_id)
);

-- Richieste di ingresso: l'utente si registra, inserisce il codice team, l'admin approva
create table join_requests (
  id         uuid primary key default gen_random_uuid(),
  team_id    uuid not null references teams(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  email      text,
  nickname   text not null,
  status     text not null default 'pending' check (status in ('pending','approved','rejected')),
  decided_by uuid references bladers(id),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index one_pending_request on join_requests (team_id, user_id) where status = 'pending';

create table seasons (
  id        uuid primary key default gen_random_uuid(),
  team_id   uuid not null references teams(id) on delete cascade,
  year      int  not null,
  starts_on date not null,
  ends_on   date not null,
  is_active boolean not null default false,
  unique (team_id, year),
  unique (id, team_id)
);
create unique index one_active_season on seasons (team_id) where is_active;

-- Taglia: bersaglio + valore, per team e stagione
create table bounties (
  id         uuid primary key default gen_random_uuid(),
  team_id    uuid not null references teams(id) on delete cascade,
  season_id  uuid not null,
  target_id  uuid not null references bladers(id),
  value      int  not null check (value >= 0),
  active     boolean not null default true,
  category   text not null default 'rilevante' check (category in ('top10','rilevante','capo')),
  created_at timestamptz not null default now(),
  unique (season_id, target_id),
  unique (id, team_id),
  foreign key (season_id, team_id) references seasons(id, team_id)
);

create table bounty_value_history (
  id         uuid primary key default gen_random_uuid(),
  bounty_id  uuid not null references bounties(id) on delete cascade,
  value      int  not null,
  changed_at timestamptz not null default now()
);

-- Riscossione: "ho battuto X"
create table claims (
  id             uuid primary key default gen_random_uuid(),
  team_id        uuid not null,              -- impostati dal trigger a partire dalla taglia
  season_id      uuid not null,
  bounty_id      uuid not null,
  hunter_id      uuid not null references bladers(id),
  target_id      uuid not null references bladers(id),
  value_snapshot int  not null,              -- valore della taglia al momento della dichiarazione
  played_on      date not null default current_date,
  note           text,
  status         text not null default 'pending' check (status in ('pending','approved','rejected','revoked')),
  decided_by     uuid references bladers(id),
  decided_at     timestamptz,
  created_at     timestamptz not null default now(),
  check (hunter_id <> target_id),
  foreign key (bounty_id, team_id) references bounties(id, team_id)
);

-- Registro punti: il Fox Point si CALCOLA sommando questa tabella
create table points_ledger (
  id         uuid primary key default gen_random_uuid(),
  team_id    uuid not null,
  season_id  uuid not null,
  blader_id  uuid not null references bladers(id),
  points     int  not null,
  source     text not null check (source in ('bounty','ranked','bonus','manual')),
  ref_id     uuid,
  note       text,
  created_at timestamptz not null default now(),
  unique (source, ref_id),
  foreign key (season_id, team_id) references seasons(id, team_id)
);

-- ============ FUNZIONI DI SUPPORTO ============

create or replace function current_blader_id() returns uuid
language sql stable security definer set search_path = public as
$$ select id from bladers where user_id = auth.uid() $$;

-- Team di cui l'utente corrente è membro attivo
create or replace function my_team_ids() returns setof uuid
language sql stable security definer set search_path = public as
$$ select tm.team_id from team_members tm
   join bladers b on b.id = tm.blader_id
   where b.user_id = auth.uid() and tm.status = 'active' $$;

create or replace function is_team_admin(p_team uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from team_members tm
   join bladers b on b.id = tm.blader_id
   where b.user_id = auth.uid() and tm.team_id = p_team
     and tm.role = 'admin' and tm.status = 'active') $$;

create or replace function is_any_admin() returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from team_members tm
   join bladers b on b.id = tm.blader_id
   where b.user_id = auth.uid() and tm.role = 'admin' and tm.status = 'active') $$;

-- ============ REGISTRAZIONE E INGRESSO NEL TEAM ============

-- L'utente (già registrato su Supabase Auth) chiede di entrare con il codice del team
create or replace function request_join(p_code text, p_nickname text) returns uuid
language plpgsql security definer set search_path = public as $$
declare t teams; new_id uuid;
begin
  if auth.uid() is null then raise exception 'Devi essere autenticato'; end if;
  select * into t from teams where join_code = upper(trim(p_code));
  if not found then raise exception 'Codice team non valido'; end if;
  if t.id in (select my_team_ids()) then raise exception 'Fai già parte di questo team'; end if;
  insert into join_requests (team_id, user_id, email, nickname)
  values (t.id, auth.uid(), auth.jwt() ->> 'email', trim(p_nickname))
  returning id into new_id;
  return new_id;
end $$;

-- Admin: approva. Se il giocatore esiste già (es. membro inserito dal seed) si passa p_blader
-- per collegare l'account a quel blader; se null ne viene creato uno nuovo.
create or replace function approve_join(p_request uuid, p_blader uuid default null, p_role text default 'player')
returns void language plpgsql security definer set search_path = public as $$
declare r join_requests; v_blader uuid;
begin
  select * into r from join_requests where id = p_request and status = 'pending' for update;
  if not found then raise exception 'Richiesta non trovata o già gestita'; end if;
  if not is_team_admin(r.team_id) then raise exception 'Solo admin del team'; end if;

  select id into v_blader from bladers where user_id = r.user_id;   -- già ha un profilo (es. altro team)
  if v_blader is null then
    if p_blader is not null then
      update bladers set user_id = r.user_id where id = p_blader and user_id is null returning id into v_blader;
      if v_blader is null then raise exception 'Blader non trovato o già collegato a un account'; end if;
    else
      insert into bladers (nickname, user_id) values (r.nickname, r.user_id) returning id into v_blader;
    end if;
  end if;

  insert into team_members (team_id, blader_id, role, status)
  values (r.team_id, v_blader, p_role, 'active')
  on conflict (team_id, blader_id) do update set status = 'active';

  update join_requests set status = 'approved', decided_by = current_blader_id(), decided_at = now()
   where id = p_request;
end $$;

create or replace function reject_join(p_request uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r join_requests;
begin
  select * into r from join_requests where id = p_request and status = 'pending' for update;
  if not found then raise exception 'Richiesta non trovata o già gestita'; end if;
  if not is_team_admin(r.team_id) then raise exception 'Solo admin del team'; end if;
  update join_requests set status = 'rejected', decided_by = current_blader_id(), decided_at = now()
   where id = p_request;
end $$;

-- ============ TAGLIE E RISCOSSIONI ============

-- Alla creazione della claim: copia team, stagione, bersaglio e valore dalla taglia
create or replace function claims_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare b bounties;
begin
  select * into b from bounties where id = new.bounty_id and active;
  if not found then raise exception 'Taglia non attiva'; end if;
  if not exists (select 1 from team_members
                  where team_id = b.team_id and blader_id = new.hunter_id and status = 'active') then
    raise exception 'Il cacciatore non è un membro del team';
  end if;
  new.team_id        := b.team_id;
  new.season_id      := b.season_id;
  new.target_id      := b.target_id;
  new.value_snapshot := b.value;
  return new;
end $$;
create trigger trg_claims_before_insert before insert on claims
for each row execute function claims_before_insert();

-- Storico valore taglia
create or replace function bounty_history() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.value <> old.value then
    insert into bounty_value_history (bounty_id, value) values (new.id, new.value);
  end if;
  return new;
end $$;
create trigger trg_bounty_history after insert or update on bounties
for each row execute function bounty_history();

-- Admin: approva / rifiuta una riscossione
create or replace function decide_claim(p_claim uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = public as $$
declare c claims;
begin
  select * into c from claims where id = p_claim and status = 'pending' for update;
  if not found then raise exception 'Claim non trovata o già decisa'; end if;
  if not is_team_admin(c.team_id) then raise exception 'Solo admin del team'; end if;

  update claims set status = case when p_approve then 'approved' else 'rejected' end,
         decided_by = current_blader_id(), decided_at = now()
   where id = p_claim;

  if p_approve then
    insert into points_ledger (team_id, season_id, blader_id, points, source, ref_id, note)
    values (c.team_id, c.season_id, c.hunter_id, c.value_snapshot, 'bounty', c.id, 'Taglia riscossa');
  end if;
end $$;

-- Admin: registra direttamente una vittoria (già approvata)
create or replace function admin_register_claim(p_bounty uuid, p_hunter uuid, p_played_on date default current_date)
returns uuid language plpgsql security definer set search_path = public as $$
declare new_id uuid; v_team uuid;
begin
  select team_id into v_team from bounties where id = p_bounty;
  if v_team is null or not is_team_admin(v_team) then raise exception 'Solo admin del team'; end if;
  insert into claims (bounty_id, hunter_id, played_on) values (p_bounty, p_hunter, p_played_on)
  returning id into new_id;
  perform decide_claim(new_id, true);
  return new_id;
end $$;

-- Admin: revoca una riscossione già approvata (errore, vittoria non reale...)
-- Toglie i punti dal registro e marca la riscossione come 'revoked'.
create or replace function revoke_claim(p_claim uuid, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare c claims;
begin
  select * into c from claims where id = p_claim for update;
  if not found then raise exception 'Riscossione non trovata'; end if;
  if not is_team_admin(c.team_id) then raise exception 'Solo admin del team'; end if;
  if c.status <> 'approved' then raise exception 'Si può revocare solo una riscossione approvata'; end if;

  delete from points_ledger where source = 'bounty' and ref_id = c.id;
  update claims set status = 'revoked', decided_by = current_blader_id(), decided_at = now(),
         note = coalesce(nullif(trim(p_note), ''), note)
   where id = p_claim;
end $$;

-- Admin: correzione punti a mano (p_points può essere negativo)
create or replace function adjust_points(p_blader uuid, p_points int, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_team uuid; v_season uuid; new_id uuid;
begin
  select tm.team_id into v_team from team_members tm
   where tm.blader_id = p_blader and tm.status = 'active'
     and is_team_admin(tm.team_id) limit 1;
  if v_team is null then raise exception 'Solo admin del team'; end if;
  if p_points = 0 then raise exception 'Indica un numero di punti diverso da zero'; end if;

  select id into v_season from seasons where team_id = v_team and is_active;
  if v_season is null then raise exception 'Nessuna stagione attiva'; end if;

  insert into points_ledger (team_id, season_id, blader_id, points, source, note)
  values (v_team, v_season, p_blader, p_points, 'manual', nullif(trim(p_note), ''))
  returning id into new_id;
  return new_id;
end $$;

-- Admin: annulla una correzione manuale
create or replace function delete_adjustment(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare l points_ledger;
begin
  select * into l from points_ledger where id = p_id for update;
  if not found then raise exception 'Movimento non trovato'; end if;
  if not is_team_admin(l.team_id) then raise exception 'Solo admin del team'; end if;
  if l.source <> 'manual' then raise exception 'Si possono annullare solo le correzioni manuali'; end if;
  delete from points_ledger where id = p_id;
end $$;

-- ============ CLASSIFICA (per team, stagione attiva) ============

create or replace view leaderboard with (security_invoker = true) as
select tm.team_id, s.id as season_id, b.id as blader_id, b.nickname,
       coalesce(sum(l.points),0) as fox_points,
       coalesce(sum(l.points) filter (where l.source = 'bounty'),0) as bounty_points,
       coalesce(sum(l.points) filter (where l.source = 'ranked'),0) as ranked_points
from team_members tm
join bladers b on b.id = tm.blader_id
join seasons s on s.team_id = tm.team_id and s.is_active
left join points_ledger l on l.blader_id = b.id and l.season_id = s.id
where tm.status = 'active'
group by tm.team_id, s.id, b.id, b.nickname;

-- ============ SICUREZZA (RLS) ============

alter table teams                enable row level security;
alter table bladers              enable row level security;
alter table team_members         enable row level security;
alter table join_requests        enable row level security;
alter table seasons              enable row level security;
alter table bounties             enable row level security;
alter table bounty_value_history enable row level security;
alter table claims               enable row level security;
alter table points_ledger        enable row level security;

-- Lettura: ognuno vede solo i dati dei propri team
create policy read_own on teams       for select to authenticated using (id in (select my_team_ids()));
create policy read_own on team_members for select to authenticated using (team_id in (select my_team_ids()));
create policy read_own on seasons     for select to authenticated using (team_id in (select my_team_ids()));
create policy read_own on bounties    for select to authenticated using (team_id in (select my_team_ids()));
create policy read_own on claims      for select to authenticated using (team_id in (select my_team_ids()));
create policy read_own on points_ledger for select to authenticated using (team_id in (select my_team_ids()));
create policy read_own on bounty_value_history for select to authenticated
  using (exists (select 1 from bounties b where b.id = bounty_id and b.team_id in (select my_team_ids())));

-- Anagrafica bladers: la vede chi è in almeno un team (i bersagli PBI sono condivisi)
create policy read_members on bladers for select to authenticated
  using (exists (select 1 from my_team_ids()));
-- Gli admin gestiscono i bladers non ancora collegati a un account (bersagli esterni, membri da seed)
create policy admin_write on bladers for all to authenticated
  using (is_any_admin() and user_id is null)
  with check (is_any_admin() and user_id is null);

-- Richieste di ingresso: le vede chi le ha fatte e gli admin del team. Si creano solo con request_join().
create policy read_requests on join_requests for select to authenticated
  using (user_id = auth.uid() or is_team_admin(team_id));

-- Scrittura admin sul proprio team
create policy admin_write on team_members for all to authenticated
  using (is_team_admin(team_id)) with check (is_team_admin(team_id));
create policy admin_write on seasons for all to authenticated
  using (is_team_admin(team_id)) with check (is_team_admin(team_id));
create policy admin_write on bounties for all to authenticated
  using (is_team_admin(team_id)) with check (is_team_admin(team_id));
create policy admin_update on teams for update to authenticated
  using (is_team_admin(id)) with check (is_team_admin(id));

-- Un giocatore può dichiarare solo vittorie a proprio nome, sempre 'pending'
create policy member_claim on claims for insert to authenticated
  with check (hunter_id = current_blader_id() and status = 'pending');

-- Il registro punti si scrive solo tramite le funzioni (security definer)

-- ============ RANKED PBI ============
-- Punti: partecipazione (per team, default 5) + bonus qualified + punti piazzamento (scala ufficiale PBI)

alter table teams add column if not exists participation_points int not null default 5;
alter table teams drop constraint if exists teams_participation_points_check;
alter table teams add constraint teams_participation_points_check check (participation_points between 0 and 1000);

-- Tier ufficiali PBI
create table if not exists ranked_tiers (
  tier            text primary key,
  label           text not null,
  max_players     int  not null,
  qualified_bonus int  not null,
  sort            int  not null
);

-- Punti piazzamento per tier (tabella ufficiale probladers.it/ranking)
create table if not exists ranked_tier_points (
  tier   text not null references ranked_tiers(tier) on delete cascade,
  phase  text not null check (phase in ('winner','final','sf','qf','r16','r32','r64','r128')),
  points int  not null check (points >= 0),
  primary key (tier, phase)
);

insert into ranked_tiers (tier, label, max_players, qualified_bonus, sort) values
  ('320',     'PBI 320',      32, 10, 1),
  ('480',     'PBI 480',      48, 10, 2),
  ('640',     'PBI 640',      64, 20, 3),
  ('960',     'PBI 960',      96, 15, 4),
  ('masters', 'PBI Masters', 128, 30, 5),
  ('slam',    'Grande Slam', 256, 40, 6)
on conflict (tier) do update set label = excluded.label, max_players = excluded.max_players,
  qualified_bonus = excluded.qualified_bonus, sort = excluded.sort;

insert into ranked_tier_points (tier, phase, points) values
  ('slam','winner',2560), ('slam','final',1700), ('slam','sf',800), ('slam','qf',400),
  ('slam','r16',200), ('slam','r32',100), ('slam','r64',50), ('slam','r128',25),
  ('masters','winner',1280), ('masters','final',835), ('masters','sf',400), ('masters','qf',200),
  ('masters','r16',100), ('masters','r32',50),
  ('960','winner',960), ('960','final',625), ('960','sf',300), ('960','qf',150), ('960','r16',75), ('960','r32',35),
  ('640','winner',640), ('640','final',425), ('640','sf',200), ('640','qf',100), ('640','r16',50),
  ('480','winner',480), ('480','final',315), ('480','sf',100), ('480','qf',50), ('480','r16',25),
  ('320','winner',320), ('320','final',165), ('320','sf',50), ('320','qf',25)
on conflict (tier, phase) do update set points = excluded.points;

-- Tornei ranked (condivisi tra i team)
create table if not exists tournaments (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  tier       text not null references ranked_tiers(tier),
  starts_at  timestamptz not null,
  club       text,
  city       text,
  url        text unique,
  created_at timestamptz not null default now()
);
-- team che ha inserito il torneo: solo i suoi admin possono modificarlo (null = torneo ufficiale, sola lettura)
alter table tournaments add column if not exists created_by_team uuid references teams(id) on delete set null;

-- Iscrizione e risultato di un membro a una ranked
create table if not exists tournament_entries (
  id                uuid primary key default gen_random_uuid(),
  team_id           uuid not null references teams(id) on delete cascade,
  tournament_id     uuid not null references tournaments(id) on delete restrict,
  blader_id         uuid not null references bladers(id),
  status            text not null default 'registered'
                    check (status in ('registered','pending','approved','rejected','revoked')),
  phase             text check (phase in ('groups','r128','r64','r32','r16','qf','sf','final','winner')),
  participation_pts int,
  qualified_pts     int,
  placement_pts     int,
  total_pts         int generated always as
                    (coalesce(participation_pts,0) + coalesce(qualified_pts,0) + coalesce(placement_pts,0)) stored,
  note              text,
  decided_by        uuid references bladers(id),
  decided_at        timestamptz,
  created_at        timestamptz not null default now(),
  unique (team_id, tournament_id, blader_id)
);

-- Calcola i punti di un piazzamento: 'groups' = eliminato ai gironi (solo partecipazione)
create or replace function ranked_points_for(p_tier text, p_phase text, out qualified int, out placement int)
language plpgsql stable set search_path = public as $$
begin
  if p_phase = 'groups' then qualified := 0; placement := 0; return; end if;
  select points into placement from ranked_tier_points where tier = p_tier and phase = p_phase;
  if placement is null then raise exception 'Questo piazzamento non esiste per il tier %', p_tier; end if;
  select qualified_bonus into qualified from ranked_tiers where tier = p_tier;
end $$;

create or replace function phase_label(p_phase text) returns text
language sql immutable as $$
  select case p_phase when 'groups' then 'Gironi' when 'r128' then 'R128' when 'r64' then 'R64'
    when 'r32' then 'R32' when 'r16' then 'Ottavi' when 'qf' then 'Quarti' when 'sf' then 'Semifinale'
    when 'final' then 'Finale' when 'winner' then 'Vincitore' end $$;

create or replace function _is_active_member(p_team uuid, p_blader uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from team_members where team_id = p_team and blader_id = p_blader and status = 'active') $$;

-- Giocatore: "Partecipo" (fino all'inizio del torneo)
create or replace function ranked_join(p_team uuid, p_tournament uuid) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := current_blader_id();
begin
  if me is null or not _is_active_member(p_team, me) then raise exception 'Non fai parte di questo team'; end if;
  if not exists (select 1 from tournaments where id = p_tournament and starts_at > now()) then
    raise exception 'Il torneo è già iniziato: inserisci direttamente il tuo risultato';
  end if;
  insert into tournament_entries (team_id, tournament_id, blader_id)
  values (p_team, p_tournament, me) on conflict (team_id, tournament_id, blader_id) do nothing;
end $$;

-- Giocatore: annulla la partecipazione (solo se non ha ancora inserito un risultato)
create or replace function ranked_leave(p_team uuid, p_tournament uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from tournament_entries
   where team_id = p_team and tournament_id = p_tournament
     and blader_id = current_blader_id() and status = 'registered';
end $$;

-- Interno: crea/aggiorna il risultato come 'pending' con i punti calcolati
create or replace function _ranked_set_result(p_team uuid, p_tournament uuid, p_blader uuid, p_phase text)
returns uuid language plpgsql security definer set search_path = public as $$
declare t tournaments; e tournament_entries; r record; part int; new_id uuid;
begin
  select * into t from tournaments where id = p_tournament;
  if not found then raise exception 'Torneo non trovato'; end if;
  if t.starts_at > now() then raise exception 'Il torneo non è ancora iniziato'; end if;
  if not _is_active_member(p_team, p_blader) then raise exception 'Il blader non fa parte del team'; end if;

  select * into e from tournament_entries
   where team_id = p_team and tournament_id = p_tournament and blader_id = p_blader for update;
  if found and e.status = 'approved' then
    raise exception 'Risultato già approvato: per cambiarlo un admin deve prima revocarlo';
  end if;

  select * into r from ranked_points_for(t.tier, p_phase);
  select participation_points into part from teams where id = p_team;

  insert into tournament_entries (team_id, tournament_id, blader_id, status, phase,
                                  participation_pts, qualified_pts, placement_pts)
  values (p_team, p_tournament, p_blader, 'pending', p_phase, part, r.qualified, r.placement)
  on conflict (team_id, tournament_id, blader_id) do update set
    status = 'pending', phase = excluded.phase, participation_pts = excluded.participation_pts,
    qualified_pts = excluded.qualified_pts, placement_pts = excluded.placement_pts,
    decided_by = null, decided_at = null
  where tournament_entries.status <> 'approved'      -- un risultato già confermato non si tocca, neanche in contemporanea
  returning id into new_id;
  if new_id is null then
    raise exception 'Risultato già approvato: per cambiarlo un admin deve prima revocarlo';
  end if;
  return new_id;
end $$;

-- Giocatore: "Com'è andata?" (dall'inizio del torneo in poi)
create or replace function ranked_report(p_team uuid, p_tournament uuid, p_phase text) returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := current_blader_id();
begin
  if me is null then raise exception 'Non autenticato'; end if;
  return _ranked_set_result(p_team, p_tournament, me, p_phase);
end $$;

-- Admin: approva / rifiuta un risultato.
-- p_phase = piazzamento che l'admin sta vedendo: se nel frattempo il giocatore l'ha cambiato, si blocca.
drop function if exists ranked_decide(uuid, boolean);
create or replace function ranked_decide(p_entry uuid, p_approve boolean, p_phase text default null) returns void
language plpgsql security definer set search_path = public as $$
declare e tournament_entries; t tournaments; v_season uuid;
begin
  select * into e from tournament_entries where id = p_entry for update;
  if not found or e.status <> 'pending' then raise exception 'Risultato non trovato o già gestito'; end if;
  if not is_team_admin(e.team_id) then raise exception 'Solo admin del team'; end if;
  if p_phase is not null and p_phase is distinct from e.phase then
    raise exception 'Il giocatore ha appena cambiato il piazzamento: ricarica e ricontrolla prima di confermare';
  end if;

  if not p_approve then
    update tournament_entries set status = 'rejected', decided_by = current_blader_id(), decided_at = now()
     where id = p_entry;
    return;
  end if;

  select id into v_season from seasons where team_id = e.team_id and is_active;
  if v_season is null then raise exception 'Nessuna stagione attiva'; end if;
  select * into t from tournaments where id = e.tournament_id;

  update tournament_entries set status = 'approved', decided_by = current_blader_id(), decided_at = now()
   where id = p_entry;
  insert into points_ledger (team_id, season_id, blader_id, points, source, ref_id, note)
  values (e.team_id, v_season, e.blader_id, e.total_pts, 'ranked', e.id, t.name || ' · ' || phase_label(e.phase));
end $$;

-- Admin: registra direttamente il risultato di un membro (già approvato)
create or replace function ranked_admin_register(p_tournament uuid, p_blader uuid, p_phase text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_team uuid; new_id uuid;
begin
  select tm.team_id into v_team from team_members tm
   where tm.blader_id = p_blader and tm.status = 'active' and is_team_admin(tm.team_id) limit 1;
  if v_team is null then raise exception 'Solo admin del team'; end if;
  new_id := _ranked_set_result(v_team, p_tournament, p_blader, p_phase);
  perform ranked_decide(new_id, true);
  return new_id;
end $$;

-- Admin: revoca un risultato approvato (toglie i punti)
create or replace function ranked_revoke(p_entry uuid, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare e tournament_entries;
begin
  select * into e from tournament_entries where id = p_entry for update;
  if not found then raise exception 'Risultato non trovato'; end if;
  if not is_team_admin(e.team_id) then raise exception 'Solo admin del team'; end if;
  if e.status <> 'approved' then raise exception 'Si può revocare solo un risultato approvato'; end if;
  delete from points_ledger where source = 'ranked' and ref_id = e.id;
  update tournament_entries set status = 'revoked', decided_by = current_blader_id(), decided_at = now(),
         note = coalesce(nullif(trim(p_note), ''), note)
   where id = p_entry;
end $$;

-- Permessi
alter table ranked_tiers       enable row level security;
alter table ranked_tier_points enable row level security;
alter table tournaments        enable row level security;
alter table tournament_entries enable row level security;

drop policy if exists read_all on ranked_tiers;
drop policy if exists read_all on ranked_tier_points;
drop policy if exists read_team on tournaments;
drop policy if exists admin_write on tournaments;
drop policy if exists admin_insert on tournaments;
drop policy if exists admin_update on tournaments;
drop policy if exists admin_delete on tournaments;
drop policy if exists read_own on tournament_entries;

create policy read_all on ranked_tiers       for select to authenticated using (true);
create policy read_all on ranked_tier_points for select to authenticated using (true);
create policy read_team on tournaments for select to authenticated using (exists (select 1 from my_team_ids()));
create policy admin_insert on tournaments for insert to authenticated with check (is_team_admin(created_by_team));
create policy admin_update on tournaments for update to authenticated
  using (is_team_admin(created_by_team)) with check (is_team_admin(created_by_team));
create policy admin_delete on tournaments for delete to authenticated using (is_team_admin(created_by_team));
create policy read_own on tournament_entries for select to authenticated using (team_id in (select my_team_ids()));
-- Iscrizioni e risultati si scrivono solo tramite le funzioni ranked_*

-- Prossime ranked dal calendario PBI (letto il 04/11/2026)
insert into tournaments (name, tier, starts_at, club, city, url) values
  ('PBI 640 - Grilled Shark', '640', '2026-11-07 11:00 Europe/Rome', 'Grilled Shark', 'Como',
   'https://www.probladers.it/calendario-eventi/pbi-640-grilled-shark-07-11-2026'),
  ('PBI 960 - Black Cat',     '960', '2026-11-08 14:00 Europe/Rome', 'Black Cat',     'Monza',
   'https://www.probladers.it/calendario-eventi/pbi-960-black-cat-08-11-2026')
on conflict (url) do nothing;


-- ============ PROTEZIONI E PRESTAZIONI (stress test del 04/11/2026) ============

-- Dichiarazione taglia: niente doppioni in attesa, niente date future, niente campi "decisi" falsi
create or replace function claims_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare b bounties;
begin
  select * into b from bounties where id = new.bounty_id and active;
  if not found then raise exception 'Taglia non attiva'; end if;
  if not exists (select 1 from team_members
                  where team_id = b.team_id and blader_id = new.hunter_id and status = 'active') then
    raise exception 'Il cacciatore non è un membro del team';
  end if;
  if exists (select 1 from claims where bounty_id = new.bounty_id and hunter_id = new.hunter_id and status = 'pending') then
    raise exception 'C''è già una dichiarazione in attesa per questa taglia';
  end if;
  if new.played_on > current_date + 1 then raise exception 'La data della vittoria non può essere nel futuro'; end if;
  new.team_id        := b.team_id;
  new.season_id      := b.season_id;
  new.target_id      := b.target_id;
  new.value_snapshot := b.value;
  new.status         := 'pending';
  new.decided_by     := null;
  new.decided_at     := null;
  return new;
end $$;
-- blocca anche i doppi clic simultanei
create unique index if not exists one_pending_claim on claims (bounty_id, hunter_id) where status = 'pending';

-- Richiesta di ingresso: nickname valido, messaggio chiaro se ce n'è già una in attesa
create or replace function request_join(p_code text, p_nickname text) returns uuid
language plpgsql security definer set search_path = public as $$
declare t teams; new_id uuid; v_nick text := trim(coalesce(p_nickname, ''));
begin
  if auth.uid() is null then raise exception 'Devi essere autenticato'; end if;
  if length(v_nick) < 2 or length(v_nick) > 30 then raise exception 'Il nickname deve avere tra 2 e 30 caratteri'; end if;
  select * into t from teams where join_code = upper(trim(p_code));
  if not found then raise exception 'Codice team non valido'; end if;
  if t.id in (select my_team_ids()) then raise exception 'Fai già parte di questo team'; end if;
  if exists (select 1 from join_requests where team_id = t.id and user_id = auth.uid() and status = 'pending') then
    raise exception 'Hai già una richiesta in attesa per questo team';
  end if;
  insert into join_requests (team_id, user_id, email, nickname)
  values (t.id, auth.uid(), auth.jwt() ->> 'email', v_nick)
  returning id into new_id;
  return new_id;
end $$;

-- Approvazione: messaggio chiaro se il nickname esiste già
create or replace function approve_join(p_request uuid, p_blader uuid default null, p_role text default 'player')
returns void language plpgsql security definer set search_path = public as $$
declare r join_requests; v_blader uuid;
begin
  select * into r from join_requests where id = p_request and status = 'pending' for update;
  if not found then raise exception 'Richiesta non trovata o già gestita'; end if;
  if not is_team_admin(r.team_id) then raise exception 'Solo admin del team'; end if;

  select id into v_blader from bladers where user_id = r.user_id;
  if v_blader is null then
    if p_blader is not null then
      update bladers set user_id = r.user_id where id = p_blader and user_id is null returning id into v_blader;
      if v_blader is null then raise exception 'Blader non trovato o già collegato a un account'; end if;
    else
      begin
        insert into bladers (nickname, user_id) values (r.nickname, r.user_id) returning id into v_blader;
      exception when unique_violation then
        raise exception 'Esiste già un blader chiamato "%": usa "Collega a" oppure rifiuta la richiesta', r.nickname;
      end;
    end if;
  end if;

  insert into team_members (team_id, blader_id, role, status)
  values (r.team_id, v_blader, p_role, 'active')
  on conflict (team_id, blader_id) do update set status = 'active';

  update join_requests set status = 'approved', decided_by = current_blader_id(), decided_at = now()
   where id = p_request;
end $$;

-- L'anagrafica dei blader è condivisa tra i team: si modifica solo dal database o dalla sincronizzazione PBI
drop policy if exists admin_write on bladers;

-- Ogni team deve avere sempre almeno un admin attivo
create or replace function keep_one_admin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.role = 'admin' and old.status = 'active'
     and (tg_op = 'DELETE' or new.role <> 'admin' or new.status <> 'active')
     and exists (select 1 from teams where id = old.team_id) then
    perform 1 from teams where id = old.team_id for update;   -- serializza modifiche simultanee
    if not exists (select 1 from team_members where team_id = old.team_id and role = 'admin'
                    and status = 'active' and blader_id <> old.blader_id) then
      raise exception 'Il team deve avere almeno un admin attivo';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
drop trigger if exists trg_keep_one_admin on team_members;
create trigger trg_keep_one_admin before update or delete on team_members
for each row execute function keep_one_admin();

-- Indici per le query dell'app e per i permessi
create index if not exists idx_ledger_team_season   on points_ledger (team_id, season_id, created_at);
create index if not exists idx_ledger_blader_season on points_ledger (blader_id, season_id);
create index if not exists idx_claims_team_season   on claims (team_id, season_id, created_at desc);
create index if not exists idx_claims_hunter        on claims (hunter_id);
create index if not exists idx_claims_target        on claims (target_id);
create index if not exists idx_bounties_team        on bounties (team_id, season_id);
create index if not exists idx_members_blader       on team_members (blader_id);
create index if not exists idx_entries_team         on tournament_entries (team_id, tournament_id);
create index if not exists idx_entries_tournament   on tournament_entries (tournament_id);
create index if not exists idx_entries_blader       on tournament_entries (blader_id);
create index if not exists idx_tournaments_start    on tournaments (starts_at);
create index if not exists idx_requests_team        on join_requests (team_id, status);

-- ============ FOTO DEI GIOCATORI CON TAGLIA ============
-- Le foto stanno nello spazio PRIVATO "foto-bersagli" di Supabase Storage, una cartella per team:
--   <team_id>/<blader_id>-<data>.<estensione>
-- Le vede solo chi è membro di quel team; le caricano solo i suoi admin, dopo aver avuto il consenso.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('foto-bersagli', 'foto-bersagli', false, 524288, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- foto per team (ogni team decide le sue), con l'admin che ha confermato il consenso
create table if not exists blader_photos (
  team_id    uuid not null references teams(id) on delete cascade,
  blader_id  uuid not null references bladers(id) on delete cascade,
  path       text not null,
  consent_by uuid references bladers(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (team_id, blader_id)
);

create or replace function my_admin_team_ids() returns setof uuid
language sql stable security definer set search_path = public as
$$ select tm.team_id from team_members tm join bladers b on b.id = tm.blader_id
   where b.user_id = auth.uid() and tm.role = 'admin' and tm.status = 'active' $$;

-- Admin: registra la foto appena caricata. Restituisce il percorso della foto precedente (da cancellare).
create or replace function set_blader_photo(p_team uuid, p_blader uuid, p_path text) returns text
language plpgsql security definer set search_path = public as $$
declare old text;
begin
  if not is_team_admin(p_team) then raise exception 'Solo gli admin del team possono gestire le foto'; end if;
  if not exists (select 1 from bounties where team_id = p_team and target_id = p_blader) then
    raise exception 'Le foto si possono mettere solo ai giocatori che hanno una taglia';
  end if;
  if p_path is null or split_part(p_path, '/', 1) <> p_team::text or p_path !~ '^[0-9a-f-]+/[0-9a-f-]+-[0-9]+\.(webp|jpg|png)$' then
    raise exception 'Percorso della foto non valido';
  end if;
  select path into old from blader_photos where team_id = p_team and blader_id = p_blader;
  insert into blader_photos (team_id, blader_id, path, consent_by, updated_at)
  values (p_team, p_blader, p_path, current_blader_id(), now())
  on conflict (team_id, blader_id) do update
    set path = excluded.path, consent_by = excluded.consent_by, updated_at = now();
  return old;
end $$;

-- Admin: toglie la foto (es. se la persona cambia idea). Restituisce il percorso da cancellare.
create or replace function remove_blader_photo(p_team uuid, p_blader uuid) returns text
language plpgsql security definer set search_path = public as $$
declare old text;
begin
  if not is_team_admin(p_team) then raise exception 'Solo gli admin del team possono gestire le foto'; end if;
  delete from blader_photos where team_id = p_team and blader_id = p_blader returning path into old;
  return old;
end $$;

alter table blader_photos enable row level security;
drop policy if exists read_team on blader_photos;
create policy read_team on blader_photos for select to authenticated using (team_id in (select my_team_ids()));
-- si scrive solo con set_blader_photo / remove_blader_photo

-- permessi sui file
drop policy if exists "foto-bersagli lettura team" on storage.objects;
drop policy if exists "foto-bersagli caricamento admin" on storage.objects;
drop policy if exists "foto-bersagli modifica admin" on storage.objects;
drop policy if exists "foto-bersagli eliminazione admin" on storage.objects;
create policy "foto-bersagli lettura team" on storage.objects for select to authenticated
  using (bucket_id = 'foto-bersagli' and (storage.foldername(name))[1] in (select t::text from my_team_ids() t));
create policy "foto-bersagli caricamento admin" on storage.objects for insert to authenticated
  with check (bucket_id = 'foto-bersagli' and (storage.foldername(name))[1] in (select t::text from my_admin_team_ids() t));
create policy "foto-bersagli modifica admin" on storage.objects for update to authenticated
  using (bucket_id = 'foto-bersagli' and (storage.foldername(name))[1] in (select t::text from my_admin_team_ids() t));
create policy "foto-bersagli eliminazione admin" on storage.objects for delete to authenticated
  using (bucket_id = 'foto-bersagli' and (storage.foldername(name))[1] in (select t::text from my_admin_team_ids() t));


-- ============ TAGLIE TOP 10 LEGATE ALLA POSIZIONE (uguale allo script 08) ============
-- valore di ogni posizione (1-10) per ogni team
create table if not exists bounty_rank_values (
  team_id uuid not null references teams(id) on delete cascade,
  rank    int  not null check (rank between 1 and 10),
  value   int  not null check (value >= 0),
  primary key (team_id, rank)
);
alter table bounty_rank_values enable row level security;
drop policy if exists read_team on bounty_rank_values;
create policy read_team on bounty_rank_values for select to authenticated using (team_id in (select my_team_ids()));
-- si scrive solo dal trigger qui sotto (o dall'aggiornamento automatico)

-- un "rilevante" o "capo team" che entra in top 10 diventa Top 10; quando esce torna com'era, col suo valore
alter table bounties add column if not exists prev_category text;
alter table bounties add column if not exists prev_value int;

-- l'admin cambia il valore di una taglia Top 10 di un giocatore in top 10 -> diventa il valore di quella posizione
create or replace function bounty_rank_value_sync() returns trigger
language plpgsql security definer set search_path = public as $$
declare r int;
begin
  if new.category = 'top10' and new.value is distinct from old.value then
    select pro_rank into r from bladers where id = new.target_id;
    if r between 1 and 10 then
      insert into bounty_rank_values (team_id, rank, value) values (new.team_id, r, new.value)
      on conflict (team_id, rank) do update set value = excluded.value;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_bounty_rank_value on bounties;
create trigger trg_bounty_rank_value after update of value on bounties
for each row execute function bounty_rank_value_sync();

-- valori di partenza: quelli già impostati, dal più alto al più basso (1° posto = valore più alto)
insert into bounty_rank_values (team_id, rank, value)
select team_id, rn, value from (
  select b.team_id, b.value, row_number() over (partition by b.team_id order by b.value desc, bl.pro_rank) rn
  from bounties b
  join seasons s on s.id = b.season_id and s.is_active
  join bladers bl on bl.id = b.target_id
  where b.category = 'top10' and bl.pro_rank between 1 and 10
) x where rn <= 10
on conflict (team_id, rank) do nothing;

-- applica subito: ogni taglia Top 10 prende il valore della posizione attuale
update bounties b set value = v.value
from bladers bl, bounty_rank_values v, seasons s
where bl.id = b.target_id and s.id = b.season_id and s.is_active
  and b.category = 'top10' and v.team_id = b.team_id and v.rank = bl.pro_rank
  and b.value <> v.value;

