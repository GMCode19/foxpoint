-- ============================================================
-- Fox Point · 14 · Album collezionabile
-- Da eseguire nell'SQL Editor di Supabase dopo lo script 13. Si può rieseguire senza danni.
-- (Supabase avviserà di "operazioni distruttive": riguardano solo funzioni e trigger che vengono ricreati.)
--
-- Rarità della carta (vale la più alta tra quelle che spettano; si fissa alla dichiarazione della vittoria):
--   Mitica       persone speciali (bladers.special_rarity) e 1°–3° PBI
--   Leggendaria  4°–10° PBI, Superstar, Fox Blader 1°
--   Epica        Team leader, Blader rilevanti fino al 30° PBI, Fox Blader 2°–3°
--   Rara         Blader rilevanti oltre il 30° o senza posizione PBI, Fox Blader dal 4° o a 0 punti
-- I Fox Blader usano solo la classifica Fox Point (e l'eventuale rarità speciale).
-- ============================================================

-- 1) Dati nuovi
alter table bladers add column if not exists special_rarity text;
alter table bladers drop constraint if exists bladers_special_rarity_check;
alter table bladers add constraint bladers_special_rarity_check check (special_rarity in ('mitica','leggendaria','epica','rara'));
update bladers set special_rarity = 'mitica'
 where (nickname = 'Samuryan' or pbi_nickname = 'BelthazorHell') and special_rarity is distinct from 'mitica';

alter table claims add column if not exists card_rarity text;
alter table claims drop constraint if exists claims_card_rarity_check;
alter table claims add constraint claims_card_rarity_check check (card_rarity in ('mitica','leggendaria','epica','rara'));
alter table claims add column if not exists card_seen_at timestamptz;
create index if not exists claims_album_idx on claims (hunter_id) where status = 'approved';

create table if not exists album_achievements (
  blader_id uuid not null references bladers(id) on delete cascade,
  key text not null,
  unlocked_at timestamptz not null default now(),
  primary key (blader_id, key)
);
alter table album_achievements enable row level security;
drop policy if exists "album traguardi lettura" on album_achievements;
create policy "album traguardi lettura" on album_achievements for select to authenticated
  using (blader_id in (select tm.blader_id from team_members tm where tm.team_id in (select my_team_ids())));

-- 2) Calcolo della rarità
create or replace function _rarity_rank(r text) returns int language sql immutable as $$
  select coalesce(array_position(array['rara','epica','leggendaria','mitica'], r), 0) $$;

