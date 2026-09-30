-- Two categories that bank imports need: transfers/Bit and cash withdrawals
insert into public.categories (user_id, kind, name, icon, sort)
select u.id, 'expense', x.name, x.icon, x.sort
from auth.users u
cross join (values ('העברות וביט', '💸', 11), ('משיכת מזומן', '💵', 12)) as x(name, icon, sort)
where not exists (select 1 from public.categories c where c.user_id = u.id and c.kind = 'expense' and c.name = x.name);

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
    (new.id, 'expense', 'העברות וביט', '💸', 11),
    (new.id, 'expense', 'משיכת מזומן', '💵', 12),
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
