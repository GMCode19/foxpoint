-- FOX POINT - 04 AGGIORNAMENTO (ranked + protezioni dello stress test)
-- Eseguilo nel SQL Editor se hai già un database installato: NON cancella taglie, punti, membri o risultati.
-- Va bene sia se avevi già eseguito il vecchio file "04 ranked" sia se non l'avevi fatto.
-- Si può rilanciare senza problemi. Chi riparte da zero con il file 01 ha già tutto e non ne ha bisogno.

-- pulizia di eventuali doppioni già presenti (necessaria prima del nuovo controllo anti-doppio clic):
-- tiene la dichiarazione in attesa più vecchia per ogni giocatore e taglia, rifiuta le copie
do $$ begin
  if to_regclass('public.claims') is not null then
    update claims c set status = 'rejected', note = coalesce(note, 'Doppione rimosso automaticamente')
    where status = 'pending' and exists (
      select 1 from claims d where d.bounty_id = c.bounty_id and d.hunter_id = c.hunter_id
        and d.status = 'pending' and (d.created_at, d.id) < (c.created_at, c.id));
  end if;
end $$;

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

-- Controllo: 6 tier, 34 righe di punti
select (select count(*) from ranked_tiers) as tier,
       (select count(*) from ranked_tier_points) as righe_punti,
       (select count(*) from tournaments) as tornei;
