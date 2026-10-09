import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

// Requests are only allowed from the production site, Vercel preview
// deployments for this project, and local dev. Any other origin gets no
// CORS header, so the browser blocks the response.
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
    Vary: "Origin",
  };
}

// Admin check is now driven by the admin_users table — no hardcoded UUIDs.
async function isAdmin(userId: string, admin: ReturnType<typeof createClient>): Promise<boolean> {
  const { data } = await admin.from("admin_users").select("user_id").eq("user_id", userId).maybeSingle();
  return data !== null;
}

const sessionIdFromJwt = (t: string): string | null => {
  try {
    const p = t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(p)).session_id ?? null;
  } catch {
    return null;
  }
};

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req.headers.get("origin"));

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await callerClient.auth.getUser();
    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: "Not signed in" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const user = userData.user;
    const sessionId = sessionIdFromJwt(authHeader.replace(/^Bearer /i, ""));

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    if (!(await isAdmin(user.id, admin))) {
      return new Response(JSON.stringify({ error: "Not authorized" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Enforce the OTP second step server-side, same as file-access.
    const { data: verified, error: verifiedErr } = sessionId
      ? await admin
          .from("verified_sessions")
          .select("session_id")
          .eq("session_id", sessionId)
          .eq("user_id", user.id)
          .eq("revoked", false)
          .gt("expires_at", new Date().toISOString())
          .maybeSingle()
      : { data: null, error: null };
    if (verifiedErr) console.error("verified_sessions lookup failed:", verifiedErr.message);
    if (!verified) {
      return new Response(JSON.stringify({ error: "Session not verified" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { studentName, studentNumber, fileName } = body as {
      studentName?: string;
      studentNumber?: string;
      fileName?: string;
    };

    if (!studentName || !studentNumber || !fileName) {
      return new Response(
        JSON.stringify({ error: "Missing studentName, studentNumber or fileName" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // admin (service-role) client above bypasses RLS/column grants so we
    // can check file_name without ever exposing it to the browser.

    const { data, error } = await admin
      .from("records")
      .select("id")
      .eq("student_name", studentName)
      .eq("student_number", studentNumber)
      .eq("file_name", fileName)
      .is("deleted_at", null)
      .limit(1);

    if (error) {
      console.error("duplicate check failed:", error.message);
      return new Response(JSON.stringify({ error: "Could not check duplicates" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ duplicate: (data?.length ?? 0) > 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch {
    return new Response(JSON.stringify({ error: "Unexpected error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
