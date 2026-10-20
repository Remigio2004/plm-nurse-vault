// Run: bun src/lib/revisions-live.check.ts
// Requires Supabase CLI login. Uses a temporary admin/session and removes fixtures
// in finally; API keys are never logged and the temporary browser profile is removed.
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { rm } from "node:fs/promises";
import { createClient, type Session } from "@supabase/supabase-js";
import { runUploadQueue, retryUpload } from "./upload-queue";

const url = process.env["VITE_SUPABASE_URL"] ?? "https://ucxedbkdbareljsvbzee.supabase.co";
const ref = new URL(url).hostname.split(".")[0]!;
const args = ["projects", "api-keys", "--project-ref", ref, "--output", "json"];
const keys = JSON.parse(
  process.platform === "win32"
    ? execFileSync("cmd.exe", ["/d", "/s", "/c", `supabase ${args.join(" ")}`], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      })
    : execFileSync("supabase", args, { encoding: "utf8" }),
) as { name: string; api_key: string }[];
const anon = keys.find((key) => key.name === "anon")?.api_key;
const service = keys.find((key) => key.name === "service_role")?.api_key;
assert.ok(anon && service, "CLI did not return the project's legacy API keys");
const admin = createClient(url, service, { auth: { persistSession: false } });
process.env["SUPABASE_URL"] = url;
process.env["SUPABASE_PUBLISHABLE_KEY"] = anon;
const api = await import("./students-api");
const { supabase } = await import("../integrations/supabase/client");
const fixture = crypto.randomUUID();
const email = `revision-${fixture}@example.com`;
const password = `Revision-${crypto.randomUUID()}!`;
const name = `Revisioncheck${fixture.replaceAll("-", "")}, Test`;
const folderIds: string[] = [];
let userId: string | undefined;
let session: Session | null = null;
const pdf =
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 0/Kids[]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF";

async function checked<T extends { data: unknown; error: { message: string } | null }>(
  operation: PromiseLike<T>,
): Promise<T["data"]> {
  const { data, error } = await operation;
  if (error) throw new Error(error.message);
  return data;
}

