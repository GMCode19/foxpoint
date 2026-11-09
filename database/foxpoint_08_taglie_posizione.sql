-- FOX POINT - 08 TAGLIE TOP 10 LEGATE ALLA POSIZIONE
-- Il valore delle taglie Top 10 dipende dalla POSIZIONE nella classifica PBI, non dalla persona:
-- se MajinPi passa dal 3° al 2° posto prende il valore del 2° posto, e chi scende prende quello del 3°.
-- L'admin continua a usare il pannello come prima: quando cambia il valore di un giocatore della Top 10,
-- in realtà imposta il valore di quella posizione. L'aggiornamento automatico di ogni mattina fa slittare le taglie.
-- Si può eseguire più volte senza problemi.

-- valore di ogni posizione (1-10) per ogni team
create table if not exists bounty_rank_values (
  team_id uuid not null references teams(id) on delete cascade,
  rank    int  not null check (rank between 1 and 10),
  value   int  not null check (value >= 0),
  primary key (team_id, rank)
);
alter table bounty_rank_values enable row level security;
drop policy if exists read_team on bounty_rank_values;
create policy read_team on bounty_rank_values for select to authenticated using (team_id in (select my_team_ids()));
-- si scrive solo dal trigger qui sotto (o dall'aggiornamento automatico)

-- un "rilevante" o "capo team" che entra in top 10 diventa Top 10; quando esce torna com'era, col suo valore
alter table bounties add column if not exists prev_category text;
alter table bounties add column if not exists prev_value int;

-- l'admin cambia il valore di una taglia Top 10 di un giocatore in top 10 -> diventa il valore di quella posizione
create or replace function bounty_rank_value_sync() returns trigger
language plpgsql security definer set search_path = public as $$
declare r int;
begin
  if new.category = 'top10' and new.value is distinct from old.value then
    select pro_rank into r from bladers where id = new.target_id;
    if r between 1 and 10 then
      insert into bounty_rank_values (team_id, rank, value) values (new.team_id, r, new.value)
      on conflict (team_id, rank) do update set value = excluded.value;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_bounty_rank_value on bounties;
create trigger trg_bounty_rank_value after update of value on bounties
for each row execute function bounty_rank_value_sync();

-- valori di partenza: quelli già impostati, dal più alto al più basso (1° posto = valore più alto)
insert into bounty_rank_values (team_id, rank, value)
select team_id, rn, value from (
  select b.team_id, b.value, row_number() over (partition by b.team_id order by b.value desc, bl.pro_rank) rn
  from bounties b
  join seasons s on s.id = b.season_id and s.is_active
  join bladers bl on bl.id = b.target_id
  where b.category = 'top10' and bl.pro_rank between 1 and 10
) x where rn <= 10
on conflict (team_id, rank) do nothing;

-- applica subito: ogni taglia Top 10 prende il valore della posizione attuale
update bounties b set value = v.value
from bladers bl, bounty_rank_values v, seasons s
where bl.id = b.target_id and s.id = b.season_id and s.is_active
  and b.category = 'top10' and v.team_id = b.team_id and v.rank = bl.pro_rank
  and b.value <> v.value;

-- controllo: valori per posizione e taglie Top 10 attuali
select v.rank as posizione, v.value as valore,
  (select string_agg(bl.nickname || ' (' || b.value || ')', ', ')
     from bounties b join bladers bl on bl.id = b.target_id join seasons s on s.id = b.season_id and s.is_active
     where b.team_id = v.team_id and b.category = 'top10' and bl.pro_rank = v.rank) as taglia
from bounty_rank_values v order by v.team_id, v.rank;
