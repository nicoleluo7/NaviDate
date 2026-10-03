import { z } from "zod";
import { criteriaSchema } from "@/types";
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
    const { text, existing } = z
      .object({
        text: z.string().min(1).max(1000),
        existing: criteriaSchema.partial().optional(),
      })
      .parse(await body(req));
    return Response.json(await interpret(text, existing));
  } catch (e) {
    return failure(e);
  }
}
