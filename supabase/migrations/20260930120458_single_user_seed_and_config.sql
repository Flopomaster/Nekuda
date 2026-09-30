-- Private schema (not exposed through the API) for server secrets.
-- Values (VAPID keys, cron secret) are inserted separately and never committed:
--   insert into private.config(key, value) values
--     ('vapid_public', '...'), ('vapid_private', '...'), ('vapid_subject', 'mailto:...'), ('cron_secret', '...');
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table private.config (key text primary key, value text not null);

-- Service-role-only accessor used by the reminders edge function
create or replace function public.get_push_config()
returns table (vapid_public text, vapid_private text, vapid_subject text, cron_secret text)
language sql security definer set search_path = '' as $$
  select
    (select value from private.config where key = 'vapid_public'),
    (select value from private.config where key = 'vapid_private'),
    (select value from private.config where key = 'vapid_subject'),
    (select value from private.config where key = 'cron_secret');
$$;
revoke execute on function public.get_push_config() from public, anon, authenticated;
grant execute on function public.get_push_config() to service_role;

-- This is a personal app: only the first account may ever sign up
create or replace function private.only_one_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from auth.users) then
    raise exception 'Sign-ups are closed';
  end if;
  return new;
end $$;
create trigger only_one_user before insert on auth.users
  for each row execute function private.only_one_user();

-- Seed defaults for the new user
create or replace function private.seed_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.settings (user_id) values (new.id);

  insert into public.categories (user_id, kind, name, icon, sort) values
    (new.id, 'expense', 'סופר ומזון', '🛒', 1),
    (new.id, 'expense', 'מסעדות ובילויים', '🍽️', 2),
    (new.id, 'expense', 'תחבורה ודלק', '🚗', 3),
    (new.id, 'expense', 'דיור וחשבונות', '🏠', 4),
    (new.id, 'expense', 'מנויים', '🔁', 5),
    (new.id, 'expense', 'קניות וביגוד', '🛍️', 6),
    (new.id, 'expense', 'בריאות', '💊', 7),
    (new.id, 'expense', 'חינוך', '📚', 8),
    (new.id, 'expense', 'מתנות', '🎁', 9),
    (new.id, 'expense', 'אחר', '📦', 10),
    (new.id, 'income', 'משכורת', '💼', 1),
    (new.id, 'income', 'פרילנס', '💻', 2),
    (new.id, 'income', 'מתנות', '🎁', 3),
    (new.id, 'income', 'החזרים', '↩️', 4),
    (new.id, 'income', 'אחר', '📦', 5);

  insert into public.payment_methods (user_id, name, sort) values
    (new.id, 'אשראי', 1), (new.id, 'מזומן', 2), (new.id, 'ביט', 3),
    (new.id, 'הוראת קבע', 4), (new.id, 'העברה בנקאית', 5);

  insert into public.task_tags (user_id, name, color, sort) values
    (new.id, 'אישי', '#9b1c31', 1), (new.id, 'בית', '#2a78d6', 2),
    (new.id, 'עבודה', '#4a3aa7', 3), (new.id, 'בריאות', '#008300', 4),
    (new.id, 'סידורים', '#eb6834', 5);
  return new;
end $$;
create trigger seed_new_user after insert on auth.users
  for each row execute function private.seed_new_user();

create extension if not exists pg_cron;
create extension if not exists pg_net;
