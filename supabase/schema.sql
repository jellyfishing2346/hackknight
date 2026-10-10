-- Run this once in Supabase: SQL Editor -> New query -> paste -> Run.

create table if not exists bills (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'Dinner',
  tax numeric(10,2) not null default 0,
  tip numeric(10,2) not null default 0,
  host_name text not null default 'Host',
  host_wallet text,
  host_token text,
  split_leftovers boolean not null default false,
  even_split int,
  created_at timestamptz not null default now()
);

create table if not exists items (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references bills(id) on delete cascade,
  name text not null,
  price numeric(10,2) not null,
  position int not null default 0,
  claimed_by text,
  claimers text[] not null default '{}'
);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references bills(id) on delete cascade,
  payer_name text not null,
  amount numeric(10,2) not null,
  reference text not null unique,
  status text not null default 'pending' check (status in ('pending','paid')),
  signature text,
  created_at timestamptz not null default now()
);

create index if not exists items_bill_idx on items(bill_id);
create index if not exists payments_bill_idx on payments(bill_id);

-- The app only talks to the database from its own server with the service role key,
-- so lock the tables to everyone else.
alter table bills enable row level security;
alter table items enable row level security;
alter table payments enable row level security;

-- Atomic add/remove of a claimer on an item (see migrations/003_shared_items.sql)
create or replace function claim_item(p_item uuid, p_name text, p_claim boolean)
returns text[]
language sql
as $$
  update items
  set claimers = case
    when p_claim then
      case when exists (select 1 from unnest(claimers) c where lower(trim(c)) = lower(trim(p_name)))
        then claimers
        else array_append(claimers, trim(p_name))
      end
    else array(select c from unnest(claimers) c where lower(trim(c)) <> lower(trim(p_name)))
  end
  where id = p_item
  returning claimers;
$$;
