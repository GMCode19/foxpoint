-- FOX POINT - 07 FOTO DEI GIOCATORI CON TAGLIA
-- Eseguilo una volta nel SQL Editor di Supabase. Non modifica dati esistenti e si può rilanciare.
-- Crea lo spazio privato "foto-bersagli" e i permessi: le foto le vedono solo i membri del team
-- e le caricano solo gli admin, dopo aver avuto il consenso della persona.

-- ============ FOTO DEI GIOCATORI CON TAGLIA ============
-- Le foto stanno nello spazio PRIVATO "foto-bersagli" di Supabase Storage, una cartella per team:
--   <team_id>/<blader_id>-<data>.<estensione>
-- Le vede solo chi è membro di quel team; le caricano solo i suoi admin, dopo aver avuto il consenso.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('foto-bersagli', 'foto-bersagli', false, 524288, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- foto per team (ogni team decide le sue), con l'admin che ha confermato il consenso
create table if not exists blader_photos (
  team_id    uuid not null references teams(id) on delete cascade,
  blader_id  uuid not null references bladers(id) on delete cascade,
  path       text not null,
  consent_by uuid references bladers(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (team_id, blader_id)
);

create or replace function my_admin_team_ids() returns setof uuid
language sql stable security definer set search_path = public as
$$ select tm.team_id from team_members tm join bladers b on b.id = tm.blader_id
   where b.user_id = auth.uid() and tm.role = 'admin' and tm.status = 'active' $$;

-- Admin: registra la foto appena caricata. Restituisce il percorso della foto precedente (da cancellare).
create or replace function set_blader_photo(p_team uuid, p_blader uuid, p_path text) returns text
language plpgsql security definer set search_path = public as $$
declare old text;
begin
  if not is_team_admin(p_team) then raise exception 'Solo gli admin del team possono gestire le foto'; end if;
  if not exists (select 1 from bounties where team_id = p_team and target_id = p_blader) then
    raise exception 'Le foto si possono mettere solo ai giocatori che hanno una taglia';
  end if;
  if p_path is null or split_part(p_path, '/', 1) <> p_team::text or p_path !~ '^[0-9a-f-]+/[0-9a-f-]+-[0-9]+\.(webp|jpg|png)$' then
    raise exception 'Percorso della foto non valido';
  end if;
  select path into old from blader_photos where team_id = p_team and blader_id = p_blader;
  insert into blader_photos (team_id, blader_id, path, consent_by, updated_at)
  values (p_team, p_blader, p_path, current_blader_id(), now())
  on conflict (team_id, blader_id) do update
    set path = excluded.path, consent_by = excluded.consent_by, updated_at = now();
  return old;
end $$;

-- Admin: toglie la foto (es. se la persona cambia idea). Restituisce il percorso da cancellare.
create or replace function remove_blader_photo(p_team uuid, p_blader uuid) returns text
language plpgsql security definer set search_path = public as $$
declare old text;
begin
  if not is_team_admin(p_team) then raise exception 'Solo gli admin del team possono gestire le foto'; end if;
  delete from blader_photos where team_id = p_team and blader_id = p_blader returning path into old;
  return old;
end $$;

alter table blader_photos enable row level security;
drop policy if exists read_team on blader_photos;
create policy read_team on blader_photos for select to authenticated using (team_id in (select my_team_ids()));
-- si scrive solo con set_blader_photo / remove_blader_photo

-- permessi sui file
drop policy if exists "foto-bersagli lettura team" on storage.objects;
drop policy if exists "foto-bersagli caricamento admin" on storage.objects;
drop policy if exists "foto-bersagli modifica admin" on storage.objects;
drop policy if exists "foto-bersagli eliminazione admin" on storage.objects;
create policy "foto-bersagli lettura team" on storage.objects for select to authenticated
  using (bucket_id = 'foto-bersagli' and (storage.foldername(name))[1] in (select t::text from my_team_ids() t));
create policy "foto-bersagli caricamento admin" on storage.objects for insert to authenticated
  with check (bucket_id = 'foto-bersagli' and (storage.foldername(name))[1] in (select t::text from my_admin_team_ids() t));
create policy "foto-bersagli modifica admin" on storage.objects for update to authenticated
  using (bucket_id = 'foto-bersagli' and (storage.foldername(name))[1] in (select t::text from my_admin_team_ids() t));
create policy "foto-bersagli eliminazione admin" on storage.objects for delete to authenticated
  using (bucket_id = 'foto-bersagli' and (storage.foldername(name))[1] in (select t::text from my_admin_team_ids() t));

-- Controllo: deve risultare 1 spazio foto privato e 4 regole di accesso
select (select count(*) from storage.buckets where id = 'foto-bersagli' and not public) as spazio_foto_privato,
       (select count(*) from pg_policies where tablename = 'objects' and policyname like 'foto-bersagli%') as regole;
