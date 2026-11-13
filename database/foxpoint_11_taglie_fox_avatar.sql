-- FOX POINT - 11 TAGLIE TRA FOX BLADER, REGOLE DELLE TAGLIE, FOTO PROFILO
-- Si può eseguire più volte senza problemi.
--
-- Regole (valgono per TUTTE le taglie):
--  - una vittoria vale solo se ottenuta in una RANKED: nella dichiarazione si sceglie la ranked
--  - una settimana di pausa: se riscuoti su qualcuno in una settimana (lun-dom), sulla stessa persona
--    puoi riscuotere di nuovo solo dalla seconda settimana successiva
-- Taglie tra Fox Blader (categoria 'fox'), automatiche per ogni membro del team:
--  - valore in base alla posizione Fox Point di chi viene battuto: 1° 60, 2° 50, 3° 40, 4°-5° 30, poi 20
--  - chi perde perde metà del valore (mai sotto zero); vale anche per un membro con taglia Top 10 PBI
--  - conferma lo SCONFITTO; se dice "non è vero" decide un admin (che non deve essere coinvolto);
--    se lo sconfitto non risponde entro 3 giorni può decidere un admin
--  - gli admin possono sempre revocare dopo (controllo)

-- ============ STRUTTURA ============
alter table bounties drop constraint if exists bounties_category_check;
alter table bounties add constraint bounties_category_check check (category in ('top10','rilevante','capo','fox'));

alter table claims add column if not exists tournament_id uuid references tournaments(id) on delete set null;
alter table claims add column if not exists penalty_snapshot int not null default 0;
alter table claims drop constraint if exists claims_status_check;
alter table claims add constraint claims_status_check check (status in ('pending','disputed','approved','rejected','revoked'));
create index if not exists idx_claims_pair on claims (hunter_id, target_id);

alter table points_ledger drop constraint if exists points_ledger_source_check;
alter table points_ledger add constraint points_ledger_source_check check (source in ('bounty','ranked','bonus','manual','penalty'));

-- un solo "in attesa / contestata" per taglia e cacciatore
drop index if exists one_pending_claim;
create unique index one_pending_claim on claims (bounty_id, hunter_id) where status in ('pending','disputed');

-- ============ VALORE DELLE TAGLIE FOX ============
create or replace function fox_value(p_rank int) returns int language sql immutable as $$
  select case when p_rank = 1 then 60 when p_rank = 2 then 50 when p_rank = 3 then 40 when p_rank in (4, 5) then 30 else 20 end $$;

-- posizione Fox Point di un membro nella stagione attiva (pari merito = stessa posizione)
create or replace function fox_rank(p_team uuid, p_blader uuid) returns int
language sql stable security definer set search_path = public as $$
  with tot as (
    select tm.blader_id, coalesce(sum(l.points), 0) s
    from team_members tm
    join seasons se on se.team_id = tm.team_id and se.is_active
    left join points_ledger l on l.blader_id = tm.blader_id and l.season_id = se.id
    where tm.team_id = p_team and tm.status = 'active'
    group by tm.blader_id)
  select r from (select blader_id, rank() over (order by s desc)::int r from tot) x where blader_id = p_blader $$;

