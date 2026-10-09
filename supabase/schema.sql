-- Run this once in Supabase: SQL Editor -> New query -> paste -> Run.

create table if not exists bills (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'Dinner',
  tax numeric(10,2) not null default 0,
  tip numeric(10,2) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists items (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references bills(id) on delete cascade,
  name text not null,
  price numeric(10,2) not null,
  position int not null default 0,
  claimed_by text
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
