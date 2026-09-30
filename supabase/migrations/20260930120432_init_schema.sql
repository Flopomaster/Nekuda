-- ===== Finance =====
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('expense','income')),
  name text not null,
  icon text not null default '•',
  sort int not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  sort int not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('expense','income')),
  amount numeric(12,2) not null check (amount > 0),
  occurred_on date not null default current_date,
  category_id uuid references public.categories(id) on delete set null,
  merchant text,
  payment_method_id uuid references public.payment_methods(id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);
create index transactions_user_date_idx on public.transactions (user_id, occurred_on desc);
create index transactions_category_idx on public.transactions (category_id);
create index transactions_payment_idx on public.transactions (payment_method_id);

create table public.settings (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  savings_goal numeric(12,2),
  income_goal numeric(12,2),
  evening_reminder_time time not null default '20:00',
  timezone text not null default 'Asia/Jerusalem',
  updated_at timestamptz not null default now()
);

-- ===== Tasks =====
create table public.task_tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  color text not null default '#9b1c31',
  sort int not null default 0,
  created_at timestamptz not null default now()
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  notes text,
  tag_id uuid references public.task_tags(id) on delete set null,
  recurrence text not null default 'once' check (recurrence in ('once','daily','weekly','monthly')),
  due_date date,                 -- for one-time tasks
  start_date date not null default current_date, -- for recurring tasks
  weekdays smallint[] not null default '{}',    -- 0=Sunday .. 6=Saturday (weekly)
  month_day smallint check (month_day between 1 and 31), -- monthly
  reminder_time time,
  subtasks jsonb not null default '[]'::jsonb,  -- [{id, title}]
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  check (recurrence <> 'once' or due_date is not null),
  check (recurrence <> 'weekly' or cardinality(weekdays) > 0),
  check (recurrence <> 'monthly' or month_day is not null)
);
create index tasks_user_idx on public.tasks (user_id) where not archived;
create index tasks_tag_idx on public.tasks (tag_id);

create table public.task_completions (
  task_id uuid not null references public.tasks(id) on delete cascade,
  occurrence_date date not null,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  done boolean not null default false,
  done_subtasks text[] not null default '{}',
  completed_at timestamptz,
  primary key (task_id, occurrence_date)
);
create index task_completions_user_date_idx on public.task_completions (user_id, occurrence_date);

-- ===== Push =====
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- server-only: dedupe of sent notifications
create table public.notification_log (
  key text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  sent_at timestamptz not null default now()
);
create index notification_log_user_idx on public.notification_log (user_id);

-- ===== RLS: every row belongs to its owner =====
do $$
declare t text;
begin
  foreach t in array array['categories','payment_methods','transactions','task_tags','tasks','task_completions','push_subscriptions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format($p$create policy "own rows" on public.%I for all to authenticated
      using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)$p$, t);
  end loop;
end $$;

alter table public.settings enable row level security;
create policy "own settings" on public.settings for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

alter table public.notification_log enable row level security; -- no policies: service role only
