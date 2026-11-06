-- FOX POINT - 03 COLLEGAMENTO ADMIN
-- Esegui DOPO 02, e solo se l'utente LA_TUA_EMAIL esiste in Authentication > Users.

update bladers
set user_id = (select id from auth.users where email = 'LA_TUA_EMAIL')
where nickname = 'Yujira' and user_id is null;

-- Per marcocarno: dopo che si è registrato, togli i -- e metti la sua email
-- update bladers
-- set user_id = (select id from auth.users where email = 'EMAIL_DI_MARCOCARNO')
-- where nickname = 'marcocarno' and user_id is null;

-- ============ VERIFICHE ============
-- 1) Yujira deve risultare admin e collegato = true
select b.nickname, tm.role, b.user_id is not null as collegato
from team_members tm join bladers b on b.id = tm.blader_id
order by tm.role, b.nickname;

-- 2) Devono risultare 10 top10, 7 rilevante, 7 capo
select category, count(*) from bounties group by category order by category;
