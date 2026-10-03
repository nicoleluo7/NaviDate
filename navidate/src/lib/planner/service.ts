import { criteriaSchema } from "@/types";
import { getWeather } from "@/lib/integrations/weather";
import { planDates, type PlannerOptions } from ".";
import { geminiConfigured, googleMapsServerKey } from "@/lib/maps/config";
import { createWalkingRouter } from "@/lib/routing";
import { planWithGemini } from "./gemini";
export async function generate(input: unknown, options: PlannerOptions = {}) {
  const c = criteriaSchema.parse(input),
    weather = options.weather ?? (await getWeather(c));
  if (geminiConfigured() && googleMapsServerKey()) {
    try {
      return await planWithGemini(c, { ...options, weather });
    } catch (e) {
      return {
        plans: [],
        ai: false,
        notices: [],
        error:
          e instanceof Error && /^(Google Places|Gemini)/.test(e.message)
            ? e.message
            : "Recommendations are unavailable. Please retry.",
      };
    }
  }
  // Local mode is an explicit fallback; it never spends Grok credits on recommendations.
  const result = await planDates(c, {
    ...options,
    weather,
    router: options.router ?? createWalkingRouter(),
  });
  result.notices.unshift(
    "Local suggestions · Gemini and Google Places are not both available. These options use the curated fallback catalog.",
  );
  return result;
}
