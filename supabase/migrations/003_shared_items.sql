-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.
-- 1) An item can be claimed by several people, who split its price evenly.
-- 2) A bill can be split evenly between a set number of people instead of by item.

alter table items add column if not exists claimers text[] not null default '{}';
update items set claimers = array[claimed_by] where claimed_by is not null and claimers = '{}';

alter table bills add column if not exists even_split int;  -- null = by item; N = split the total N ways

-- Add or remove one person on an item in a single atomic step, so two people
-- tapping the same item at the same moment can't overwrite each other.
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
