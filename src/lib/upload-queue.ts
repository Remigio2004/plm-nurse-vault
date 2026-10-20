export class UploadRequestError extends Error {
  constructor(
    message: string,
    readonly status = 0,
    readonly retryAfterMs = 0,
  ) {
    super(message);
    this.name = "UploadRequestError";
  }
}

export async function uploadError(error: unknown): Promise<UploadRequestError> {
  if (error instanceof UploadRequestError) return error;
  const value = error as {
    message?: string;
    context?: Response;
    statusCode?: string;
    code?: string;
  };
  let message = value?.message ?? "Upload failed. Please try again.";
  let status = Number(value?.statusCode) || 0;
  let retryAfterMs = 0;
  if (value?.context instanceof Response) {
    status = value.context.status;
    try {
      const body = await value.context.clone().json();
      if (typeof body.error === "string") message = body.error;
      retryAfterMs =
        Number(body.retryAfter ?? value.context.headers.get("Retry-After")) * 1000 || 0;
    } catch {
      /* Preserve the original error if the server did not return JSON. */
    }
  }
  if (value?.code?.startsWith("23")) status = 400;
  if (value?.code === "42501") status = 403;
  return new UploadRequestError(message, status, retryAfterMs);
}

export async function retryUpload<T>(
  operation: () => Promise<T>,
  wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await operation();
    } catch (error) {
      const failure = await uploadError(error);
      if (attempt >= 2 || (failure.status > 0 && failure.status !== 429 && failure.status < 500))
        throw failure;
      await wait(Math.max(failure.retryAfterMs, 1000 * 2 ** attempt) + Math.random() * 250);
    }
  }
}

/** The queue has no length cap; only simultaneous network work is bounded. */
export async function runUploadQueue<T>(
  items: readonly T[],
  upload: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(3, items.length) }, async () => {
      while (next < items.length) {
        const item = items[next++];
        if (item !== undefined) await upload(item);
      }
    }),
  );
}
