-- ============================================================
-- Fox Point · 12 · Sicurezza (revisione del 22 novembre 2026)
-- Da eseguire UNA volta nell'SQL Editor di Supabase, dopo lo script 11.
-- Non cambia nulla di quello che vedono i membri.
-- ============================================================

-- 1) Funzioni interne: si usano solo dentro altre funzioni del database, non devono essere chiamabili dall'app.
--    _ranked_set_result in particolare permetteva a chiunque fosse connesso di scrivere o sovrascrivere
--    un risultato ranked "in attesa" a nome di un altro blader (l'admin poi avrebbe approvato dati falsi).
revoke execute on function _ranked_set_result(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke execute on function _is_active_member(uuid, uuid) from public, anon, authenticated;
revoke execute on function fox_rank(uuid, uuid) from public, anon, authenticated;

-- 2) Chi non ha fatto l'accesso (chiave pubblica dell'app) non deve poter chiamare nessuna funzione.
--    Tutto quello che fa l'app, compresa la richiesta di ingresso, avviene dopo l'accesso.
--    Per chi ha fatto l'accesso non cambia nulla: mantiene esattamente le funzioni che aveva.
do $$
declare f record; had boolean;
begin
  for f in select p.oid, p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prokind = 'f'
             and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')   -- non toccare le estensioni
  loop
    had := has_function_privilege('authenticated', f.oid, 'execute');
    execute format('revoke execute on function %s from public, anon', f.sig);
    if had then execute format('grant execute on function %s to authenticated', f.sig); end if;
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant execute on function %s to service_role', f.sig);
    end if;
  end loop;
end $$;
-- le funzioni create in futuro: sì a chi ha fatto l'accesso, no agli anonimi
alter default privileges in schema public revoke execute on functions from public, anon;
alter default privileges in schema public grant execute on functions to authenticated;

-- 3) Foto profilo: le vede solo chi fa parte del team (prima bastava aver creato un account,
--    anche senza essere stati accettati).
drop policy if exists "avatar lettura" on storage.objects;
create policy "avatar lettura" on storage.objects for select to authenticated
  using (bucket_id = 'avatar' and (
    (storage.foldername(name))[1] = current_blader_id()::text
    or (storage.foldername(name))[1] in (
      select tm.blader_id::text from team_members tm
      where tm.status = 'active' and tm.team_id in (select my_team_ids()))));

-- Controllo: tutte le righe devono dire "ok"
select 'funzione interna protetta' as controllo,
       case when not has_function_privilege('authenticated', '_ranked_set_result(uuid, uuid, uuid, text)', 'execute') then 'ok' else 'NO' end as esito
union all
select 'nessuna funzione aperta senza accesso',
       case when not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                             where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')) then 'ok' else 'NO' end
union all
select 'foto profilo solo per il team',
       case when exists (select 1 from pg_policies where tablename = 'objects' and policyname = 'avatar lettura' and qual like '%team_members%') then 'ok' else 'NO' end;
