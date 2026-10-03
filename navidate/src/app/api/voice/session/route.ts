import { z } from "zod";
import { body, guard, session, failure, HttpError } from "@/lib/api";
import { criteriaSchema } from "@/types";
import { claimDaily } from "@/lib/integrations/quota";
import { naviSession } from "@/lib/voice/requirements";
export async function POST(req: Request) {
  try {
    await guard(req);
    await session(true);
    const { criteria } = z
      .object({ criteria: criteriaSchema })
      .parse(await body(req));
    if (
      !process.env.XAI_API_KEY ||
      process.env.DISABLE_EXTERNAL_APIS === "true"
    )
      throw new HttpError(
        503,
        "Navi voice isn’t connected. You can still use the form.",
      );
    await claimDaily(
      "Navi voice",
      process.env.XAI_VOICE_DAILY_SESSION_LIMIT,
      10,
    );
    const r = await fetch("https://api.x.ai/v1/realtime/client_secrets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.XAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ expires_after: { seconds: 60 } }),
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok)
      throw new HttpError(
        503,
        "Navi couldn’t connect. Check xAI voice access and credits, or use the form.",
      );
    const data = z
      .object({ value: z.string().min(1), expires_at: z.number() })
      .parse(await r.json());
    return Response.json(
      {
        token: data.value,
        expiresAt: data.expires_at,
        model: process.env.XAI_VOICE_MODEL || "grok-voice-latest",
        config: naviSession(criteria),
        maxSessionSeconds: 180,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
