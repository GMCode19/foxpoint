-- FOX POINT - 09 AGGIORNAMENTI IN TEMPO REALE E NOTIFICHE
-- 1) l'app si aggiorna da sola quando qualcuno dichiara, un admin approva, arriva una ranked…
-- 2) notifiche sul telefono (facoltative, ognuno sceglie quali) inviate dalla funzione "push" di Supabase.
-- Si può eseguire più volte senza problemi.

-- ============ 1. TEMPO REALE ============
do $$
declare t text;
begin
  foreach t in array array['claims','tournament_entries','points_ledger','bounties','blader_photos','join_requests','tournaments'] loop
    if to_regclass('public.' || t) is not null and not exists (
      select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ============ 2. NOTIFICHE ============
create extension if not exists pg_net;

-- configurazione (solo per il server: nessuno dall'app può leggerla)
create table if not exists push_config (
  id          int primary key default 1 check (id = 1),
  public_key  text,                 -- chiavi VAPID: le crea la funzione "push" al primo avvio
  private_key text,
  hook_secret text not null default replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  function_url text not null default 'https://udjviairelbvohdfwhhb.supabase.co/functions/v1/push'
);
insert into push_config (id) values (1) on conflict (id) do nothing;
alter table push_config enable row level security;

-- la chiave pubblica serve all'app per iscriversi (è pubblica per definizione)
create or replace function push_public_key() returns text
language sql stable security definer set search_path = public as $$ select public_key from push_config where id = 1 $$;

-- telefoni iscritti: ognuno vede e gestisce solo i propri
create table if not exists push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid(),
  blader_id  uuid not null references bladers(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  prefs      jsonb not null default '{"mine":true,"overtake":true,"ranked":true,"admin":true}',
  created_at timestamptz not null default now()
);
alter table push_subscriptions enable row level security;
drop policy if exists own_subs on push_subscriptions;
create policy own_subs on push_subscriptions for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and blader_id = current_blader_id());
create index if not exists idx_push_subs_blader on push_subscriptions (blader_id);

-- coda dei messaggi da inviare (la svuota la funzione "push")
create table if not exists push_queue (
  id         bigserial primary key,
  blader_ids uuid[] not null,
  kind       text not null check (kind in ('mine','overtake','ranked','admin')),
  title      text not null,
  body       text not null,
  url        text not null default '',
  tag        text,
  created_at timestamptz not null default now(),
  sent_at    timestamptz
);
alter table push_queue enable row level security;

-- accoda un messaggio solo se almeno un destinatario ha le notifiche attive
create or replace function push_enqueue(p_bladers uuid[], p_kind text, p_title text, p_body text, p_url text default '', p_tag text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_bladers is null or cardinality(p_bladers) = 0 then return; end if;
  if not exists (select 1 from push_subscriptions where blader_id = any(p_bladers) and coalesce((prefs ->> p_kind)::boolean, true)) then return; end if;
  -- niente doppioni: stesso messaggio alle stesse persone negli ultimi 2 minuti
  if p_tag is not null and exists (select 1 from push_queue where tag = p_tag and kind = p_kind and blader_ids = p_bladers
                                   and created_at > now() - interval '2 minutes') then return; end if;
  insert into push_queue (blader_ids, kind, title, body, url, tag) values (p_bladers, p_kind, p_title, p_body, coalesce(p_url, ''), p_tag);
end $$;

-- ogni messaggio accodato sveglia la funzione "push" (chiamata web dal database, protetta da un codice segreto)
create or replace function push_wake() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare c push_config;
begin
  select * into c from push_config where id = 1;
  perform net.http_post(url := c.function_url, body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-hook-secret', c.hook_secret));
  return null;
exception when others then
  return null;   -- una notifica non riuscita non deve mai bloccare dichiarazioni o approvazioni
end $$;
drop trigger if exists trg_push_wake on push_queue;
create trigger trg_push_wake after insert on push_queue for each row execute function push_wake();

create or replace function _nick(p uuid) returns text language sql stable security definer set search_path = public as
$$ select nickname from bladers where id = p $$;
create or replace function _team_admins(p_team uuid) returns uuid[] language sql stable security definer set search_path = public as
$$ select coalesce(array_agg(blader_id), '{}') from team_members where team_id = p_team and role = 'admin' and status = 'active' $$;
create or replace function _team_members(p_team uuid) returns uuid[] language sql stable security definer set search_path = public as
$$ select coalesce(array_agg(blader_id), '{}') from team_members where team_id = p_team and status = 'active' $$;

-- taglie: dichiarazione, conferma, rifiuto
create or replace function push_on_claim() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.status = 'pending' then
    perform push_enqueue(_team_admins(new.team_id), 'admin', 'Vittoria da approvare',
      _nick(new.hunter_id) || ' dichiara di aver battuto ' || _nick(new.target_id) || ' (' || new.value_snapshot || ' pt)', '#admin', 'claim-' || new.id);
    if new.target_id = any(_team_members(new.team_id)) then
      perform push_enqueue(array[new.target_id], 'mine', 'Taglia su di te',
        _nick(new.hunter_id) || ' dichiara di averti battuto', '#taglie', 'claim-' || new.id);
    end if;
  elsif new.status = 'approved' and (tg_op = 'INSERT' or old.status is distinct from 'approved') then
    perform push_enqueue(array[new.hunter_id], 'mine', 'Taglia riscossa! +' || new.value_snapshot || ' pt',
      'La tua vittoria su ' || _nick(new.target_id) || ' è stata confermata', '#taglie', 'claim-' || new.id);
  elsif tg_op = 'UPDATE' and new.status = 'rejected' and old.status = 'pending' then
    perform push_enqueue(array[new.hunter_id], 'mine', 'Vittoria non confermata',
      'La dichiarazione su ' || _nick(new.target_id) || ' è stata rifiutata da un admin', '#taglie', 'claim-' || new.id);
  end if;
  return null;
end $$;
drop trigger if exists trg_push_claim on claims;
create trigger trg_push_claim after insert or update of status on claims for each row execute function push_on_claim();

-- ranked: risultato inviato, confermato, rifiutato
create or replace function push_on_entry() returns trigger
language plpgsql security definer set search_path = public as $$
declare t text;
begin
  select name into t from tournaments where id = new.tournament_id;
  if new.status = 'pending' and (tg_op = 'INSERT' or old.status is distinct from 'pending' or old.phase is distinct from new.phase) then
    perform push_enqueue(_team_admins(new.team_id), 'admin', 'Risultato ranked da confermare',
      _nick(new.blader_id) || ' · ' || coalesce(t, 'ranked') || ' · ' || new.total_pts || ' pt', '#admin', 'entry-' || new.id);
  elsif tg_op = 'UPDATE' and new.status = 'approved' and old.status is distinct from 'approved' then
    perform push_enqueue(array[new.blader_id], 'mine', 'Risultato confermato +' || new.total_pts || ' pt',
      coalesce(t, 'Ranked') || ': i punti sono in classifica', '#ranked', 'entry-' || new.id);
  elsif tg_op = 'UPDATE' and new.status = 'rejected' and old.status = 'pending' then
    perform push_enqueue(array[new.blader_id], 'mine', 'Risultato non confermato',
      coalesce(t, 'Ranked') || ': puoi reinserirlo', '#ranked', 'entry-' || new.id);
  end if;
  return null;
end $$;
drop trigger if exists trg_push_entry on tournament_entries;
create trigger trg_push_entry after insert or update of status, phase on tournament_entries for each row execute function push_on_entry();

-- richieste di ingresso nel team
create or replace function push_on_join() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform push_enqueue(_team_admins(new.team_id), 'admin', 'Nuova richiesta di ingresso', new.nickname || ' vuole entrare nel team', '#admin', 'join-' || new.id);
  return null;
end $$;
drop trigger if exists trg_push_join on join_requests;
create trigger trg_push_join after insert on join_requests for each row execute function push_on_join();

-- nuove ranked in calendario (quelle ufficiali a tutti i team, quelle aggiunte a mano solo a quel team)
create or replace function push_on_tournament() returns trigger
language plpgsql security definer set search_path = public as $$
declare who uuid[];
begin
  if new.starts_at <= now() then return null; end if;
  if new.created_by_team is null then
    select coalesce(array_agg(distinct blader_id), '{}') into who from team_members where status = 'active';
  else
    who := _team_members(new.created_by_team);
  end if;
  perform push_enqueue(who, 'ranked', 'Nuova ranked: ' || new.name,
    to_char(new.starts_at at time zone 'Europe/Rome', 'DD/MM HH24:MI') || coalesce(' · ' || new.city, '') || ' · segna se partecipi', '#ranked', 'tour-' || new.id);
  return null;
end $$;
drop trigger if exists trg_push_tournament on tournaments;
create trigger trg_push_tournament after insert on tournaments for each row execute function push_on_tournament();

-- sorpassi in classifica: chi aveva tra i vecchi e i nuovi punti di chi ha guadagnato viene avvisato
create or replace function push_on_points() returns trigger
language plpgsql security definer set search_path = public as $$
declare tot int; old_tot int; r record;
begin
  if new.points <= 0 then return null; end if;
  select coalesce(sum(points), 0) into tot from points_ledger where team_id = new.team_id and season_id = new.season_id and blader_id = new.blader_id;
  old_tot := tot - new.points;
  for r in
    select l.blader_id, sum(l.points) s from points_ledger l
    where l.team_id = new.team_id and l.season_id = new.season_id and l.blader_id <> new.blader_id
      and l.blader_id = any(_team_members(new.team_id))
    group by l.blader_id having sum(l.points) >= old_tot and sum(l.points) < tot and sum(l.points) > 0
  loop
    perform push_enqueue(array[r.blader_id], 'overtake', _nick(new.blader_id) || ' ti ha superato',
      'Ora ha ' || tot || ' punti, tu ' || r.s || '. Tocca a te!', '', 'overtake-' || r.blader_id);
  end loop;
  return null;
end $$;
drop trigger if exists trg_push_points on points_ledger;
create trigger trg_push_points after insert on points_ledger for each row execute function push_on_points();

-- prova dal profilo: una notifica a se stessi (massimo una ogni 2 minuti)
create or replace function push_test() returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := current_blader_id();
begin
  if me is null then raise exception 'Non autenticato'; end if;
  perform push_enqueue(array[me], 'mine', 'Notifiche attive', 'Da adesso Fox Point ti avvisa qui. Puoi scegliere quali avvisi ricevere dal profilo.', '#profilo', 'test-' || me);
end $$;

-- le funzioni interne non si possono chiamare dall'app (altrimenti chiunque potrebbe mandare notifiche a chiunque)
revoke execute on function push_enqueue(uuid[], text, text, text, text, text) from public, anon, authenticated;
revoke execute on function _nick(uuid), _team_admins(uuid), _team_members(uuid) from public, anon, authenticated;
revoke execute on function push_wake(), push_on_claim(), push_on_entry(), push_on_join(), push_on_tournament(), push_on_points() from public, anon, authenticated;
grant execute on function push_public_key(), push_test() to authenticated;

-- controllo
select 'Notifiche pronte' as stato,
  (select count(*) from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public') as tabelle_in_tempo_reale,
  (select public_key is not null from push_config) as funzione_push_avviata;