create or replace function card_rarity_of(p_team uuid, p_category text, p_target uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare rk int; sp text; best text := 'rara'; cand text; pos int; pts int;
begin
  select pro_rank, special_rarity into rk, sp from bladers where id = p_target;
  if p_category = 'fox' then
    with tot as (
      select tm.blader_id, coalesce(sum(l.points), 0)::int s
      from team_members tm
      join seasons se on se.team_id = tm.team_id and se.is_active
      left join points_ledger l on l.blader_id = tm.blader_id and l.season_id = se.id
      where tm.team_id = p_team and tm.status = 'active'
      group by tm.blader_id)
    select r, s into pos, pts from (select blader_id, s, rank() over (order by s desc)::int r from tot) x where blader_id = p_target;
    best := case when coalesce(pts, 0) <= 0 then 'rara' when pos = 1 then 'leggendaria' when pos <= 3 then 'epica' else 'rara' end;
  else
    cand := case when rk between 1 and 3 then 'mitica' when rk between 4 and 10 then 'leggendaria' else 'rara' end;
    if _rarity_rank(cand) > _rarity_rank(best) then best := cand; end if;
    cand := case p_category when 'superstar' then 'leggendaria' when 'capo' then 'epica'
                 else case when rk between 1 and 30 then 'epica' else 'rara' end end;
    if _rarity_rank(cand) > _rarity_rank(best) then best := cand; end if;
  end if;
  if sp is not null and _rarity_rank(sp) > _rarity_rank(best) then best := sp; end if;
  return best;
end $$;

-- la rarità si fissa quando si dichiara la vittoria (nome scelto perché parta dopo trg_claims_before_insert, che completa la riga)
create or replace function claims_card_rarity() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.card_rarity is null then
    new.card_rarity := card_rarity_of(new.team_id, (select category from bounties where id = new.bounty_id), new.target_id);
  end if;
  return new;
end $$;
drop trigger if exists claims_zcard_rarity on claims;
drop trigger if exists trg_claims_zcard_rarity on claims;
create trigger trg_claims_zcard_rarity before insert on claims for each row execute function claims_card_rarity();

-- 3) Traguardi dell'album (una volta ottenuti restano; spariscono solo se un admin revoca la taglia che li aveva dati)
create or replace function album_sync(p_hunter uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_team uuid; v_season uuid; n int; k text; cat text; tot int; missing int;
begin
  select tm.team_id into v_team from team_members tm where tm.blader_id = p_hunter and tm.status = 'active' limit 1;
  if v_team is null then return; end if;
  select id into v_season from seasons where team_id = v_team and is_active;

  select count(distinct target_id) into n from claims where hunter_id = p_hunter and status = 'approved';
  if n >= 1 then insert into album_achievements (blader_id, key) values (p_hunter, 'first') on conflict do nothing; end if;
  if n >= 10 then insert into album_achievements (blader_id, key) values (p_hunter, 'coll10') on conflict do nothing; end if;
  if n >= 25 then insert into album_achievements (blader_id, key) values (p_hunter, 'coll25') on conflict do nothing; end if;
  if n >= 50 then insert into album_achievements (blader_id, key) values (p_hunter, 'coll50') on conflict do nothing; end if;

  if exists (select 1 from claims where hunter_id = p_hunter and status = 'approved' and card_rarity = 'mitica') then
    insert into album_achievements (blader_id, key) values (p_hunter, 'mythic') on conflict do nothing;
  end if;
  if exists (select 1 from claims where hunter_id = p_hunter and status = 'approved' group by target_id having count(*) >= 2) then
    insert into album_achievements (blader_id, key) values (p_hunter, 'rivincita') on conflict do nothing;
  end if;
  if exists (select 1 from claims where hunter_id = p_hunter and status = 'approved' group by target_id having count(distinct card_rarity) >= 3) then
    insert into album_achievements (blader_id, key) values (p_hunter, 'espansioni') on conflict do nothing;
  end if;

  if v_season is null then return; end if;
  -- set completi: tutti i ricercati attivi di quella categoria catturati almeno una volta (te escluso)
  foreach cat in array array['top10','superstar','capo','rilevante','fox'] loop
    select count(*), count(*) filter (where not exists (
             select 1 from claims c where c.hunter_id = p_hunter and c.status = 'approved' and c.target_id = b.target_id))
      into tot, missing
      from bounties b where b.season_id = v_season and b.active and b.category = cat and b.target_id <> p_hunter;
    if tot > 0 and missing = 0 then
      insert into album_achievements (blader_id, key) values (p_hunter, 'set_' || cat) on conflict do nothing;
    end if;
  end loop;
  -- Pantheon: una carta mitica di ognuno dei mitici di oggi
  select count(*), count(*) filter (where not exists (
           select 1 from claims c where c.hunter_id = p_hunter and c.status = 'approved' and c.target_id = b.target_id and c.card_rarity = 'mitica'))
    into tot, missing
    from bounties b where b.season_id = v_season and b.active and b.target_id <> p_hunter
     and card_rarity_of(v_team, b.category, b.target_id) = 'mitica';
  if tot > 0 and missing = 0 then
    insert into album_achievements (blader_id, key) values (p_hunter, 'pantheon') on conflict do nothing;
  end if;
end $$;

create or replace function claims_album() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'approved' and (tg_op = 'INSERT' or old.status is distinct from 'approved') then
    perform album_sync(new.hunter_id);
  elsif tg_op = 'UPDATE' and old.status = 'approved' and new.status <> 'approved' then
    delete from album_achievements where blader_id = new.hunter_id and unlocked_at >= coalesce(old.decided_at, old.created_at);
    perform album_sync(new.hunter_id);
  end if;
  return null;
end $$;
drop trigger if exists claims_zalbum on claims;
create trigger claims_zalbum after insert or update of status on claims for each row execute function claims_album();

-- 4) Funzioni per l'app
create or replace function album_mark_seen(p_ids uuid[]) returns void
language sql security definer set search_path = public as $$
  update claims set card_seen_at = now()
   where id = any(p_ids) and hunter_id = current_blader_id() and card_seen_at is null $$;

create or replace function album_refresh() returns void
language plpgsql security definer set search_path = public as $$
begin perform album_sync(current_blader_id()); end $$;

revoke execute on function card_rarity_of(uuid, text, uuid), album_sync(uuid), claims_card_rarity(), claims_album() from public, anon, authenticated;
revoke execute on function album_mark_seen(uuid[]), album_refresh(), _rarity_rank(text) from public, anon;
grant execute on function album_mark_seen(uuid[]), album_refresh() to authenticated;

-- 5) Notifica: alla conferma si annuncia anche la carta
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
      perform push_enqueue(array[new.hunter_id], 'mine', 'Taglia riscossa! +' || new.value_snapshot || ' pt · carta sbloccata',
        'La tua vittoria su ' || _nick(new.target_id) || ' è stata confermata. Nuova carta ' || coalesce(new.card_rarity, '') || ' nell''album', '#profilo', 'claim-' || new.id);
    elsif tg_op = 'UPDATE' and new.status = 'rejected' and old.status in ('pending','disputed') then
      perform push_enqueue(array[new.hunter_id], 'mine', 'Vittoria non confermata',
        'La dichiarazione su ' || _nick(new.target_id) || ' è stata rifiutata', '#taglie', 'claim-' || new.id);
    end if;
    return null;
  end $$;
  $f$;
  execute 'revoke execute on function push_on_claim() from public, anon, authenticated';
end $do$;

-- 6) Taglie già riscosse: le carte si sbloccano subito (rarità calcolata con la classifica di oggi)
update claims c set card_rarity = card_rarity_of(c.team_id, b.category, c.target_id)
  from bounties b where b.id = c.bounty_id and c.status = 'approved' and c.card_rarity is null;
select album_sync(h.hunter_id) from (select distinct hunter_id from claims where status = 'approved') h;

-- Riepilogo
select bl.nickname as blader, count(*) as carte,
       count(*) filter (where c.card_rarity = 'mitica') as mitiche,
       count(*) filter (where c.card_rarity = 'leggendaria') as leggendarie,
       count(*) filter (where c.card_rarity = 'epica') as epiche,
       count(*) filter (where c.card_rarity = 'rara') as rare,
       (select count(*) from album_achievements a where a.blader_id = bl.id) as traguardi
from claims c join bladers bl on bl.id = c.hunter_id
where c.status = 'approved'
group by bl.id, bl.nickname
order by carte desc;
