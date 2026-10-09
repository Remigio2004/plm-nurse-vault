-- Rate-limit counters are server-managed by edge functions only.
revoke all on public.rate_limits from anon, authenticated;
