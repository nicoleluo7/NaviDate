import { z } from "zod";
import { criteriaSchema, type Plan } from "@/types";
import { generate } from "@/lib/planner/service";
import { getStorage } from "@/lib/storage";
import { randomId, hash } from "@/lib/storage/dates";
import { body, guard, session, failure } from "@/lib/api";
export type Draft = {
  ownerHash: string;
  criteria: z.infer<typeof criteriaSchema>;
  plans: Plan[];
  expires: number;
};
export async function POST(req: Request) {
  try {
    await guard(req);
    const data = z
      .object({
        criteria: criteriaSchema,
        seed: z.number().int().min(0).max(10000).optional(),
      })
      .parse(await body(req));
    const token = await session(true),
      result = await generate(data.criteria, { seed: data.seed }),
      draftId = randomId();
    await getStorage().put("draft:" + draftId, {
      ownerHash: hash(token),
      criteria: data.criteria,
      plans: result.plans,
      expires: Date.now() + 3600000,
    } satisfies Draft);
    return Response.json({ ...result, draftId });
  } catch (e) {
    return failure(e);
  }
}
