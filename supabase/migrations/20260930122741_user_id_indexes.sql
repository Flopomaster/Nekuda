create index if not exists categories_user_idx on public.categories (user_id);
create index if not exists payment_methods_user_idx on public.payment_methods (user_id);
create index if not exists task_tags_user_idx on public.task_tags (user_id);
