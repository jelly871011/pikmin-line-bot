-- Pikmin LINE Bot — Supabase schema
-- Run this in the Supabase SQL Editor once, before deploying.

create extension if not exists "pgcrypto";

create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  group_id text not null,
  player_name text not null,
  remaining integer not null default 3,
  power integer not null default 0,
  updated_at timestamptz not null default now(),
  unique (group_id, player_name)
);

create index if not exists players_group_id_idx on players (group_id);

-- Row Level Security. New Supabase publishable keys go through RLS, so the
-- table needs explicit policies allowing the bot (anon role) to read/write.
-- This table only holds game counters, so open anon access is acceptable.
alter table players enable row level security;

drop policy if exists "allow anon read players" on players;
create policy "allow anon read players"
  on players for select
  to anon
  using (true);

drop policy if exists "allow anon insert players" on players;
create policy "allow anon insert players"
  on players for insert
  to anon
  with check (true);

drop policy if exists "allow anon update players" on players;
create policy "allow anon update players"
  on players for update
  to anon
  using (true)
  with check (true);
