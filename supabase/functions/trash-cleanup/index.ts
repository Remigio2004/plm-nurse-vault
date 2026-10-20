import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const ORIGINS = [
  /^https:\/\/plm-nurse-vault\.vercel\.app$/,
  /^https:\/\/plm-nurse-vault-[a-z0-9-]+\.vercel\.app$/,
  /^http:\/\/localhost:\d+$/,
];
const sha1 = async (value: string) =>
  [...new Uint8Array(await crypto.subtle.digest("SHA-1", new TextEncoder().encode(value)))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const cors = {
    "Access-Control-Allow-Origin": origin && ORIGINS.some((p) => p.test(origin)) ? origin : "",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    Vary: "Origin",
  };
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const schedulerToken = req.headers.get("x-cleanup-token");
    let authorized = false;
    if (schedulerToken) {
      const { data, error } = await admin.rpc("authorize_trash_cleanup", {
        p_token: schedulerToken,
      });
      if (error) throw error;
      authorized = data === true;
    } else {
      const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer /i, "");
      const { data, error } = await admin.auth.getUser(token);
      if (!error && data.user) {
        const { data: member } = await admin
          .from("admin_users")
          .select("user_id")
          .eq("user_id", data.user.id)
          .maybeSingle();
        let session: string | null = null;
        try {
          session =
            JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")))
              .session_id ?? null;
        } catch {
          /* Invalid JWT cannot be authorized. */
        }
        const { data: verified } = session
          ? await admin
              .from("verified_sessions")
              .select("session_id")
              .eq("session_id", session)
              .eq("user_id", data.user.id)
              .eq("revoked", false)
              .gt("expires_at", new Date().toISOString())
              .maybeSingle()
          : { data: null };
        authorized = !!member && !!verified;
      }
    }
    if (!authorized)
      return json({ error: "A verified admin session or valid scheduler token is required" }, 403);
    const { data: purged, error: purgeError } = await admin.rpc("purge_expired_trash");
    if (purgeError) throw purgeError;
    const { data: jobs, error: jobsError } = await admin
      .from("storage_cleanup_jobs")
      .select("id,cloudinary_public_id,storage_path,attempts")
      .lte("next_attempt_at", new Date().toISOString())
      .order("created_at")
      .limit(50);
    if (jobsError) throw jobsError;
    let next = 0;
    let cleaned = 0;
    let failed = 0;
    await Promise.all(
      Array.from({ length: Math.min(3, jobs.length) }, async () => {
        while (next < jobs.length) {
          const job = jobs[next++];
          try {
            for (const column of ["cloudinary_public_id", "storage_path"] as const) {
              const location = job[column];
              if (!location) continue;
              // Old records can share a legacy blob path. Never remove a blob
              // while ANY live or restorable row still refers to it.
              let referenced = false;
              for (const table of ["student_documents", "records"]) {
                const { data: references, error } = await admin
                  .from(table)
                  .select("id")
                  .eq(column, location)
                  .limit(1);
                if (error) throw error;
                if (references.length) referenced = true;
              }
              if (referenced) continue;
              if (column === "storage_path") {
                const { error } = await admin.storage.from("student-records").remove([location]);
                if (error) throw error;
              } else {
                const timestamp = Math.floor(Date.now() / 1000).toString();
                const signature = await sha1(
                  `public_id=${location}&timestamp=${timestamp}&type=authenticated${Deno.env.get("CLOUDINARY_API_SECRET")!}`,
                );
                const response = await fetch(
                  `https://api.cloudinary.com/v1_1/${Deno.env.get("CLOUDINARY_CLOUD_NAME")!}/raw/destroy`,
                  {
                    method: "POST",
                    body: new URLSearchParams({
                      public_id: location,
                      type: "authenticated",
                      timestamp,
                      api_key: Deno.env.get("CLOUDINARY_API_KEY")!,
                      signature,
                    }),
                  },
                );
                const result = await response.json();
                if (!response.ok || !["ok", "not found"].includes(result.result))
                  throw new Error(`Cloudinary cleanup failed (${response.status})`);
              }
            }
            const { error } = await admin.from("storage_cleanup_jobs").delete().eq("id", job.id);
            if (error) throw error;
            cleaned++;
          } catch (error) {
            failed++;
            console.error("Storage cleanup job failed", job.id, error);
            await admin
              .from("storage_cleanup_jobs")
              .update({
                attempts: job.attempts + 1,
                next_attempt_at: new Date(
                  Date.now() + Math.min(3600_000, 60_000 * 2 ** Math.min(job.attempts, 6)),
                ).toISOString(),
                last_error: error instanceof Error ? error.message : "Provider cleanup failed",
              })
              .eq("id", job.id);
          }
        }
      }),
    );
    return json({ purged, cleaned, failed });
  } catch (error) {
    console.error("Trash cleanup failed", error);
    return json({ error: "Cleanup could not finish. Scheduled retries will continue." }, 500);
  }
});
