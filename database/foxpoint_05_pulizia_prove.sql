-- FOX POINT - 05 PULIZIA DEI DATI DI PROVA
-- Da eseguire UNA VOLTA prima di invitare il team, per partire con la classifica a zero.
--
-- CANCELLA: tutte le vittorie dichiarate/approvate, i risultati ranked, le correzioni punti,
--           le richieste di ingresso già gestite, i tornei di prova inseriti a mano.
-- MANTIENE: membri e admin, taglie con i valori che hai impostato, tornei ufficiali dal calendario PBI,
--           la tabella punti, gli account di accesso.

begin;
delete from points_ledger;
delete from claims;
delete from tournament_entries;
delete from join_requests where status <> 'pending';
-- tornei aggiunti a mano durante le prove (quelli ufficiali hanno il link alla pagina PBI)
delete from tournaments where url is null;
commit;

-- Controllo: deve risultare tutto a zero tranne membri e taglie
select (select count(*) from points_ledger)      as movimenti_punti,
       (select count(*) from claims)             as vittorie,
       (select count(*) from tournament_entries) as risultati_ranked,
       (select count(*) from team_members)       as membri,
       (select count(*) from bounties where active) as taglie_attive;
