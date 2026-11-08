-- FOX POINT - 07 FOTO DEI MANIFESTI "WANTED"
-- Eseguilo una volta nel SQL Editor. Si può rilanciare senza problemi e non cancella nulla.
--
-- Le foto stanno nello spazio privato "wanted" di Supabase Storage, in una cartella per team:
--   wanted/<id del team>/<id del blader>.jpg
-- Le vede solo chi fa parte di quel team; le caricano e le tolgono solo gli admin di quel team.

-- 1) Data dell'ultima foto caricata per la taglia (serve anche a sapere se la foto c'è)
alter table bounties add column if not exists photo_updated_at timestamptz;

-- 2) Spazio privato: solo immagini JPEG/WEBP/PNG, massimo 1 MB ciascuna
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('wanted', 'wanted', false, 1048576, array['image/jpeg', 'image/webp', 'image/png'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- 3) Controlli sui percorsi "<team>/<file>" (falso se il percorso non è valido)
create or replace function wanted_is_member(p_name text) returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  return split_part(p_name, '/', 1)::uuid in (select my_team_ids());
exception when others then return false;
end $$;

create or replace function wanted_is_admin(p_name text) returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  return is_team_admin(split_part(p_name, '/', 1)::uuid);
exception when others then return false;
end $$;

-- 4) Regole di accesso alle foto
drop policy if exists wanted_read   on storage.objects;
drop policy if exists wanted_insert on storage.objects;
drop policy if exists wanted_update on storage.objects;
drop policy if exists wanted_delete on storage.objects;

create policy wanted_read on storage.objects for select to authenticated
  using (bucket_id = 'wanted' and public.wanted_is_member(name));
create policy wanted_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'wanted' and public.wanted_is_admin(name));
create policy wanted_update on storage.objects for update to authenticated
  using (bucket_id = 'wanted' and public.wanted_is_admin(name))
  with check (bucket_id = 'wanted' and public.wanted_is_admin(name));
create policy wanted_delete on storage.objects for delete to authenticated
  using (bucket_id = 'wanted' and public.wanted_is_admin(name));

-- Controllo: deve comparire lo spazio "wanted" non pubblico e le 4 regole
select id, public, file_size_limit,
       (select count(*) from pg_policies where tablename = 'objects' and policyname like 'wanted_%') as regole
from storage.buckets where id = 'wanted';
