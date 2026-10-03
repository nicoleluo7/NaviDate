import { z } from "zod";
import type { Draft } from "../plan/route";
import { getStorage } from "@/lib/storage";
import { isOwner } from "@/lib/storage/dates";
import { replaceStop } from "@/lib/planner";
import { createPlannerRouter } from "@/lib/maps/routes";
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
    const replaced = await replaceStop(
      draft.plans,
      input.planId,
      input.index,
      draft.criteria,
      { router: createPlannerRouter(draft.criteria.transport) },
    );
    if (!replaced || !("plan" in replaced))
      throw new HttpError(
        422,
        replaced && "duplicate" in replaced
          ? "The only other place that fits is already one of your options. Try a different stop, or regenerate."
          : "No replacement fits these constraints. Try editing your preferences.",
      );
    draft.plans = replaced.plans;
    await store.put("draft:" + input.draftId, draft);
    return Response.json({ plan: replaced.plan });
  } catch (e) {
    return failure(e);
  }
}
