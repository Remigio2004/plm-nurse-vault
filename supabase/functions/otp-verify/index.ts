import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const ORIGINS = [
  /^https:\/\/plm-nurse-vault\.vercel\.app$/,
  /^https:\/\/plm-nurse-vault-[a-z0-9-]+\.vercel\.app$/,
  /^http:\/\/localhost:\d+$/,
];
const cors = (o: string | null) => ({
  "Access-Control-Allow-Origin": o && ORIGINS.some((p) => p.test(o)) ? o : "",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Vary": "Origin",
});
const json = (b: unknown, s: number, h: Record<string, string>) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...h, "Content-Type": "application/json" } });

const sessionIdFromJwt = (t: string): string | null => {
  try {
    const p = t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(p)).session_id ?? null;
  } catch {
    return null;
  }
};
const sha256 = async (s: string) =>
  [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))]
    .map((b) => b.toString(16).padStart(2, "0")).join("");

const MAX_ATTEMPTS = 5;
const TRUST_MS = 7 * 24 * 3600_000;

Deno.serve(async (req) => {
  const h = cors(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response("ok", { headers: h });

  try {
    const token = (req.headers.get("authorization") ?? "").replace(/^Bearer /i, "");
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: u, error: uErr } = await admin.auth.getUser(token);
    const sessionId = sessionIdFromJwt(token);
    if (uErr || !u.user || !sessionId) return json({ error: "Unauthorized" }, 401, h);

    const { code } = (await req.json()) as { code?: string };
    if (!code || !/^\d{6}$/.test(code)) return json({ error: "Enter the 6-digit code." }, 400, h);

    const { data: current } = await admin.from("otp_codes").select("*")
      .eq("session_id", sessionId).is("used_at", null)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();

    if (!current || new Date(current.expires_at).getTime() < Date.now()) {
      return json({ error: "Code expired. Request a new one." }, 400, h);
    }

    const hash = await sha256(`${Deno.env.get("OTP_PEPPER")}:${sessionId}:${code}`);

    // Atomically claim one guess with optimistic locking: the update only
    // succeeds if attempts hasn't changed since we read it, so concurrent
    // requests can never squeeze in more guesses than MAX_ATTEMPTS total.
    let row = current;
    let claimed = false;
    for (let i = 0; i < 3 && !claimed; i++) {
      if (row.attempts >= MAX_ATTEMPTS) {
        return json({ error: "Too many wrong attempts. Request a new code." }, 429, h);
      }
      const { data: claimedRow } = await admin
        .from("otp_codes")
        .update({ attempts: row.attempts + 1 })
        .eq("id", row.id)
        .eq("attempts", row.attempts)
        .select("attempts")
        .maybeSingle();
      if (claimedRow) {
        row = { ...row, attempts: (claimedRow as { attempts: number }).attempts };
        claimed = true;
        break;
      }
      // Someone else claimed first — re-read and retry with the new value.
      const { data: refreshed } = await admin.from("otp_codes").select("*")
        .eq("id", row.id).maybeSingle();
      if (!refreshed) break;
      row = refreshed;
    }
    if (!claimed) {
      return json({ error: "Too many wrong attempts. Request a new code." }, 429, h);
    }

    if (hash !== row.code_hash) {
      return json({ error: "Incorrect code.", attemptsRemaining: MAX_ATTEMPTS - row.attempts }, 400, h);
    }

    await admin.from("otp_codes").update({ used_at: new Date().toISOString() }).eq("id", row.id);
    const expiresAt = new Date(Date.now() + TRUST_MS).toISOString();
    const { error: upErr } = await admin.from("verified_sessions").upsert({
      session_id: sessionId,
      user_id: u.user.id,
      device_label: (req.headers.get("user-agent") ?? "").slice(0, 200),
      verified_at: new Date().toISOString(),
      expires_at: expiresAt,
      revoked: false,
    });
    if (upErr) return json({ error: "Could not save verification" }, 500, h);

    const deviceToken = [...crypto.getRandomValues(new Uint8Array(32))]
      .map((b) => b.toString(16).padStart(2, "0")).join("");
    await admin.from("trusted_devices").insert({
      user_id: u.user.id,
      token_hash: await sha256(`${Deno.env.get("OTP_PEPPER")}:device:${deviceToken}`),
      device_label: (req.headers.get("user-agent") ?? "").slice(0, 200),
      expires_at: expiresAt,
    });
    return json({ verified: true, expiresAt, deviceToken }, 200, h);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500, h);
  }
});