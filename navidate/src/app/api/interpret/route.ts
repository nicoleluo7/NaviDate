import { z } from "zod";
import { interpret } from "@/lib/integrations/xai";
import { body, guard, failure, HttpError } from "@/lib/api";
export async function POST(req: Request) {
  try {
    await guard(req);
    if (!process.env.XAI_API_KEY)
      throw new HttpError(
        503,
        "Text interpretation is unavailable. Use the form below.",
      );
    const { text } = z
      .object({ text: z.string().min(1).max(1000) })
      .parse(await body(req));
    return Response.json(await interpret(text));
  } catch (e) {
    return failure(e);
  }
}
