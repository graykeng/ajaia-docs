/** Browser-side fetch helper: JSON in, JSON out, errors as ApiError with the server's message. */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public data: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export async function api<T = unknown>(
  url: string,
  init: { method?: string; json?: unknown; body?: BodyInit; keepalive?: boolean } = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: init.method ?? (init.json !== undefined || init.body ? "POST" : "GET"),
      headers: init.json !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
      keepalive: init.keepalive,
    });
  } catch {
    throw new ApiError(0, "Network error. Check your connection and try again.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? "Something went wrong.", data);
  return data as T;
}
