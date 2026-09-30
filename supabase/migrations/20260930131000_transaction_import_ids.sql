-- Bank imports: a stable id per imported row so re-importing the same file never duplicates.
-- A full (non-partial) unique index so upsert ... on conflict (user_id, external_id) can target it;
-- NULL external_ids (manual entries) stay distinct.
alter table public.transactions add column if not exists external_id text;
create unique index transactions_user_external_idx on public.transactions (user_id, external_id);
