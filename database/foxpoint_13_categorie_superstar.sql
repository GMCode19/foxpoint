-- ============================================================
-- Fox Point · 13 · Nuove categorie (Top 10, Blader rilevanti, Team leader, Superstar, Fox Blader)
--                  e nuovi ricercati (lista del 23 novembre 2026, nomi confermati alle 19:00)
-- Da eseguire nell'SQL Editor di Supabase. Si può rieseguire senza danni,
-- anche se avevi già eseguito la versione precedente di questo script.
--
-- Nickname scritti come sulla classifica PBI del 23/11/2026, così l'aggiornamento automatico li riconosce.
-- Chi è già presente viene solo spostato di categoria (valore e attivazione restano quelli decisi dagli admin).
-- I nuovi ricevono il valore più usato nella loro categoria; se la categoria non ha ancora valori, 0 e non attivi.
-- I nomi confermati: WB_leovv (cLeoVv), Vysor90 (Vysor), MSD_KingBruce (SDLMN_kingbruce).
-- I Top 10 restano gestiti in automatico dalla classifica PBI; i Fox Blader (membri) non vengono toccati.
-- ============================================================

alter table bounties drop constraint if exists bounties_category_check;
alter table bounties add constraint bounties_category_check check (category in ('top10','rilevante','capo','superstar','fox'));

-- Samuryan = BelthazorHell: ai tornei usa Samuryan, su PBI è registrato come BelthazorHell (come Fourteenkay/Krsto14).
-- Xyber9: per ora no (forse non ha ancora fatto ranked).
-- Se la versione precedente li aveva creati come blader nuovi, vengono tolti (solo se non hanno storico).
create or replace function pg_temp.togli_se_vuoto(p_nick text) returns void language sql as $$
  delete from bounties b using bladers bl
   where b.target_id = bl.id and bl.nickname = p_nick and bl.user_id is null and bl.pbi_nickname is null
     and not exists (select 1 from claims c where c.bounty_id = b.id or c.target_id = bl.id or c.hunter_id = bl.id)
     and not exists (select 1 from points_ledger l where l.blader_id = bl.id)
     and not exists (select 1 from tournament_entries e where e.blader_id = bl.id);
  delete from bladers bl
   where bl.nickname = p_nick and bl.user_id is null and bl.pbi_nickname is null
     and not exists (select 1 from bounties b where b.target_id = bl.id)
     and not exists (select 1 from claims c where c.target_id = bl.id or c.hunter_id = bl.id or c.decided_by = bl.id)
     and not exists (select 1 from points_ledger l where l.blader_id = bl.id)
     and not exists (select 1 from tournament_entries e where e.blader_id = bl.id or e.decided_by = bl.id)
     and not exists (select 1 from team_members m where m.blader_id = bl.id);
$$;
select pg_temp.togli_se_vuoto('Xyber9');
select pg_temp.togli_se_vuoto('Samuryan') where exists (select 1 from bladers where lower(nickname) = 'belthazorhell');
update bladers set nickname = 'Samuryan', pbi_nickname = 'BelthazorHell'
 where lower(nickname) = 'belthazorhell' and not exists (select 1 from bladers where nickname = 'Samuryan');

drop table if exists pg_temp.lista, pg_temp.esito;
create temp table lista (nick text, cat text, rank int, alias text);
insert into lista values
  -- Blader rilevanti
  ('_AeS_', 'rilevante', 11, 'AeS'), ('Zenoby', 'rilevante', 13, null), ('BurstatiSenzaGloria', 'rilevante', 12, null),
  ('RC_GxDante', 'rilevante', 14, 'Rc_Dante'), ('SDM_AgeroXXXI', 'rilevante', 15, 'SDM_agero'), ('Nikaカラス', 'rilevante', 18, 'Nika'),
  ('DarkPyra', 'rilevante', 19, null), ('Frantu', 'rilevante', 26, null), ('Fragolina', 'rilevante', 34, null),
  ('DC_Cri_tical_Hit', 'rilevante', 39, 'Dc_cri_tical_hit'), ('Roshi龟', 'rilevante', 25, 'Roshi'),
  ('DC_Fisher_Gamer', 'rilevante', 46, 'Dc_fishergames'), ('DC_Croft97', 'rilevante', 55, null),
  ('WB_S3BASCO', 'rilevante', 23, 'Wb_sebasco'), ('WB_leovv', 'rilevante', 20, 'cLeoVv'), ('Disagiati', 'rilevante', 69, null),
  ('Ele01', 'rilevante', 58, null), ('MSD_KingBruce', 'rilevante', 298, 'SDLMN_kingbruce'), ('WB_BAKI', 'rilevante', 37, 'Wb_baki'),
  ('Gianlu_Z', 'rilevante', 47, 'gianluZ'), ('DC_Ernesto_Fiammata', 'rilevante', 22, 'Ernesto fiammata'),
  ('AHJIN_ItsRio', 'rilevante', 38, null), ('LanceDeeVine', 'rilevante', 147, 'Lanceedevine'), ('Zeta90', 'rilevante', 32, null),
  -- Team leader
  ('RomGattoNero', 'capo', 42, null), ('Zio_fred', 'capo', 36, null), ('DC_Danzika7', 'capo', 310, null),
  ('ImCount', 'capo', 824, null), ('MADB_ChefBobo', 'capo', 190, null), ('MADB_SirBrus22', 'capo', 101, null),
  ('AstroBonny', 'capo', 346, null), ('Vysor90', 'capo', 206, 'Vysor'), ('AHJIN_Lykanos96', 'capo', 815, null),
  ('SDM_Thzio', 'capo', 184, null), ('BladerWWE', 'capo', 145, null),
  ('ilsorre_tv', 'capo', 156, null), ('WB_Tony_Peanuts', 'capo', 187, null), ('Tommo666', 'capo', 68, null),
  ('Kai_Hiwatari', 'capo', 245, null), ('Pod81', 'capo', 117, null), ('Tsuner', 'capo', 189, null),
  -- Superstar
  ('Samuryan', 'superstar', 182, 'BelthazorHell'), ('MimmoTrottola', 'superstar', 40, 'Mimmo trottola'),
  ('lucadekuma', 'superstar', 66, 'Lukadekuma'), ('XBulgariCultBistrotX', 'superstar', 27, 'Bulgari'),
  ('Canzianylla', 'superstar', 141, 'Canzyanilla');