async function browserCheck(studentId: string, removeAndRestore?: () => Promise<string>) {
  const profile = `C:\\Users\\USER\\AppData\\Local\\Temp\\opencode\\revision-browser-${fixture}`;
  const server = spawn(
    process.execPath.includes("bun") ? "node" : process.execPath,
    [".output/server/index.mjs"],
    { env: { ...process.env, PORT: "4317", HOST: "127.0.0.1" }, stdio: "ignore" },
  );
  const chrome = spawn(
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "--remote-debugging-port=9337",
      `--user-data-dir=${profile}`,
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  let socket: WebSocket | undefined;
  let closeBrowser: (() => void) | undefined;
  let stage = "browser initialization";
  try {
    const waitFor = async <T>(
      probe: () => Promise<T>,
      accepts: (value: T) => boolean,
      timeout = 90_000,
    ): Promise<T> => {
      const deadline = Date.now() + timeout;
      while (Date.now() < deadline) {
        try {
          const result = await probe();
          if (accepts(result)) return result;
        } catch {
          /* Wait for server/browser initialization. */
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      throw new Error("Browser verification timed out");
    };
    await waitFor(
      () => fetch("http://127.0.0.1:4317"),
      (r) => r.ok,
    );
    const page = await waitFor(
      () =>
        fetch("http://127.0.0.1:9337/json/new?about:blank", { method: "PUT" }).then((r) =>
          r.json(),
        ),
      (r) => !!r.webSocketDebuggerUrl,
    );
    socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise<void>((resolve, reject) => {
      socket!.addEventListener("open", () => resolve());
      socket!.addEventListener("error", () => reject(new Error("Browser debugger unavailable")));
    });
    let nextId = 0;
    const callbacks = new Map<
      number,
      { resolve: (value: unknown) => void; reject: (reason: Error) => void }
    >();
    const exceptions: string[] = [];
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id) {
        const callback = callbacks.get(message.id);
        callbacks.delete(message.id);
        if (message.error) callback?.reject(new Error(message.error.message));
        else callback?.resolve(message.result);
      }
      if (message.method === "Runtime.exceptionThrown")
        exceptions.push(message.params.exceptionDetails.text);
    });
    const command = (method: string, params = {}) =>
      new Promise<unknown>((resolve, reject) => {
        const id = ++nextId;
        callbacks.set(id, { resolve, reject });
        socket!.send(JSON.stringify({ id, method, params }));
      });
    closeBrowser = () => socket?.send(JSON.stringify({ id: ++nextId, method: "Browser.close" }));
    const evaluate = async (expression: string) => {
      const result = (await command("Runtime.evaluate", {
        expression,
        returnByValue: true,
        awaitPromise: true,
      })) as { result: { value: unknown }; exceptionDetails?: unknown };
      if (result.exceptionDetails) throw new Error("Browser evaluation failed");
      return result.result.value;
    };
    const text = () => evaluate("document.body.innerText") as Promise<string>;
    await command("Runtime.enable");
    await command("Page.enable");
    await command("Page.setInterceptFileChooserDialog", { enabled: true });
    await command("Page.addScriptToEvaluateOnNewDocument", {
      source: `localStorage.setItem(${JSON.stringify(`sb-${ref}-auth-token`)}, ${JSON.stringify(JSON.stringify(session))});`,
    });
    await command("Page.navigate", {
      url: `http://localhost:4317/upload?student=${encodeURIComponent(name)}`,
    });
    stage = "batch upload";
    await waitFor(text, (body) => body.includes("Enrollment Adjustment Record"));
    await evaluate(
      `Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Add PDFs') && b.parentElement.textContent.includes('Enrollment Adjustment Record')).click(); const dt = new DataTransfer(); for(let i=0;i<3;i++) dt.items.add(new File([${JSON.stringify(pdf)}], 'browser-check-'+i+'.pdf', {type:'application/pdf'})); const picker = document.querySelector('input[type=file]'); picker.files = dt.files; picker.dispatchEvent(new Event('change',{bubbles:true}));`,
    );
    await waitFor(text, (body) => body.includes("Upload queue (3 files)"));
    await evaluate("document.querySelector('form button[type=submit]').click()");
    await waitFor(text, (body) => body.includes("3 uploaded · 0 remaining"));
    stage = "student attachments";
    await command("Page.navigate", { url: `http://localhost:4317/master-file/${studentId}` });
    await waitFor(text, (body) => body.includes(name));
    await waitFor(
      () =>
        evaluate(
          "Array.from(document.querySelectorAll('h3')).filter(h => h.textContent==='Enrollment Adjustment Record').length",
        ),
      (count) => Number(count) >= 9,
    );
    if (removeAndRestore) {
      stage = "Recently Deleted and restore";
      const fileName = await removeAndRestore();
      await command("Page.navigate", { url: "http://localhost:4317/activity" });
      await waitFor(text, (body) => body.includes("Recently Deleted"));
      const tabPoint = (await evaluate(
        "const tab = Array.from(document.querySelectorAll('[role=tab]')).find(b=>b.textContent==='Recently Deleted'); tab.scrollIntoView(); const rect=tab.getBoundingClientRect(); ({x:rect.x+rect.width/2,y:rect.y+rect.height/2})",
      )) as { x: number; y: number };
      await command("Input.dispatchMouseEvent", {
        type: "mousePressed",
        button: "left",
        clickCount: 1,
        ...tabPoint,
      });
      await command("Input.dispatchMouseEvent", {
        type: "mouseReleased",
        button: "left",
        clickCount: 1,
        ...tabPoint,
      });
      await waitFor(text, (body) => body.includes(fileName));
      await waitFor(
        () =>
          evaluate(
            `Array.from(document.querySelectorAll('li')).some(li=>li.textContent.includes(${JSON.stringify(fileName)}) && Array.from(li.querySelectorAll('button')).some(b=>b.textContent.trim()==='Restore'))`,
          ),
        (ready) => ready === true,
      );
      await evaluate(
        `Array.from(document.querySelectorAll('li')).find(li=>li.textContent.includes(${JSON.stringify(fileName)}) && Array.from(li.querySelectorAll('button')).some(b=>b.textContent.trim()==='Restore')).querySelector('button').click()`,
      );
      await waitFor(text, (body) => !body.includes(fileName));
    }
    assert.deepEqual(exceptions, [], "Browser reported an uncaught runtime error");
    console.log(
      "PASS: browser multi-select, 3-file upload, multiple attachments rendered, Recently Deleted and Restore button",
    );
  } catch (error) {
    console.error(`Browser check failed during ${stage}`);
    throw error;
  } finally {
    closeBrowser?.();
    await new Promise((resolve) => setTimeout(resolve, 1000));
    if (process.platform === "win32" && chrome.exitCode === null && chrome.pid) {
      try {
        execFileSync("taskkill", ["/PID", String(chrome.pid), "/T", "/F"], { stdio: "ignore" });
      } catch {
        /* Chrome may have exited between checking its status and taskkill. */
      }
    }
    socket?.close();
    chrome.kill();
    server.kill();
    await removeBrowserProfile(profile);
  }
}

