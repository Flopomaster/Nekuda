-- Automatic bank/credit-card sync.
-- Credentials are encrypted in the browser with a public key; only the nightly worker
-- (GitHub Actions, holding the private key) can decrypt them. The database never sees plaintext.
create table public.bank_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  company text not null,
  label text,
  encrypted_credentials text not null,
  status text not null default 'pending' check (status in ('pending','ok','error')),
  last_error text,
  last_sync_at timestamptz,
  last_success_at timestamptz,
  last_added int,
  created_at timestamptz not null default now()
);
create index bank_connections_user_idx on public.bank_connections (user_id);

alter table public.bank_connections enable row level security;
create policy "own rows" on public.bank_connections for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Clients may write the encrypted blob but never read it back
revoke select on public.bank_connections from authenticated, anon;
grant select (id, user_id, company, label, status, last_error, last_sync_at, last_success_at, last_added, created_at)
  on public.bank_connections to authenticated;

-- Public encryption key (readable by signed-in users). Single row.
create table public.sync_config (
  id boolean primary key default true check (id),
  public_key text not null,
  created_at timestamptz not null default now()
);
alter table public.sync_config enable row level security;
create policy "read public key" on public.sync_config for select to authenticated using (true);

-- One-time setup: the browser generates the key pair, stores the public key here and the
-- hash of the worker's API token in private.config. Refuses once configured.
create or replace function public.setup_bank_sync(p_public_key text, p_token_hash text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if exists (select 1 from public.sync_config) then raise exception 'already configured'; end if;
  insert into public.sync_config (public_key) values (p_public_key);
  insert into private.config (key, value) values ('sync_token_hash', p_token_hash)
    on conflict (key) do update set value = excluded.value;
end $$;
revoke execute on function public.setup_bank_sync(text, text) from public, anon;
grant execute on function public.setup_bank_sync(text, text) to authenticated;

-- Service-role accessor for the bank-sync edge function
create or replace function public.get_sync_token_hash()
returns text language sql security definer set search_path = '' as $$
  select value from private.config where key = 'sync_token_hash';
$$;
revoke execute on function public.get_sync_token_hash() from public, anon, authenticated;
grant execute on function public.get_sync_token_hash() to service_role;
