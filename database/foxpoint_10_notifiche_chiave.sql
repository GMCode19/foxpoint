-- FOX POINT - 10 CORREZIONE NOTIFICHE
-- Supabase ora chiede la chiave pubblica (publishable) anche per chiamare le funzioni con "Verify JWT" spento.
-- Questo script la aggiunge alle chiamate del database e avvia la funzione "push" (che crea le sue chiavi).
-- La chiave publishable è pubblica (è la stessa già presente nell'app). Si può eseguire più volte.

alter table push_config add column if not exists api_key text;
update push_config set api_key = 'sb_publishable_f62bimhQdn81Xsd2TiHGYg_idA-GlHz' where id = 1;

create or replace function push_wake() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare c push_config;
begin
  select * into c from push_config where id = 1;
  perform net.http_post(url := c.function_url, body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', c.api_key, 'x-hook-secret', c.hook_secret));
  return null;
exception when others then
  return null;   -- una notifica non riuscita non deve mai bloccare dichiarazioni o approvazioni
end $$;

-- avvia la funzione "push" dal database (la prima volta crea le chiavi); l'app la usa se la chiave non c'è ancora
create or replace function push_init() returns void
language plpgsql security definer set search_path = public, extensions as $$
declare c push_config;
begin
  select * into c from push_config where id = 1;
  if c.public_key is not null then return; end if;
  perform net.http_post(url := c.function_url, body := '{"init":true}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', c.api_key));
end $$;
revoke execute on function push_wake() from public, anon, authenticated;
grant execute on function push_init() to authenticated;

select push_init();
select 'Fatto: attendi 5 secondi e riesegui solo la riga qui sotto per controllare' as passo;
-- select public_key is not null as chiavi_create from push_config;
