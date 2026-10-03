import { z } from "zod";
import type { Draft } from "../plan/route";
import { getStorage } from "@/lib/storage";
import { isOwner } from "@/lib/storage/dates";
import { places } from "@/lib/data";
import { schedule } from "@/lib/planner";
import { body, guard, session, failure, HttpError } from "@/lib/api";
export async function POST(req: Request) {
  try {
    await guard(req);
    const input = z
      .object({
        draftId: z.string().max(80),
        planId: z.string().max(80),
        index: z.number().int().min(0).max(2),
      })
      .parse(await body(req));
    const store = getStorage(),
      draft = await store.get<Draft>("draft:" + input.draftId);
    if (!draft || draft.expires < Date.now())
      throw new HttpError(410, "Draft expired. Regenerate to continue.");
    if (!isOwner(draft, await session()))
      throw new HttpError(403, "This draft is read-only.");
    const old = draft.plans.find((p) => p.id === input.planId);
    if (!old || !old.stops[input.index])
      throw new HttpError(400, "Select a stop.");
    for (const p of places) {
      if (
        old.stops.some((s) => s.place.id === p.id) ||
        (draft.criteria.setting !== "any" &&
          p.indoorOutdoor !== draft.criteria.setting)
      )
        continue;
      const seq = old.stops.map((s, i) => (i === input.index ? p : s.place)),
        plan = await schedule(draft.criteria, seq, { weather: old.weather });
      if (plan) {
        draft.plans = draft.plans.map((p) => (p.id === old.id ? plan : p));
        await store.put("draft:" + input.draftId, draft);
        return Response.json({ plan });
      }
    }
    throw new HttpError(
      422,
      "No replacement fits these constraints. Try editing your preferences.",
    );
  } catch (e) {
    return failure(e);
  }
}
