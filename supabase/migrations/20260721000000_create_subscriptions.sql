-- Create subscriptions table for PlayMove OS subscription tracking.
-- Phase 1 only: database structure and RLS read access for each owner.

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan text not null default 'trial',
  status text not null default 'active',
  expiry_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint subscriptions_plan_check
    check (plan in ('trial', 'monthly', 'yearly', 'lifetime')),
  constraint subscriptions_status_check
    check (status in ('active', 'suspended', 'expired'))
);

create unique index if not exists subscriptions_user_id_key
  on public.subscriptions (user_id);

create index if not exists subscriptions_status_idx
  on public.subscriptions (status);

create or replace function public.set_subscriptions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_subscriptions_updated_at on public.subscriptions;
create trigger set_subscriptions_updated_at
  before update on public.subscriptions
  for each row
  execute function public.set_subscriptions_updated_at();

alter table public.subscriptions enable row level security;

-- Users can only read their own subscription.
drop policy if exists "Users can read own subscription" on public.subscriptions;
create policy "Users can read own subscription"
  on public.subscriptions
  for select
  to authenticated
  using (auth.uid() = user_id);

-- No INSERT/UPDATE/DELETE policies are created for authenticated users.
-- With RLS enabled, this prevents users from modifying subscriptions.
-- Supabase service-role/admin code bypasses RLS and can manage rows server-side.
