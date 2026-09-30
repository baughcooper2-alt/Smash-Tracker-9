-- Smash Tracker cloud sync schema.
-- Paste this whole file into Supabase → SQL Editor → New query, then press Run.
-- Safe to run more than once.

-- One row per logged game. Deleted games stay as tombstones (deleted = true)
-- so every device learns about the delete.
create table if not exists public.smash_matches (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  id         bigint      not null,
  data       jsonb,
  deleted    boolean     not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- Everything else (current fighters, KO counts, settings, roster names,
-- portraits, presets, rivals…) as one row per key.
create table if not exists public.smash_kv (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  key        text        not null,
  value      jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

create index if not exists smash_matches_updated on public.smash_matches (user_id, updated_at);
create index if not exists smash_kv_updated on public.smash_kv (user_id, updated_at);

-- The server clock decides updated_at, so devices with wrong clocks can't
-- hide their changes from each other.
create or replace function public.smash_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end $$;

drop trigger if exists smash_matches_touch on public.smash_matches;
create trigger smash_matches_touch before insert or update on public.smash_matches
  for each row execute function public.smash_touch();
drop trigger if exists smash_kv_touch on public.smash_kv;
create trigger smash_kv_touch before insert or update on public.smash_kv
  for each row execute function public.smash_touch();

-- Each signed-in account can only see and change its own rows.
alter table public.smash_matches enable row level security;
alter table public.smash_kv enable row level security;

drop policy if exists "own matches" on public.smash_matches;
create policy "own matches" on public.smash_matches for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "own kv" on public.smash_kv;
create policy "own kv" on public.smash_kv for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.smash_matches to authenticated;
grant select, insert, update, delete on public.smash_kv to authenticated;

-- Live updates: tell Supabase Realtime to broadcast changes to these tables.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'smash_matches') then
    alter publication supabase_realtime add table public.smash_matches;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'smash_kv') then
    alter publication supabase_realtime add table public.smash_kv;
  end if;
end $$;
