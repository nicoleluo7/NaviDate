create table if not exists public.navidate_records (
  key text primary key,
  value jsonb not null
);
alter table public.navidate_records enable row level security;
revoke all on public.navidate_records from anon, authenticated;
grant all on public.navidate_records to service_role;
-- No client policies. All public reads are sanitized by the application server.
