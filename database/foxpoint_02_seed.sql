-- FOX POINT - 02 SEED (dati iniziali)
-- Classifica PBI: ranked del 31/10/2026 (aggiornata il 01/11/2026)
-- Esegui DOPO foxpoint_01_schema.sql

-- ============ TEAM E STAGIONE ============
insert into teams (name, slug) values ('Lake Fox', 'lake-fox') on conflict (slug) do nothing;

insert into seasons (team_id, year, starts_on, ends_on, is_active)
select id, 2027, '2027-01-01', '2027-12-31', true from teams where slug = 'lake-fox'
on conflict (team_id, year) do nothing;

-- ============ BLADER BERSAGLIO (24) ============
insert into bladers (nickname, pro_rank, pro_points, pro_synced_at) values
  -- Top 10 PBI
  ('Ivanbrando',           1, 4185, now()),
  ('BBP_iamThanos',        2, 4120, now()),
  ('MajinPi',              3, 4080, now()),
  ('SDM_Brus972',          4, 3310, now()),
  ('Cinzio97',             5, 2635, now()),
  ('WB_Milaneitor',        6, 2500, now()),
  ('_AeS_',                7, 2275, now()),
  ('MaxViglia',            8, 2200, now()),
  ('marcocarno',           9, 2120, now()),   -- è anche un membro Lake Fox
  ('BurstatiSenzaGloria', 10, 2095, now()),
  -- Blader rilevanti
  ('Zenoby',              11, 2050, now()),
  ('MarcoCannoneBlader',  14, 1870, now()),
  ('DarkPyra',            16, 1855, now()),
  ('Shadow95',            17, 1840, now()),
  ('Nikaカラス',          18, 1835, now()),
  ('SDM_AgeroXXXI',       19, 1825, now()),
  ('DC_Ernesto_Fiammata', 21, 1755, now()),
  -- Famosi / capi team (posizioni dall'ultima lettura, si aggiornano con la sincronizzazione)
  ('XBulgariCultBistrotX', 28, 1420, now()),
  ('AHJIN_ItsRio',         41,  965, now()),
  ('RomGattoNero',         42,  955, now()),
  ('lucadekuma',           57,  760, now()),
  ('MimmoTrottola',       103,  410, now()),
  ('Canzianylla',         126,  310, now()),
  ('BelthazorHell',       170,  220, now());

-- ============ MEMBRI LAKE FOX (oltre a marcocarno) ============
insert into bladers (nickname, pro_rank, pbi_nickname, pbi_id) values
  ('Zoddo',        30, null, null),
  ('Yujira',      119, null, null),
  ('Napoli961',   317, null, null),
  ('Fourteenkay',  87, 'Krsto14', '7742966'),   -- su PBI è Krsto14
  ('Nikkk',      null, null, null);             -- nuovo, nessuna ranked ancora

insert into team_members (team_id, blader_id, role)
select t.id, b.id, case when b.nickname in ('Yujira', 'marcocarno') then 'admin' else 'player' end
from teams t
join bladers b on b.nickname in ('marcocarno', 'Zoddo', 'Yujira', 'Napoli961', 'Fourteenkay', 'Nikkk')
where t.slug = 'lake-fox';

-- ============ TAGLIE (valore 0 e non attive finché non decidiamo i punti) ============
insert into bounties (team_id, season_id, target_id, value, active, category)
select s.team_id, s.id, b.id, 0, false, t.cat
from seasons s
cross join (values
  ('Ivanbrando', 'top10'), ('BBP_iamThanos', 'top10'), ('MajinPi', 'top10'), ('SDM_Brus972', 'top10'),
  ('Cinzio97', 'top10'), ('WB_Milaneitor', 'top10'), ('_AeS_', 'top10'), ('MaxViglia', 'top10'),
  ('marcocarno', 'top10'), ('BurstatiSenzaGloria', 'top10'),
  ('Zenoby', 'rilevante'), ('MarcoCannoneBlader', 'rilevante'), ('DarkPyra', 'rilevante'),
  ('Nikaカラス', 'rilevante'), ('Shadow95', 'rilevante'), ('SDM_AgeroXXXI', 'rilevante'),
  ('DC_Ernesto_Fiammata', 'rilevante'),
  ('MimmoTrottola', 'capo'), ('lucadekuma', 'capo'), ('RomGattoNero', 'capo'),
  ('XBulgariCultBistrotX', 'capo'), ('Canzianylla', 'capo'), ('AHJIN_ItsRio', 'capo'),
  ('BelthazorHell', 'capo')
) as t(n, cat)
join bladers b on b.nickname = t.n
where s.is_active;

-- ============ CODICE DI INGRESSO DEL TEAM ============
-- Copialo: serve ai membri per entrare nel team dopo la registrazione.
select name, join_code from teams where slug = 'lake-fox';