-- crea / aggiorna le taglie fox del team: una per membro, valore secondo la posizione
create or replace function fox_sync(p_team uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_season uuid; m record;
begin
  select id into v_season from seasons where team_id = p_team and is_active;
  if v_season is null then return; end if;
  for m in
    with tot as (
      select tm.blader_id, coalesce(sum(l.points), 0) s
      from team_members tm left join points_ledger l on l.blader_id = tm.blader_id and l.season_id = v_season
      where tm.team_id = p_team and tm.status = 'active' group by tm.blader_id)
    select blader_id, fox_value(rank() over (order by s desc)::int) v from tot
  loop
    insert into bounties (team_id, season_id, target_id, value, active, category)
    values (p_team, v_season, m.blader_id, m.v, true, 'fox')
    on conflict (season_id, target_id) do nothing;
    update bounties set value = m.v where season_id = v_season and target_id = m.blader_id and category = 'fox' and value <> m.v;
    -- membro con taglia Top 10 PBI: quando esce dalla top 10 la sua taglia torna "fox"
    update bounties set prev_category = 'fox', prev_value = m.v
      where season_id = v_season and target_id = m.blader_id and category = 'top10' and prev_category is distinct from 'fox';
  end loop;
  -- chi non è più membro: niente taglia fox attiva
  update bounties b set active = false
   where b.season_id = v_season and b.category = 'fox' and b.active
     and not exists (select 1 from team_members tm where tm.team_id = p_team and tm.blader_id = b.target_id and tm.status = 'active');
end $$;

-- i valori seguono la classifica: dopo ogni movimento di punti e ogni cambio di membri
create or replace function fox_sync_ledger() returns trigger
language plpgsql security definer set search_path = public as $$
declare t uuid;
begin
  if tg_op = 'DELETE' then for t in select distinct team_id from old_rows loop perform fox_sync(t); end loop;
  else for t in select distinct team_id from new_rows loop perform fox_sync(t); end loop; end if;
  return null;
end $$;
drop trigger if exists trg_fox_ledger_ins on points_ledger;
drop trigger if exists trg_fox_ledger_del on points_ledger;
create trigger trg_fox_ledger_ins after insert on points_ledger referencing new table as new_rows for each statement execute function fox_sync_ledger();
create trigger trg_fox_ledger_del after delete on points_ledger referencing old table as old_rows for each statement execute function fox_sync_ledger();

create or replace function fox_sync_member() returns trigger
language plpgsql security definer set search_path = public as $$
begin perform fox_sync(coalesce(new.team_id, old.team_id)); return null; end $$;
drop trigger if exists trg_fox_member on team_members;
create trigger trg_fox_member after insert or update of status or delete on team_members for each row execute function fox_sync_member();

-- ============ DICHIARAZIONE ============
create or replace function claims_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare b bounties; t tournaments; w date; r int;
begin
  select * into b from bounties where id = new.bounty_id and active;
  if not found then raise exception 'Taglia non attiva'; end if;
  if not exists (select 1 from team_members where team_id = b.team_id and blader_id = new.hunter_id and status = 'active') then
    raise exception 'Il cacciatore non è un membro del team';
  end if;
  if new.hunter_id = b.target_id then raise exception 'Non puoi riscuotere la taglia su te stesso'; end if;
  if exists (select 1 from claims where bounty_id = new.bounty_id and hunter_id = new.hunter_id and status in ('pending','disputed')) then
    raise exception 'C''è già una dichiarazione in attesa per questa taglia';
  end if;
  -- solo nelle ranked
  select * into t from tournaments where id = new.tournament_id;
  if not found then raise exception 'Scegli la ranked in cui hai ottenuto la vittoria'; end if;
  if t.starts_at > now() + interval '1 day' then raise exception 'Quella ranked non è ancora iniziata'; end if;
  if t.starts_at < now() - interval '30 days' then raise exception 'Quella ranked è di più di 30 giorni fa: chiedi a un admin'; end if;
  -- una settimana di pausa sulla stessa persona
  w := date_trunc('week', t.starts_at at time zone 'Europe/Rome')::date;
  if exists (
    select 1 from claims c2 left join tournaments t2 on t2.id = c2.tournament_id
     where c2.hunter_id = new.hunter_id and c2.target_id = b.target_id and c2.status in ('pending','disputed','approved')
       and abs(date_trunc('week', coalesce(t2.starts_at at time zone 'Europe/Rome', c2.played_on::timestamp))::date - w) <= 7) then
    raise exception 'Su questo giocatore hai già riscosso nella stessa settimana o in quella vicina: si salta una settimana';
  end if;
  new.team_id        := b.team_id;
  new.season_id      := b.season_id;
  new.target_id      := b.target_id;
  new.value_snapshot := b.value;
  new.played_on      := (t.starts_at at time zone 'Europe/Rome')::date;
  -- penalità per chi perde, se è un membro del team: metà del valore fox della sua posizione
  r := case when exists (select 1 from team_members where team_id = b.team_id and blader_id = b.target_id and status = 'active')
            then fox_rank(b.team_id, b.target_id) end;
  new.penalty_snapshot := coalesce(fox_value(r) / 2, 0) * (r is not null)::int;
  new.status         := 'pending';
  new.decided_by     := null;
  new.decided_at     := null;
  return new;
end $$;

-- ============ CONFERMA ============
-- assegna i punti: + al cacciatore, - allo sconfitto (mai sotto zero)
create or replace function _approve_claim(p_claim uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c claims; tot int; pen int;
begin
  select * into c from claims where id = p_claim for update;
  update claims set status = 'approved', decided_by = current_blader_id(), decided_at = now() where id = p_claim;
  insert into points_ledger (team_id, season_id, blader_id, points, source, ref_id, note)
  values (c.team_id, c.season_id, c.hunter_id, c.value_snapshot, 'bounty', c.id, 'Taglia riscossa');
  if c.penalty_snapshot > 0 then
    select coalesce(sum(points), 0) into tot from points_ledger where team_id = c.team_id and season_id = c.season_id and blader_id = c.target_id;
    pen := least(c.penalty_snapshot, greatest(tot, 0));
    if pen > 0 then
      insert into points_ledger (team_id, season_id, blader_id, points, source, ref_id, note)
      values (c.team_id, c.season_id, c.target_id, -pen, 'penalty', c.id, 'Taglia subita');
    end if;
  end if;
end $$;

-- lo sconfitto conferma ("sì, mi ha battuto") o contesta ("non è vero": decide un admin)
create or replace function respond_claim(p_claim uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
declare c claims;
begin
  select * into c from claims where id = p_claim and status = 'pending' for update;
  if not found then raise exception 'Dichiarazione non trovata o già decisa'; end if;
  if c.target_id is distinct from current_blader_id() then raise exception 'Può rispondere solo chi è stato battuto'; end if;
  if p_accept then perform _approve_claim(p_claim);
  else update claims set status = 'disputed' where id = p_claim; end if;
end $$;

-- admin: decide le taglie su giocatori esterni, le contestate e quelle senza risposta da 3 giorni
create or replace function decide_claim(p_claim uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = public as $$
declare c claims; me uuid := current_blader_id(); member boolean;
begin
  select * into c from claims where id = p_claim and status in ('pending','disputed') for update;
  if not found then raise exception 'Dichiarazione non trovata o già decisa'; end if;
  if not is_team_admin(c.team_id) then raise exception 'Solo admin del team'; end if;
  if me in (c.hunter_id, c.target_id) then raise exception 'Sei coinvolto in questa vittoria: deve decidere un altro admin'; end if;
  member := exists (select 1 from team_members where team_id = c.team_id and blader_id = c.target_id and status = 'active');
  if member and c.status = 'pending' and c.created_at > now() - interval '3 days' then
    raise exception 'Deve prima rispondere chi è stato battuto (oppure aspetta 3 giorni)';
  end if;
  if p_approve then perform _approve_claim(p_claim);
  else update claims set status = 'rejected', decided_by = me, decided_at = now() where id = p_claim; end if;
end $$;

-- admin: registra direttamente una vittoria (approvata subito), sempre indicando la ranked
drop function if exists admin_register_claim(uuid, uuid, date);
create or replace function admin_register_claim(p_bounty uuid, p_hunter uuid, p_tournament uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare new_id uuid; v_team uuid; v_target uuid;
begin
  select team_id, target_id into v_team, v_target from bounties where id = p_bounty;
  if v_team is null or not is_team_admin(v_team) then raise exception 'Solo admin del team'; end if;
  if current_blader_id() in (p_hunter, v_target) then raise exception 'Sei coinvolto in questa vittoria: deve registrarla un altro admin'; end if;
  insert into claims (bounty_id, hunter_id, tournament_id) values (p_bounty, p_hunter, p_tournament) returning id into new_id;
  perform _approve_claim(new_id);
  return new_id;
end $$;

-- admin: revoca (controllo successivo) -> tolti sia i punti del cacciatore sia la penalità dello sconfitto
create or replace function revoke_claim(p_claim uuid, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare c claims;
begin
  select * into c from claims where id = p_claim for update;
  if not found then raise exception 'Riscossione non trovata'; end if;
  if not is_team_admin(c.team_id) then raise exception 'Solo admin del team'; end if;
  if c.status <> 'approved' then raise exception 'Si può revocare solo una riscossione approvata'; end if;
  delete from points_ledger where source in ('bounty','penalty') and ref_id = c.id;
  update claims set status = 'revoked', decided_by = current_blader_id(), decided_at = now(),
         note = coalesce(nullif(trim(p_note), ''), note) where id = p_claim;
end $$;

revoke execute on function _approve_claim(uuid), fox_sync(uuid) from public, anon, authenticated;
grant execute on function respond_claim(uuid, boolean), decide_claim(uuid, boolean), admin_register_claim(uuid, uuid, uuid), revoke_claim(uuid, text) to authenticated;

-- classifica: anche i punti persi con le taglie subite
create or replace view leaderboard with (security_invoker = true) as
select tm.team_id, s.id as season_id, b.id as blader_id, b.nickname,
       coalesce(sum(l.points),0) as fox_points,
       coalesce(sum(l.points) filter (where l.source = 'bounty'),0) as bounty_points,
       coalesce(sum(l.points) filter (where l.source = 'ranked'),0) as ranked_points,
       coalesce(sum(l.points) filter (where l.source = 'penalty'),0) as penalty_points
from team_members tm
join bladers b on b.id = tm.blader_id
join seasons s on s.team_id = tm.team_id and s.is_active
left join points_ledger l on l.blader_id = b.id and l.season_id = s.id
where tm.status = 'active'
group by tm.team_id, s.id, b.id, b.nickname;

-- ============ NOTIFICHE (se lo script 09 è stato eseguito) ============
do $do$
begin
  if to_regprocedure('push_enqueue(uuid[],text,text,text,text,text)') is null then return; end if;
  execute $f$
  create or replace function push_on_claim() returns trigger
  language plpgsql security definer set search_path = public as $$
  declare tn text; member boolean;
  begin
    select name into tn from tournaments where id = new.tournament_id;
    member := new.target_id = any(_team_members(new.team_id));
    if tg_op = 'INSERT' and new.status = 'pending' then
      if member then
        perform push_enqueue(array[new.target_id], 'mine', 'Taglia su di te: confermi?',
          _nick(new.hunter_id) || ' dichiara di averti battuto' || coalesce(' alla ' || tn, '') || '. Se confermi perdi ' || new.penalty_snapshot || ' pt', '#taglie', 'claim-' || new.id);
      else
        perform push_enqueue(_team_admins(new.team_id), 'admin', 'Vittoria da approvare',
          _nick(new.hunter_id) || ' dichiara di aver battuto ' || _nick(new.target_id) || coalesce(' alla ' || tn, '') || ' (' || new.value_snapshot || ' pt)', '#admin', 'claim-' || new.id);
      end if;
    elsif tg_op = 'UPDATE' and new.status = 'disputed' and old.status = 'pending' then
      perform push_enqueue(_team_admins(new.team_id), 'admin', 'Vittoria contestata',
        _nick(new.target_id) || ' dice di non essere stato battuto da ' || _nick(new.hunter_id) || coalesce(' alla ' || tn, ''), '#admin', 'claim-' || new.id);
    elsif new.status = 'approved' and (tg_op = 'INSERT' or old.status is distinct from 'approved') then
      perform push_enqueue(array[new.hunter_id], 'mine', 'Taglia riscossa! +' || new.value_snapshot || ' pt',
        'La tua vittoria su ' || _nick(new.target_id) || ' è stata confermata', '#taglie', 'claim-' || new.id);
    elsif tg_op = 'UPDATE' and new.status = 'rejected' and old.status in ('pending','disputed') then
      perform push_enqueue(array[new.hunter_id], 'mine', 'Vittoria non confermata',
        'La dichiarazione su ' || _nick(new.target_id) || ' è stata rifiutata', '#taglie', 'claim-' || new.id);
    end if;
    return null;
  end $$;
  $f$;
  execute 'revoke execute on function push_on_claim() from public, anon, authenticated';
end $do$;

-- ============ FOTO PROFILO ============
-- visibili a tutti gli iscritti all'app; ognuno carica e toglie solo la propria
alter table bladers add column if not exists avatar_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatar', 'avatar', false, 262144, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create or replace function set_avatar(p_path text) returns text
language plpgsql security definer set search_path = public as $$
declare me uuid := current_blader_id(); old text;
begin
  if me is null then raise exception 'Non autenticato'; end if;
  if p_path is not null and (split_part(p_path, '/', 1) <> me::text or p_path !~ '^[0-9a-f-]+/[0-9]+\.(webp|jpg|png)$') then
    raise exception 'Percorso della foto non valido';
  end if;
  select avatar_path into old from bladers where id = me;
  update bladers set avatar_path = p_path where id = me;
  return old;
end $$;
grant execute on function set_avatar(text) to authenticated;

drop policy if exists "avatar lettura" on storage.objects;
drop policy if exists "avatar caricamento" on storage.objects;
drop policy if exists "avatar eliminazione" on storage.objects;
create policy "avatar lettura" on storage.objects for select to authenticated using (bucket_id = 'avatar');
create policy "avatar caricamento" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatar' and (storage.foldername(name))[1] = current_blader_id()::text);
create policy "avatar eliminazione" on storage.objects for delete to authenticated
  using (bucket_id = 'avatar' and (storage.foldername(name))[1] = current_blader_id()::text);

-- ============ AVVIO ============
do $$ declare t uuid; begin for t in select team_id from seasons where is_active loop perform fox_sync(t); end loop; end $$;

select bl.nickname, b.category, b.value as taglia, b.active as attiva
from bounties b join bladers bl on bl.id = b.target_id join seasons s on s.id = b.season_id and s.is_active
where b.target_id in (select blader_id from team_members where status = 'active')
order by b.value desc, bl.nickname;
