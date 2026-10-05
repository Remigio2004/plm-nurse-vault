import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const ALLOWED_ORIGIN_PATTERNS = [
  /^https:\/\/plm-nurse-vault\.vercel\.app$/,
  /^https:\/\/plm-nurse-vault-[a-z0-9-]+\.vercel\.app$/,
  /^http:\/\/localhost:\d+$/,
];

function buildCorsHeaders(origin: string | null) {
  const allowedOrigin =
    origin && ALLOWED_ORIGIN_PATTERNS.some((pattern) => pattern.test(origin)) ? origin : "";
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Vary": "Origin",
  };
}

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

async function verifyTurnstile(token: string, ip: string): Promise<boolean> {
  const secret = Deno.env.get("TURNSTILE_SECRET_KEY");
  if (!secret) return false;
  const body = new URLSearchParams({ secret, response: token, remoteip: ip });
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body,
    });
    const json = await res.json().catch(() => null);
    return json?.success === true;
  } catch {
    return false;
  }
}

function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return "unknown";
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req.headers.get("origin"));

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const { email, password, turnstileToken } = (await req.json()) as {
      email?: string;
      password?: string;
      turnstileToken?: string;
    };
    if (!email || !password) {
      return new Response(JSON.stringify({ error: "Email and password are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ip = getClientIp(req);

    // Human verification first — a captcha failure is not a password guess,
    // so it must NOT consume a lockout attempt.
    if (!turnstileToken || !(await verifyTurnstile(turnstileToken, ip))) {
      return new Response(JSON.stringify({ error: "Human verification failed. Please try again." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const emailKey = email.trim().toLowerCase();
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const now = new Date();

    // Counters are per (IP, email): a shared campus IP no longer locks out
    // everyone, and header spoofing no longer dodges a counter because the
    // email half still tracks the attack.
    const { data: existing } = await admin
      .from("login_lockouts")
      .select("failed_attempts, locked_until")
      .eq("ip_address", ip)
      .eq("email", emailKey)
      .maybeSingle();

    let failedAttempts = existing?.failed_attempts ?? 0;
    const lockedUntil = existing?.locked_until ? new Date(existing.locked_until) : null;

    // Still inside an active lockout window — extend it and reject immediately,
    // without even attempting the real sign-in.
    if (lockedUntil && lockedUntil > now) {
      const extendedUntil = new Date(now.getTime() + LOCKOUT_MS);
      await admin.from("login_lockouts").upsert(
        { ip_address: ip, email: emailKey, failed_attempts: failedAttempts, locked_until: extendedUntil.toISOString(), updated_at: now.toISOString() },
        { onConflict: "ip_address,email" },
      );
      return new Response(
        JSON.stringify({
          error: "Too many failed sign-in attempts. Please try again in 15 minutes.",
          lockedUntil: extendedUntil.toISOString(),
        }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // A previous lockout has fully expired — start this IP fresh.
    if (lockedUntil && lockedUntil <= now) {
      failedAttempts = 0;
    }

    const anonClient = createClient(SUPABASE_URL, ANON_KEY);
    const { data: signInData, error: signInError } = await anonClient.auth.signInWithPassword({
      email: emailKey,
      password,
    });

    if (!signInError && signInData.session) {
      await admin.from("login_lockouts").upsert(
        { ip_address: ip, email: emailKey, failed_attempts: 0, locked_until: null, updated_at: now.toISOString() },
        { onConflict: "ip_address,email" },
      );
      return new Response(
        JSON.stringify({
          access_token: signInData.session.access_token,
          refresh_token: signInData.session.refresh_token,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Failed sign-in — increment the counter for this IP.
    failedAttempts += 1;
    const newLockedUntil = failedAttempts >= MAX_ATTEMPTS ? new Date(now.getTime() + LOCKOUT_MS) : null;

    await admin.from("login_lockouts").upsert(
      { ip_address: ip, email: emailKey, failed_attempts: failedAttempts, locked_until: newLockedUntil ? newLockedUntil.toISOString() : null, updated_at: now.toISOString() },
      { onConflict: "ip_address,email" },
    );

    if (newLockedUntil) {
      return new Response(
        JSON.stringify({
          error: "Too many failed sign-in attempts. Please try again in 15 minutes.",
          lockedUntil: newLockedUntil.toISOString(),
        }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        // Generic message: never echo Supabase's error (it can reveal
        // whether an email exists, e.g. "Email not confirmed").
        error: "Invalid email or password",
        attemptsRemaining: MAX_ATTEMPTS - failedAttempts,
      }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch {
    return new Response(JSON.stringify({ error: "Unexpected error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});