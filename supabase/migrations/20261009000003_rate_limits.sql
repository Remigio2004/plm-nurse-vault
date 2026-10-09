-- Rate limiting table for expensive edge functions (like file uploads).
-- Tracks attempts per key (IP or user_id) and action with a rolling window.
create table if not exists public.rate_limits (
  key text not null,
  action text not null,
  attempts integer not null default 1,
  reset_at timestamptz not null,
  primary key (key, action)
);

grant select, insert, update, delete on public.rate_limits to authenticated;