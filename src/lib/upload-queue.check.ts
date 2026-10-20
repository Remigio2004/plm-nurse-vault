// Run: bun src/lib/upload-queue.check.ts
import assert from "node:assert/strict";
import { fetchAllPages } from "./fetch-all-pages";
import { retryUpload, runUploadQueue, UploadRequestError, uploadError } from "./upload-queue";

for (const length of [6, 20, 50]) {
  let active = 0;
  let peak = 0;
  const completed = new Set<number>();
  await runUploadQueue(
    Array.from({ length }, (_, i) => i),
    async (item) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 1));
      completed.add(item);
      active--;
    },
  );
  assert.equal(completed.size, length);
  assert.equal(peak, 3);
}

let attempts = 0;
assert.equal(
  await retryUpload(
    async () => {
      if (++attempts < 3) throw new UploadRequestError("Temporary failure", 502);
      return "saved";
    },
    async () => {},
  ),
  "saved",
);
assert.equal(attempts, 3);
attempts = 0;
await assert.rejects(
  retryUpload(
    async () => {
      attempts++;
      throw new UploadRequestError("Not authorized", 403);
    },
    async () => {},
  ),
  /Not authorized/,
);
assert.equal(attempts, 1);
const decoded = await uploadError({
  message: "Generic Edge error",
  context: new Response(JSON.stringify({ error: "Session not verified" }), { status: 403 }),
});
assert.equal(decoded.message, "Session not verified");
assert.equal(decoded.status, 403);

const source = Array.from({ length: 1501 }, (_, i) => i);
const fetched = await fetchAllPages<number>(async (from, to) => ({
  data: source.slice(from, to + 1),
  error: null,
}));
assert.deepEqual(fetched, source);
console.log("upload queue: batch sizes, concurrency, retries, error details and pagination passed");
