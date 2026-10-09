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
  const { data } = await admin
    .from("admin_users")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  return data !== null;
}

async function sha1Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-1", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
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

    // Enforce the OTP second step server-side: the caller's session must be
    // present in verified_sessions, unrevoked, and unexpired. The React
    // route guard alone is not a security boundary.
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
      return new Response(JSON.stringify({ error: "Session not verified" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { recordId, action, newFileName } = body as {
      recordId: string;
      action: "open" | "unlock" | "rename" | "delete" | "restore" | "purge";
      newFileName?: string;
    };

    if (!recordId || !action) {
      return new Response(JSON.stringify({ error: "Missing recordId or action" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // "restore" and "purge" act on already soft-deleted records.
    if (action === "restore" || action === "purge") {
      const { data: row, error: fetchError } = await admin
        .from("records")
        .select(
          "id, student_name, student_number, storage_path, cloudinary_public_id, file_name, deleted_at",
        )
        .eq("id", recordId)
        .maybeSingle();
      if (fetchError) {
        console.error("restore/purge fetch failed:", fetchError.message);
        return new Response(JSON.stringify({ error: "Could not load record" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!row) {
        return new Response(JSON.stringify({ error: "Record not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!row.deleted_at) {
        return new Response(JSON.stringify({ error: "Record is not in Recently Deleted" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const summary = `${row.student_name} (${row.student_number})`;

      if (action === "restore") {
        const { error: updateError } = await admin
          .from("records")
          .update({ deleted_at: null })
          .eq("id", recordId);
        if (updateError) {
          console.error("restore failed:", updateError.message);
          return new Response(JSON.stringify({ error: "Could not restore record" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        await admin.from("audit_logs").insert({
          action: "restore",
          record_id: recordId,
          record_summary: summary,
          performed_by: user.id,
          performed_by_email: user.email ?? null,
          details: { file_name: row.file_name },
        });
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // action === "purge" — permanent removal
      if (row.cloudinary_public_id) {
        const CLOUD_NAME = Deno.env.get("CLOUDINARY_CLOUD_NAME")!;
        const API_KEY = Deno.env.get("CLOUDINARY_API_KEY")!;
        const API_SECRET = Deno.env.get("CLOUDINARY_API_SECRET")!;
        const timestamp = Math.floor(Date.now() / 1000).toString();
        const toSign = `public_id=${row.cloudinary_public_id}&timestamp=${timestamp}&type=authenticated`;
        const signature = await sha1Hex(toSign + API_SECRET);
        const destroyBody = new URLSearchParams({
          public_id: row.cloudinary_public_id,
          type: "authenticated",
          timestamp,
          api_key: API_KEY,
          signature,
        });
        const destroyRes = await fetch(
          `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/raw/destroy`,
          { method: "POST", body: destroyBody },
        );
        if (!destroyRes.ok) {
          const errBody = await destroyRes.text();
          return new Response(JSON.stringify({ error: `Cloudinary purge failed: ${errBody}` }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } else if (row.storage_path) {
        // Legacy records not yet migrated to Cloudinary.
        const { error: removeError } = await admin.storage
          .from("student-records")
          .remove([row.storage_path]);
        if (removeError) {
          console.error("storage remove failed:", removeError.message);
          return new Response(JSON.stringify({ error: "Could not remove file" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
      const { error: deleteError } = await admin.from("records").delete().eq("id", recordId);
      if (deleteError) {
        console.error("purge delete failed:", deleteError.message);
        return new Response(JSON.stringify({ error: "Could not delete record" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      await admin.from("audit_logs").insert({
        action: "purge",
        record_id: null,
        record_summary: summary,
        performed_by: user.id,
        performed_by_email: user.email ?? null,
        details: { file_name: row.file_name },
      });
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // All other actions (open/unlock/rename/delete) — no passkey required
    // anymore; the admin session itself is the only gate.
    const { data: fileInfo, error: fetchError } = await admin
      .from("records")
      .select(
        "id, student_name, student_number, storage_path, cloudinary_public_id, file_name, file_type, file_size, deleted_at",
      )
      .eq("id", recordId)
      .is("deleted_at", null)
      .maybeSingle();
    if (fetchError) {
      console.error("record fetch failed:", fetchError.message);
      return new Response(JSON.stringify({ error: "Could not load record" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!fileInfo) {
      return new Response(JSON.stringify({ error: "Record not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const summaryDetails = { file_name: fileInfo.file_name };
    const summary = `${fileInfo.student_name} (${fileInfo.student_number})`;

    if (action === "unlock") {
      await admin.from("audit_logs").insert({
        action: "unlock",
        record_id: recordId,
        record_summary: summary,
        performed_by: user.id,
        performed_by_email: user.email ?? null,
        details: summaryDetails,
      });
      return new Response(
        JSON.stringify({
          fileName: fileInfo.file_name,
          fileType: fileInfo.file_type,
          fileSize: fileInfo.file_size,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (action === "open") {
      let url: string;

      if (fileInfo.cloudinary_public_id) {
        const CLOUD_NAME = Deno.env.get("CLOUDINARY_CLOUD_NAME")!;
        const API_KEY = Deno.env.get("CLOUDINARY_API_KEY")!;
        const API_SECRET = Deno.env.get("CLOUDINARY_API_SECRET")!;
        const timestamp = Math.floor(Date.now() / 1000).toString();
        // Short-lived download link: without expires_at the signed URL stays
        // valid for ~1 hour; 5 minutes is plenty for the redirect.
        const expiresAt = (Math.floor(Date.now() / 1000) + 300).toString();
        const toSign = `expires_at=${expiresAt}&public_id=${fileInfo.cloudinary_public_id}&timestamp=${timestamp}&type=authenticated`;
        const signature = await sha1Hex(toSign + API_SECRET);
        url =
          `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/raw/download?` +
          `public_id=${encodeURIComponent(fileInfo.cloudinary_public_id)}` +
          `&expires_at=${expiresAt}&timestamp=${timestamp}&type=authenticated` +
          `&api_key=${API_KEY}&signature=${signature}`;
      } else {
        // Legacy fallback for records not yet migrated to Cloudinary.
        const { data: signed, error: signError } = await admin.storage
          .from("student-records")
          .createSignedUrl(fileInfo.storage_path, 60);
        if (signError) {
          console.error("signed url failed:", signError.message);
          return new Response(JSON.stringify({ error: "Could not open file" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        url = signed.signedUrl;
      }

      await admin.from("audit_logs").insert({
        action: "view",
        record_id: recordId,
        record_summary: summary,
        performed_by: user.id,
        performed_by_email: user.email ?? null,
        details: summaryDetails,
      });
      return new Response(JSON.stringify({ url }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "rename") {
      if (!newFileName || !newFileName.trim()) {
        return new Response(JSON.stringify({ error: "newFileName is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { error: updateError } = await admin
        .from("records")
        .update({ file_name: newFileName.trim() })
        .eq("id", recordId);
      if (updateError) {
        console.error("rename failed:", updateError.message);
        return new Response(JSON.stringify({ error: "Could not rename file" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      await admin.from("audit_logs").insert({
        action: "edit",
        record_id: recordId,
        record_summary: summary,
        performed_by: user.id,
        performed_by_email: user.email ?? null,
        details: { file_name: { from: fileInfo.file_name, to: newFileName.trim() } },
      });
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "delete") {
      // Soft delete only — the actual file stays in Storage untouched so it
      // can still be restored. Permanent removal happens via "purge".
      const { error: updateError } = await admin
        .from("records")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", recordId);
      if (updateError) {
        console.error("soft delete failed:", updateError.message);
        return new Response(JSON.stringify({ error: "Could not delete record" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      await admin.from("audit_logs").insert({
        action: "delete",
        record_id: recordId,
        record_summary: summary,
        performed_by: user.id,
        performed_by_email: user.email ?? null,
        details: summaryDetails,
      });
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("file-access unhandled error:", err);
    return new Response(JSON.stringify({ error: "Unexpected error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
