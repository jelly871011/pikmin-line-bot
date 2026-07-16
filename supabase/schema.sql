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