-- chi esisteva già (stesso nickname, nickname PBI o il nome scritto nella lista; maiuscole indifferenti)
create temp table esito (nick text, cat text, blader_id uuid, nuovo_blader boolean, prima text);
insert into esito (nick, cat, blader_id, nuovo_blader)
select l.nick, l.cat,
  (select b.id from bladers b
    where lower(b.nickname) in (lower(l.nick), lower(coalesce(l.alias, l.nick)))
       or lower(b.pbi_nickname) in (lower(l.nick), lower(coalesce(l.alias, l.nick)))
    order by (lower(b.nickname) = lower(l.nick)) desc limit 1),
  false
from lista l;

-- nuovi blader (posizione PBI di oggi: la sincronizzazione notturna la terrà aggiornata)
with ins as (
  insert into bladers (nickname, pro_rank, pro_synced_at)
  select l.nick, l.rank, case when l.rank is not null then now() end
  from lista l join esito e on e.nick = l.nick
  where e.blader_id is null
  on conflict (nickname) do nothing
  returning id, nickname)
update esito e set blader_id = ins.id, nuovo_blader = true from ins where ins.nickname = e.nick;
update esito e set blader_id = b.id from bladers b where e.blader_id is null and b.nickname = e.nick;

-- categoria attuale (per il riepilogo)
update esito e set prima = b.category
from bounties b join seasons s on s.id = b.season_id and s.is_active join teams t on t.id = s.team_id and t.slug = 'lake-fox'
where b.target_id = e.blader_id;

-- taglie già esistenti: cambio categoria (i Top 10 la ricordano per quando escono dalla top 10)
update bounties b set category = e.cat
from esito e, seasons s, teams t
where b.target_id = e.blader_id and s.id = b.season_id and s.is_active and t.id = s.team_id and t.slug = 'lake-fox'
  and b.category not in ('top10', 'fox') and b.category <> e.cat;
update bounties b set prev_category = e.cat
from esito e, seasons s, teams t, bladers bl
where b.target_id = e.blader_id and s.id = b.season_id and s.is_active and t.id = s.team_id and t.slug = 'lake-fox'
  and bl.id = b.target_id and bl.pro_rank between 1 and 10
  and b.category = 'top10' and b.prev_category is distinct from e.cat;

-- taglie "Top 10" rimaste a chi ormai è fuori dalla top 10: passano alla categoria scelta, con il valore della categoria
update bounties b set category = e.cat, prev_category = null, prev_value = null,
       value = coalesce(m.v, b.value), active = coalesce(m.v, b.value) > 0
from esito e
join teams t on t.slug = 'lake-fox'
join seasons s on s.team_id = t.id and s.is_active
join bladers bl on bl.id = e.blader_id
left join lateral (
  select x.value as v from bounties x where x.season_id = s.id and x.category = e.cat and x.value > 0
  group by x.value order by count(*) desc, x.value desc limit 1) m on true
where b.season_id = s.id and b.target_id = e.blader_id and b.category = 'top10'
  and (bl.pro_rank is null or bl.pro_rank > 10);

-- taglie nuove: valore più usato nella categoria (dopo gli spostamenti qui sopra)
insert into bounties (team_id, season_id, target_id, value, active, category)
select s.team_id, s.id, e.blader_id, coalesce(m.v, 0), coalesce(m.v, 0) > 0, e.cat
from esito e
join teams t on t.slug = 'lake-fox'
join seasons s on s.team_id = t.id and s.is_active
left join lateral (
  select b.value as v from bounties b where b.season_id = s.id and b.category = e.cat and b.value > 0
  group by b.value order by count(*) desc, b.value desc limit 1) m on true
where not exists (select 1 from bounties b where b.season_id = s.id and b.target_id = e.blader_id);

-- Riepilogo: controlla qui i nomi e i valori
select e.nick as blader,
       case e.cat when 'rilevante' then 'Blader rilevanti' when 'capo' then 'Team leader' else 'Superstar' end as categoria_scelta,
       case b.category when 'top10' then 'Top 10 (automatica)' when 'fox' then 'Fox Blader' when 'rilevante' then 'Blader rilevanti'
                       when 'capo' then 'Team leader' when 'superstar' then 'Superstar' end as categoria_attuale,
       coalesce(e.prima, '—') as categoria_prima,
       b.value as taglia, b.active as attiva, bl.pro_rank as posizione_pbi,
       case when e.nuovo_blader then 'nuovo' else 'già presente' end as stato
from esito e
join bladers bl on bl.id = e.blader_id
join teams t on t.slug = 'lake-fox'
join seasons s on s.team_id = t.id and s.is_active
join bounties b on b.season_id = s.id and b.target_id = e.blader_id
order by array_position(array['rilevante','capo','superstar'], e.cat), bl.pro_rank nulls last;

drop table if exists pg_temp.lista, pg_temp.esito;
