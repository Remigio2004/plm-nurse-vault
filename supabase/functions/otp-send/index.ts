import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const ORIGINS = [
  /^https:\/\/plm-nurse-vault\.vercel\.app$/,
  /^https:\/\/plm-nurse-vault-[a-z0-9-]+\.vercel\.app$/,
  /^http:\/\/localhost:\d+$/,
];
const cors = (o: string | null) => ({
  "Access-Control-Allow-Origin": o && ORIGINS.some((p) => p.test(o)) ? o : "",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  Vary: "Origin",
});
const json = (b: unknown, s: number, h: Record<string, string>) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...h, "Content-Type": "application/json" },
  });

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
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

Deno.serve(async (req) => {
  const h = cors(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response("ok", { headers: h });

  try {
    const token = (req.headers.get("authorization") ?? "").replace(/^Bearer /i, "");
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: u, error: uErr } = await admin.auth.getUser(token);
    const sessionId = sessionIdFromJwt(token);
    if (uErr || !u.user || !sessionId) return json({ error: "Unauthorized" }, 401, h);

    const body = (await req.json().catch(() => ({}))) as { device_token?: string };
    let staleToken = false;
    if (body.device_token) {
      const th = await sha256(`${Deno.env.get("OTP_PEPPER")}:device:${body.device_token}`);
      const { data: dev } = await admin
        .from("trusted_devices")
        .select("expires_at")
        .eq("token_hash", th)
        .eq("user_id", u.user.id)
        .eq("revoked", false)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();
      if (dev) {
        await admin.from("verified_sessions").upsert({
          session_id: sessionId,
          user_id: u.user.id,
          device_label: (req.headers.get("user-agent") ?? "").slice(0, 200),
          verified_at: new Date().toISOString(),
          expires_at: dev.expires_at,
          revoked: false,
        });
        return json({ trusted: true }, 200, h);
      }
      staleToken = true;
    }

    const now = Date.now();
    const { data: recent } = await admin
      .from("otp_codes")
      .select("created_at")
      .eq("user_id", u.user.id)
      .gte("created_at", new Date(now - 3600_000).toISOString())
      .order("created_at", { ascending: false });

    const last = recent?.[0] ? new Date(recent[0].created_at).getTime() : 0;
    if (now - last < 60_000) {
      return json(
        {
          error: "Please wait before requesting another code.",
          retryAfter: Math.ceil((60_000 - (now - last)) / 1000),
        },
        429,
        h,
      );
    }
    if ((recent?.length ?? 0) >= 10) {
      return json({ error: "Too many code requests. Try again in an hour." }, 429, h);
    }

    const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
    const codeHash = await sha256(`${Deno.env.get("OTP_PEPPER")}:${sessionId}:${code}`);

    // invalidate old codes for this session
    await admin
      .from("otp_codes")
      .update({ used_at: new Date().toISOString() })
      .eq("session_id", sessionId)
      .is("used_at", null);

    const { data: row, error: insErr } = await admin
      .from("otp_codes")
      .insert({
        user_id: u.user.id,
        session_id: sessionId,
        code_hash: codeHash,
        expires_at: new Date(now + 600_000).toISOString(),
      })
      .select("id")
      .single();
    if (insErr) return json({ error: "Could not create code" }, 500, h);

    const gmail = Deno.env.get("GMAIL_USER")!;
    const ua = req.headers.get("user-agent") ?? "unknown device";
    const when = new Date(now).toLocaleString("en-PH", { timeZone: "Asia/Manila" });
    const client = new SMTPClient({
      connection: {
        hostname: "smtp.gmail.com",
        port: 465,
        tls: true,
        auth: { username: gmail, password: Deno.env.get("GMAIL_APP_PASSWORD")! },
      },
    });
    try {
      await client.send({
        from: gmail,
        to: gmail, // fixed recipient: hindi kumukuha ng email mula sa request
        subject: `NurseVault verification code: ${code}`,
        content: `Your NurseVault verification code is ${code}\n\nExpires in 10 minutes.\n\nSign-in attempt: ${when} (PH)\nDevice: ${ua}\n\nIf this wasn't you, do not share this code and change the admin password.`,
      });
    } catch {
      await admin.from("otp_codes").delete().eq("id", row.id);
      return json({ error: "Could not send email. Try again." }, 502, h);
    } finally {
      try {
        await client.close();
      } catch {
        /* ignore */
      }
    }

    return json({ sent: true, clear_device_token: staleToken }, 200, h);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500, h);
  }
});
