-- Allow a few separate accounts (data is already isolated per user by RLS).
-- The cap keeps strangers from signing up to a public URL.
drop trigger if exists only_one_user on auth.users;
drop function if exists private.only_one_user();

create or replace function private.limit_users()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from auth.users) >= 5 then
    raise exception 'Sign-ups are closed';
  end if;
  return new;
end $$;
create trigger limit_users before insert on auth.users
  for each row execute function private.limit_users();
