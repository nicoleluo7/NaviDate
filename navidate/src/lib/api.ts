import { cookies } from "next/headers";
import { ZodError } from "zod";
import { hash, randomId } from "./storage/dates";
import { getStorage } from "./storage";
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function session(create = false) {
  const jar = await cookies();
  let token = jar.get("navidate_creator")?.value;
  if (!token && create) {
    token = randomId();
    jar.set("navidate_creator", token, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 90,
    });
  }
  return token ?? "";
}
export async function guard(req: Request) {
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin)
    throw new HttpError(403, "Open Navidate directly to make changes.");
  const store = getStorage(),
    minute = Math.floor(Date.now() / 60000);
  // Global cap protects the single-instance hackathon app without trusting spoofable IP headers.
  let allowed = false;
  for (let i = 0; i < 40; i++)
    if (await store.claim(`rate:${minute}:${i}`, true)) {
      allowed = true;
      break;
    }
  if (!allowed)
    throw new HttpError(
      429,
      "Lots of planning right now. Try again in a minute.",
    );
}
export async function body(req: Request) {
  if (Number(req.headers.get("content-length") ?? 0) > 16000)
    throw new HttpError(413, "Request is too large.");
  const text = await req.text();
  if (text.length > 16000) throw new HttpError(413, "Request is too large.");
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, "Send valid JSON.");
  }
}
export function failure(error: unknown) {
  if (error instanceof ZodError)
    return Response.json(
      {
        error:
          "Check your criteria: " +
          error.issues
            .map((i) => `${i.path.join(".")} ${i.message}`)
            .slice(0, 3)
            .join("; "),
      },
      { status: 400 },
    );
  if (error instanceof HttpError)
    return Response.json({ error: error.message }, { status: error.status });
  if (error instanceof Error && error.message.startsWith("Choose a valid"))
    return Response.json({ error: error.message }, { status: 400 });
  console.error(error);
  if (error instanceof Error && error.message.startsWith("Hosted Navidate"))
    return Response.json({ error: error.message }, { status: 500 });
  if (error instanceof Error && error.message === "Storage unavailable")
    return Response.json(
      {
        error:
          "Dates could not be stored. Confirm the Supabase table exists and both Supabase keys are set for Production, then redeploy.",
      },
      { status: 500 },
    );
  return Response.json(
    {
      error:
        "Something went wrong. Your inputs are preserved; please try again.",
    },
    { status: 500 },
  );
}
export { hash };
