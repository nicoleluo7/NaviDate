import type { Plan } from "@/types";
import { approximateDuration, displayTime } from "@/lib/planner/time";
import { routeUrlForPlan } from "@/lib/maps/googleMapsUrl";
export const questionHelp =
  "Ask me about this date: what time, how much, where are we going, the weather, or the link.";
export function limitedAnswer(title: string) {
  return `I can tell you the time, cost, stops, weather, or link for “${title}”.`;
}
export function conversationalIntro(plan: Plan, url: string) {
  const names = plan.stops.map((stop) => stop.place.name);
  const route =
    names.length < 2
      ? `You're heading to ${names[0] ?? "the first stop"}.`
      : `You're starting at ${names[0]}, then ${names.slice(1).join(", then ")}.`;
  return `${plan.title} runs ${displayTime(plan.startsAt)} to ${displayTime(plan.endsAt)}, ${approximateDuration(plan.duration)}. ${route} About $${plan.cost} for two. ${plan.weather.summary}\n${url}`;
}
export function isPlannerCommand(text: string) {
  return (
    text.includes("=") ||
    /make it cheaper|make it indoors|regenerate|start(?: time)?\s+\d/i.test(
      text,
    )
  );
}
export function answerAboutDate(plan: Plan, url: string, text: string) {
  const q = text.trim().toLowerCase();
  if (/^(help|\?)$/.test(q) || /what can (i|you)|help me/.test(q))
    return questionHelp;
  if (/how long|duration/.test(q))
    return `${plan.title} lasts ${approximateDuration(plan.duration)}, ${displayTime(plan.startsAt)} to ${displayTime(plan.endsAt)}.`;
  if (/when|what time|start|end\b/.test(q))
    return `${plan.title} runs ${displayTime(plan.startsAt)} to ${displayTime(plan.endsAt)}.`;
  if (/walk|how far|\bkm\b/.test(q))
    return `About ${plan.walkKm} km of walking.`;
  if (/how much|cost|price|budget|expensive/.test(q))
    return `Estimated $${plan.cost} for two.`;
  if (/weather|rain|forecast/.test(q)) return plan.weather.summary;
  if (/\blink\b|url|share/.test(q)) return url;
  if (/google maps|maps route|directions|open route/.test(q))
    return routeUrlForPlan(plan) ?? url;
  if (/where|stop|itinerary|going|places|plan/.test(q))
    return [
      plan.title,
      ...plan.stops.map(
        (s, i) => `${i + 1}. ${displayTime(s.arrival)} — ${s.place.name}`,
      ),
    ].join("\n");
  if (/warning|heads up|watch out/.test(q))
    return plan.warnings.length
      ? plan.warnings.join("\n")
      : "No extra warnings on this date.";
  return;
}
