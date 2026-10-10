-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.
-- Adds the host (the friend who paid the restaurant) to each bill.

alter table bills add column if not exists host_name text not null default 'Host';
alter table bills add column if not exists host_wallet text;           -- null means the app's default wallet
alter table bills add column if not exists host_token text;            -- private key for host-only actions
alter table bills add column if not exists split_leftovers boolean not null default false;
