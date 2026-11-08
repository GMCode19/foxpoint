-- FOX POINT - 06 UNIONE PROFILO DOPPIO DI NIKKK
-- Sposta account, vittorie, punti, ranked e iscrizioni dal profilo doppio al profilo originale "Nikkk",
-- poi elimina il doppione. È tutto o niente: se qualcosa non torna, non viene modificato nulla.
-- Si può rilanciare: se non trova più doppioni si ferma con un messaggio.

-- ============ PASSO 1 - controllo (solo lettura) ============
-- Mostra i profili del team con un nome simile a "Nikkk" e cosa contengono.
select b.nickname,
       b.user_id is not null                                                 as ha_account,
       tm.role, tm.status,
       (select count(*) from claims c where c.hunter_id = b.id)             as vittorie_dichiarate,
       (select count(*) from tournament_entries e where e.blader_id = b.id) as ranked,
       (select coalesce(sum(points), 0) from points_ledger l where l.blader_id = b.id) as punti
from bladers b
join team_members tm on tm.blader_id = b.id
where b.nickname ilike '%nik%'
order by b.created_at;

-- ============ PASSO 2 - unione ============
do $$
declare
  keep bladers;
  dup  bladers;
  n    int;
  st   constant text[] := array['registered','rejected','revoked','pending','approved']; -- dal meno al più importante
begin
  select * into keep from bladers where nickname = 'Nikkk';
  if keep.id is null then raise exception 'Profilo originale "Nikkk" non trovato'; end if;

  select count(distinct b.id) into n
  from bladers b join team_members tm on tm.blader_id = b.id
  where b.nickname ilike '%nik%' and b.id <> keep.id;
  if n = 0 then raise exception 'Nessun profilo doppio trovato: è già tutto unito, oppure il doppione ha un nome diverso (mandami il risultato del passo 1)'; end if;
  if n > 1 then raise exception 'Trovati % possibili doppioni: mandami il risultato del passo 1 prima di procedere', n; end if;

  select b.* into dup
  from bladers b join team_members tm on tm.blader_id = b.id
  where b.nickname ilike '%nik%' and b.id <> keep.id limit 1;

  if keep.user_id is not null and dup.user_id is not null then
    raise exception 'Entrambi i profili hanno un account collegato: serve un controllo a mano';
  end if;

  -- 1) account di accesso
  if dup.user_id is not null then
    update bladers set user_id = null where id = dup.id;
    update bladers set user_id = dup.user_id where id = keep.id;
  end if;

  -- 2) taglie: evita due dichiarazioni in attesa sulla stessa taglia, poi sposta tutto
  update claims d set status = 'rejected', note = coalesce(d.note, 'Doppione rimosso durante l''unione dei profili')
  where d.hunter_id = dup.id and d.status = 'pending'
    and exists (select 1 from claims k where k.hunter_id = keep.id and k.bounty_id = d.bounty_id and k.status = 'pending');
  update claims set hunter_id  = keep.id where hunter_id  = dup.id;
  update claims set target_id  = keep.id where target_id  = dup.id;
  update claims set decided_by = keep.id where decided_by = dup.id;

  -- 3) ranked: se entrambi hanno una riga sullo stesso torneo, resta la più importante
  --    (confermata > in attesa > altre > solo iscrizione; a parità, quella con più punti);
  --    i punti di quella eliminata vengono tolti
  delete from points_ledger l using tournament_entries x, tournament_entries y
  where l.source = 'ranked' and l.ref_id = x.id
    and x.blader_id in (keep.id, dup.id) and y.blader_id in (keep.id, dup.id) and x.blader_id <> y.blader_id
    and x.team_id = y.team_id and x.tournament_id = y.tournament_id
    and (array_position(st, x.status) < array_position(st, y.status)
         or (x.status = y.status and (coalesce(x.total_pts, 0) < coalesce(y.total_pts, 0)
             or (coalesce(x.total_pts, 0) = coalesce(y.total_pts, 0) and x.blader_id = dup.id))));
  delete from tournament_entries x using tournament_entries y
  where x.blader_id in (keep.id, dup.id) and y.blader_id in (keep.id, dup.id) and x.blader_id <> y.blader_id
    and x.team_id = y.team_id and x.tournament_id = y.tournament_id
    and (array_position(st, x.status) < array_position(st, y.status)
         or (x.status = y.status and (coalesce(x.total_pts, 0) < coalesce(y.total_pts, 0)
             or (coalesce(x.total_pts, 0) = coalesce(y.total_pts, 0) and x.blader_id = dup.id))));
  update tournament_entries set blader_id  = keep.id where blader_id  = dup.id;
  update tournament_entries set decided_by = keep.id where decided_by = dup.id;

  -- 4) registro punti e decisioni sulle richieste
  update points_ledger set blader_id  = keep.id where blader_id  = dup.id;
  update join_requests set decided_by = keep.id where decided_by = dup.id;

  -- 5) appartenenza al team: l'originale prende il ruolo più alto e diventa attivo
  insert into team_members (team_id, blader_id, role, status)
  select team_id, keep.id, role, status from team_members where blader_id = dup.id
  on conflict (team_id, blader_id) do update set
    status = 'active',
    role   = case when excluded.role = 'admin' or team_members.role = 'admin' then 'admin' else 'player' end;
  delete from team_members where blader_id = dup.id;

  -- 6) elimina il doppione
  delete from bladers where id = dup.id;

  raise notice 'Fatto: il profilo "%" è stato unito in "Nikkk"', dup.nickname;
end $$;

-- ============ CONTROLLO FINALE ============
-- Deve comparire una sola riga "Nikkk", con ha_account = true
select b.nickname, b.user_id is not null as ha_account, tm.role, tm.status,
       (select coalesce(sum(points), 0) from points_ledger l where l.blader_id = b.id) as punti
from bladers b join team_members tm on tm.blader_id = b.id
where b.nickname ilike '%nik%';
