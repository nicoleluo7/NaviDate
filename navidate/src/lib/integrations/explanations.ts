import { z } from "zod";
import type { Plan } from "@/types";
import { request } from "./xai";
export async function explainValidPlans(plans: Plan[]) {
  const schema = z.object({
    descriptions: z
      .array(
        z.object({
          id: z.string(),
          title: z.string().min(1).max(70),
          explanation: z.string().min(1).max(240),
        }),
      )
      .max(3),
  });
  const response = await request(
    schema,
    "Write short, warm date titles and descriptions for these already validated plans. Output {descriptions:[{id,title,explanation}]}. Use only the given plan IDs. Describe the mood and activity combination, without making promises about availability, food, prices, times, or routes.",
    plans.map((p) => ({
      id: p.id,
      stops: p.stops.map((s) => ({
        name: s.place.name,
        category: s.place.category,
      })),
    })),
  );
  if (response.descriptions.some((d) => !plans.some((p) => p.id === d.id)))
    throw new Error("Unknown plan ID");
  return plans.map((p) => {
    const d = response.descriptions.find((d) => d.id === p.id);
    return d ? { ...p, title: d.title, explanation: d.explanation } : p;
  });
}
