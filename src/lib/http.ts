import { ZodError } from "zod";

/** An error with an HTTP status that is safe to show to the client. */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public extra?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export function errorResponse(e: unknown): Response {
  if (e instanceof HttpError) {
    return Response.json({ error: e.message, ...e.extra }, { status: e.status });
  }
  if (e instanceof ZodError) {
    return Response.json({ error: e.issues[0]?.message ?? "Invalid request." }, { status: 400 });
  }
  console.error(e);
  return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new HttpError(400, "Request body must be valid JSON.");
  }
}
