import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

// Same origin allowlist as the other edge functions — no wildcard CORS.
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
  const { data } = await admin
    .from("admin_users")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  return data !== null;
}

// Rate limiting: max uploads per minute per IP.
const UPLOAD_RATE_LIMIT = 10;
const UPLOAD_WINDOW_MS = 60_000;

function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return "unknown";
}

async function checkRateLimit(
  req: Request,
  admin: ReturnType<typeof createClient>,
): Promise<{ ok: true } | { ok: false; retryAfterSec: number }> {
  const ip = getClientIp(req);
  if (ip === "unknown") return { ok: true };

  const now = new Date();
  const { data: current } = await admin
    .from("rate_limits")
    .select("attempts, reset_at")
    .eq("key", ip)
    .eq("action", "upload")
    .maybeSingle();

  if (!current) {
    const resetAt = new Date(now.getTime() + UPLOAD_WINDOW_MS).toISOString();
    await admin
      .from("rate_limits")
      .insert({ key: ip, action: "upload", attempts: 1, reset_at: resetAt });
    return { ok: true };
  }

  const resetAt = new Date(current.reset_at);
  if (now > resetAt) {
    await admin.from("rate_limits").upsert(
      {
        key: ip,
        action: "upload",
        attempts: 1,
        reset_at: new Date(now.getTime() + UPLOAD_WINDOW_MS).toISOString(),
      },
      { onConflict: "key,action" },
    );
    return { ok: true };
  }

  if (current.attempts >= UPLOAD_RATE_LIMIT) {
    const retryAfterSec = Math.ceil((resetAt.getTime() - now.getTime()) / 1000);
    return { ok: false, retryAfterSec };
  }

  await admin
    .from("rate_limits")
    .update({ attempts: current.attempts + 1 })
    .eq("key", ip)
    .eq("action", "upload");
  return { ok: true };
}

const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB

async function sha1Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-1", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

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
    const CLOUD_NAME = Deno.env.get("CLOUDINARY_CLOUD_NAME")!;
    const API_KEY = Deno.env.get("CLOUDINARY_API_KEY")!;
    const API_SECRET = Deno.env.get("CLOUDINARY_API_SECRET")!;

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

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    if (!(await isAdmin(user.id, admin))) {
      return new Response(JSON.stringify({ error: "Not authorized" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rateCheck = await checkRateLimit(req, admin);
    if (!rateCheck.ok) {
      return new Response(
        JSON.stringify({
          error: "Too many uploads. Try again later.",
          retryAfter: rateCheck.retryAfterSec,
        }),
        {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const incoming = await req.formData();
    const file = incoming.get("file");
    if (!(file instanceof File)) {
      return new Response(JSON.stringify({ error: "Missing file" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Size cap — reject before reading further.
    if (file.size > MAX_FILE_BYTES) {
      return new Response(JSON.stringify({ error: "File exceeds the 20 MB limit" }), {
        status: 413,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Real PDF check: inspect magic bytes, not the extension. A renamed
    // .exe/.html must never reach storage as "records/xxx.pdf".
    const header = new Uint8Array(await file.slice(0, 5).arrayBuffer());
    const isPdf =
      header[0] === 0x25 && // %
      header[1] === 0x50 && // P
      header[2] === 0x44 && // D
      header[3] === 0x46 && // F
      header[4] === 0x2d; //  -
    if (!isPdf) {
      return new Response(JSON.stringify({ error: "Only PDF files are allowed" }), {
        status: 415,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const publicId = `records/${crypto.randomUUID()}.pdf`;
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const toSign = `public_id=${publicId}&timestamp=${timestamp}&type=authenticated`;
    const signature = await sha1Hex(toSign + API_SECRET);

    const uploadForm = new FormData();
    uploadForm.append("file", file, file.name);
    uploadForm.append("api_key", API_KEY);
    uploadForm.append("timestamp", timestamp);
    uploadForm.append("public_id", publicId);
    uploadForm.append("type", "authenticated");
    uploadForm.append("signature", signature);

    const uploadRes = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/raw/upload`, {
      method: "POST",
      body: uploadForm,
    });
    const uploadJson = await uploadRes.json().catch(() => null);

    if (!uploadRes.ok) {
      // Log details server-side, return a generic message to the client.
      console.error("Cloudinary upload failed:", uploadRes.status, uploadJson);
      return new Response(JSON.stringify({ error: "Upload failed. Try again." }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ publicId: uploadJson?.public_id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch {
    // Generic error — never echo internal messages to the client.
    return new Response(JSON.stringify({ error: "Unexpected error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