async function removeBrowserProfile(profile: string) {
  for (let attempt = 0; ; attempt++) {
    try {
      await rm(profile, { recursive: true, force: true });
      return;
    } catch (error) {
      if (attempt >= 20) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
}

try {
  const user = await checked(admin.auth.admin.createUser({ email, password, email_confirm: true }));
  userId = user.user?.id;
  assert.ok(userId);
  await checked(admin.from("admin_users").insert({ user_id: userId, email, role: "admin" }));
  const signed = await checked(supabase.auth.signInWithPassword({ email, password }));
  session = signed.session;
  assert.ok(session);
  const sessionId = JSON.parse(
    Buffer.from(session.access_token.split(".")[1]!, "base64url").toString(),
  ).session_id;
  await checked(
    admin.from("verified_sessions").upsert({
      session_id: sessionId,
      user_id: userId,
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
      revoked: false,
    }),
  );
  const source = await api.createStudent({
    studentName: name,
    batch: "2026",
    classification: "CN Honorable Dismissal",
  });
  folderIds.push(source.id);
  const small = new File([pdf], "check.pdf", { type: "application/pdf" });
  const uploaded: Awaited<ReturnType<typeof api.uploadDocument>>[] = [];
  await runUploadQueue(
    Array.from({ length: 6 }, () => crypto.randomUUID()),
    async (uploadId) => {
      uploaded.push(
        await retryUpload(() =>
          api.uploadDocument({
            studentId: source.id,
            studentName: name,
            documentType: "EnrollmentAdjustmentRecord",
            file: small,
            uploadId,
          }),
        ),
      );
    },
  );
  assert.equal(uploaded.length, 6);
  const again = await api.uploadDocument({
    studentId: source.id,
    studentName: name,
    documentType: "EnrollmentAdjustmentRecord",
    file: small,
    uploadId: uploaded[0]!.id,
  });
  assert.equal(again.id, uploaded[0]!.id);
  const large = new File([pdf, new Uint8Array(11 * 1024 * 1024)], "large-check.pdf", {
    type: "application/pdf",
  });
  const largeDoc = await api.uploadDocument({
    studentId: source.id,
    studentName: name,
    documentType: "Others",
    file: large,
  });
  assert.ok(largeDoc.storagePath);
  const replacement = await api.replaceDocument({
    document: largeDoc,
    studentName: name,
    file: large,
  });
  assert.notEqual(replacement.storagePath, largeDoc.storagePath);
  const blob = await checked(
    admin.storage.from("student-records").download(replacement.storagePath!),
  );
  assert.ok(blob);
  assert.equal(blob.size, large.size);
  const link = await checked(
    supabase.functions.invoke("student-docs", {
      body: { action: "open", documentId: uploaded[0]!.id },
    }),
  );
  assert.equal((await fetch(link.url)).status, 200);
  console.log(
    "PASS: six actual Cloudinary uploads, idempotent retry, >10 MB Storage upload/replacement and signed PDF access",
  );
  await browserCheck(source.id, async () => {
    await api.removeDocument(uploaded[0]!);
    return uploaded[0]!.fileName;
  });
  let students = await api.fetchStudentsWithRequirements();
  const before = students.find((s) => s.id === source.id)!;
  assert.equal(before.documents.length, 10);
  await api.removeDocument(uploaded[0]!);
  await api.deleteStudent(before);
  assert.ok(
    (await api.fetchStudentTrash()).some(
      (entry) => entry.kind === "student" && entry.id === source.id,
    ),
  );
  const target = await api.createStudent({
    studentName: name,
    batch: "2026",
    classification: "CN Honorable Dismissal",
  });
  folderIds.push(target.id);
  await api.uploadDocument({
    studentId: target.id,
    studentName: name,
    documentType: "EnrollmentAdjustmentRecord",
    file: small,
  });
  assert.equal(
    await api.manageStudentTrash({ action: "restore", id: source.id, kind: "student" }),
    target.id,
  );
  students = await api.fetchStudentsWithRequirements();
  assert.equal(students.filter((s) => s.studentName === name).length, 1);
  assert.equal(students.find((s) => s.id === target.id)!.documents.length, 10);
  await api.restoreDocument(uploaded[0]!.id);
  students = await api.fetchStudentsWithRequirements();
  assert.equal(students.find((s) => s.id === target.id)!.documents.length, 11);
  await api.deleteStudent(students.find((s) => s.id === target.id)!);
  await api.manageStudentTrash({ action: "purge", id: target.id, kind: "student" });
  await checked(supabase.functions.invoke("trash-cleanup", { body: {} }));
  const remaining = await checked(
    admin.from("student_documents").select("id").in("student_id", folderIds),
  );
  assert.ok(remaining);
  assert.equal(remaining.length, 0);
  console.log(
    "PASS: live trash listing, folder merge without duplicates, individual restore and permanent deletion",
  );
} finally {
  if (folderIds.length) await checked(admin.from("students").delete().in("id", folderIds));
  if (session) await supabase.functions.invoke("trash-cleanup", { body: {} });
  if (userId) {
    await checked(admin.from("audit_logs").delete().eq("performed_by", userId));
    await checked(admin.auth.admin.deleteUser(userId));
  }
  await supabase.auth.signOut();
  console.log("Temporary live-check account, student folders and audit fixtures removed");
}
