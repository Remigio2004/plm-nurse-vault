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
    "Vary": "Origin",
  };
}

// Only these Supabase Auth user IDs may call this function.
// Keep in sync with file-access / check-duplicate / cloudinary-upload.
const ALLOWED_ADMIN_IDS = [
  "68a6a069-5220-481c-b36a-3cc478169a36",
  "13877d07-25dc-4c1a-8fa5-38a9eb2fdde5",
];

// The Master File dual-path boundary: anything larger must go to Storage.
const MAX_FILE_BYTES = 10 * 1024 * 1024;

async function sha1Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-1", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function requireVerifiedAdmin(
  authHeader: string,
  admin: ReturnType<typeof createClient>,
): Promise<{ id: string; email: string | null } | Response> {
  const callerClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await callerClient.auth.getUser();
  if (userError || !userData.user) {
    return new Response(JSON.stringify({ error: "Not signed in" }), { status: 401 });
  }
  const user = userData.user;
  if (!ALLOWED_ADMIN_IDS.includes(user.id)) {
    return new Response(JSON.stringify({ error: "Not authorized" }), { status: 403 });
  }

  // Enforce the OTP second step server-side: the caller's session must be
  // present in verified_sessions, unrevoked, and unexpired.
  let sessionId: string | null = null;
  try {
    const payload = authHeader.replace(/^Bearer /i, "").split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    sessionId = JSON.parse(atob(payload)).session_id ?? null;
  } catch {
    sessionId = null;
  }
  const { data: verified } = sessionId
    ? await admin
        .from("verified_sessions")
        .select("id")
        .eq("session_id", sessionId)
        .eq("user_id", user.id)
        .eq("revoked", false)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle()
    : { data: null };
  if (!verified) {
    return new Response(JSON.stringify({ error: "Session not verified" }), { status: 403 });
  }
  return { id: user.id, email: user.email ?? null };
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req.headers.get("origin"));

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const CLOUD_NAME = Deno.env.get("CLOUDINARY_CLOUD_NAME")!;
    const API_KEY = Deno.env.get("CLOUDINARY_API_KEY")!;
    const API_SECRET = Deno.env.get("CLOUDINARY_API_SECRET")!;

    // Service-role client — bypasses RLS. Blob locations never reach the
    // browser except as short-lived signed links.
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const authHeader = req.headers.get("Authorization") ?? "";
    const gate = await requireVerifiedAdmin(authHeader, admin);
    if (gate instanceof Response) {
      return new Response(await gate.text(), {
        status: gate.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const user = gate;

    const contentType = req.headers.get("content-type") ?? "";

    // ---------------------------------------------------------------
    // Multipart upload — Cloudinary path for Master File documents.
    // ---------------------------------------------------------------
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return new Response(JSON.stringify({ error: "Missing file" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (file.size > MAX_FILE_BYTES) {
        return new Response(JSON.stringify({ error: "File exceeds the 10 MB limit" }), {
          status: 413,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Real PDF check: inspect magic bytes, not the extension.
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

      const publicId = `students/${crypto.randomUUID()}.pdf`;
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
        console.error("student-docs Cloudinary upload failed:", uploadRes.status, uploadJson);
        return new Response(JSON.stringify({ error: "Upload failed. Try again." }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ publicId: uploadJson?.public_id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---------------------------------------------------------------
    // JSON actions: open (signed link) and delete-blob (cleanup).
    // ---------------------------------------------------------------
    const body = await req.json();
    const { action, documentId, cloudinaryPublicId, storagePath } = body as {
      action: "open" | "delete-blob";
      documentId?: string;
      cloudinaryPublicId?: string | null;
      storagePath?: string | null;
    };

    if (action === "delete-blob") {
      if (!cloudinaryPublicId && !storagePath) {
        return new Response(JSON.stringify({ error: "Nothing to delete" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (cloudinaryPublicId) {
        const timestamp = Math.floor(Date.now() / 1000).toString();
        const toSign = `public_id=${cloudinaryPublicId}&timestamp=${timestamp}&type=authenticated`;
        const signature = await sha1Hex(toSign + API_SECRET);
        const destroyBody = new URLSearchParams({
          public_id: cloudinaryPublicId,
          type: "authenticated",
          timestamp,
          api_key: API_KEY,
          signature,
        });
        const destroyRes = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/raw/destroy`, {
          method: "POST",
          body: destroyBody,
        });
        if (!destroyRes.ok) {
          console.error("student-docs Cloudinary destroy failed:", await destroyRes.text());
          return new Response(JSON.stringify({ error: "Could not delete file" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
      if (storagePath) {
        const { error: removeError } = await admin.storage
          .from("student-records")
          .remove([storagePath]);
        if (removeError) {
          console.error("student-docs storage remove failed:", removeError.message);
          return new Response(JSON.stringify({ error: "Could not delete file" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "open") {
      if (!documentId) {
        return new Response(JSON.stringify({ error: "Missing documentId" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: doc, error: fetchError } = await admin
        .from("student_documents")
        .select("id, file_name, cloudinary_public_id, storage_path, deleted_at, students(student_name)")
        .eq("id", documentId)
        .is("deleted_at", null)
        .maybeSingle();
      if (fetchError) {
        console.error("student-docs fetch failed:", fetchError.message);
        return new Response(JSON.stringify({ error: "Could not load document" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!doc) {
        return new Response(JSON.stringify({ error: "Document not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let url: string;
      if (doc.cloudinary_public_id) {
        const timestamp = Math.floor(Date.now() / 1000).toString();
        // Short-lived download link — 5 minutes is plenty for the redirect.
        const expiresAt = (Math.floor(Date.now() / 1000) + 300).toString();
        const toSign = `expires_at=${expiresAt}&public_id=${doc.cloudinary_public_id}&timestamp=${timestamp}&type=authenticated`;
        const signature = await sha1Hex(toSign + API_SECRET);
        url =
          `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/raw/download?` +
          `public_id=${encodeURIComponent(doc.cloudinary_public_id)}` +
          `&expires_at=${expiresAt}&timestamp=${timestamp}&type=authenticated` +
          `&api_key=${API_KEY}&signature=${signature}`;
      } else if (doc.storage_path) {
        const { data: signed, error: signError } = await admin.storage
          .from("student-records")
          .createSignedUrl(doc.storage_path, 60);
        if (signError) {
          console.error("student-docs signed url failed:", signError.message);
          return new Response(JSON.stringify({ error: "Could not open file" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        url = signed.signedUrl;
      } else {
        return new Response(JSON.stringify({ error: "Document has no file" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const studentName = (doc.students as { student_name: string } | null)?.student_name ?? "student";
      await admin.from("audit_logs").insert({
        action: "view",
        record_id: doc.id,
        record_summary: `${studentName} — ${doc.file_name}`,
        performed_by: user.id,
        performed_by_email: user.email,
        details: { module: "master-file", file_name: doc.file_name },
      });

      return new Response(JSON.stringify({ url }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("student-docs unhandled error:", err);
    return new Response(JSON.stringify({ error: "Unexpected error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
