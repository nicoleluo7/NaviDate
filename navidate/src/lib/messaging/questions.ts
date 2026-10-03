import type { Plan } from "@/types";
import { approximateDuration, displayTime } from "@/lib/planner/time";
import { routeUrlForPlan } from "@/lib/maps/googleMapsUrl";
export const questionHelp =
  "Ask me about this date: what time, how much, where are we going, the weather, or the link.";
export function limitedAnswer(title: string) {
  return `Happy to help with “${title}”. Want to change something, or hear more about a stop?`;
}
function walkingRoute(plan: Plan) {
  if (!plan.start || !plan.stops?.length) return undefined;
  return routeUrlForPlan(plan);
}
export function conversationalIntro(plan: Plan, url: string) {
  const names = plan.stops.map((stop) => stop.place.name);
  const route =
    names.length < 2
      ? `You're heading to ${names[0] ?? "the first stop"}.`
      : `You're starting at ${names[0]}, then ${names.slice(1).join(", then ")}.`;
  const weather = plan.weather.summary.replace(/(\d+)–\1°F/g, "$1°F");
  const maps = walkingRoute(plan);
  const links = maps
    ? `Your walking route:\n${maps}\n\nYour itinerary:\n${url}`
    : `Your itinerary:\n${url}`;
  return `You’re all set — this sounds like a lovely way to spend some time together.\n\n${displayTime(plan.startsAt)} · ${approximateDuration(plan.duration)}\n${route}\nAround $${plan.cost} for the two of you. ${weather}\n\n${links}\n\nWant ideas for what to do or order when you get there? Just ask.`;
}
export function isPlannerCommand(text: string) {
  return (
    text.includes("=") ||
    /cheaper|indoors|regenerate|another (?:date|plan)|new date|plan (?:a |my |our )?date|(?:start|time|tomorrow|today|tonight).*\d|\b(?:coffee|dinner|lunch)\b|no preference|any budget|surprise me/i.test(
      text,
    )
  );
}
export function answerAboutDate(plan: Plan, url: string, text: string) {
  const q = text.trim().toLowerCase();
  if (/google maps|maps route|directions|open route/.test(q))
    return routeUrlForPlan(plan) ?? url;
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

export function isVenueQuestion(text: string) {
  return /what (?:do you |would you )?(?:recommend|suggest)|what (?:should|can|could) (?:we|i) (?:order|eat|try|do|get)|menu|what.*serv(?:e|ing)|reservation|accessib|parking|restroom|opening hours|is (?:it|that|the .+) open|tell me (?:more )?about|look up|search for/i.test(
    text,
  );
}
export function referencedVenue(
  plan: Plan,
  text: string,
  history: { role: string; text: string }[] = [],
) {
  const named = (text: string) =>
    plan.stops
      .filter((s) => text.toLowerCase().includes(s.place.name.toLowerCase()))
      .at(-1)?.place;
  if (named(text)) return named(text)!;
  if (/\bfirst\b/i.test(text)) return plan.stops[0]?.place;
  if (/\bsecond\b/i.test(text)) return plan.stops[1]?.place;
  for (const turn of [...history].reverse()) {
    const place = named(turn.text);
    if (place) return place;
  }
  return plan.stops.length === 1 ? plan.stops[0].place : undefined;
}
export function venueFallback(
  plan: Plan,
  text: string,
  history: { role: string; text: string }[] = [],
) {
  const place = referencedVenue(plan, text, history);
  if (!place)
    return `Which stop did you mean — ${plan.stops.map((s) => s.place.name).join(" or ")}? I’d be happy to help you choose.`;
  if (
    /menu|order|eat|recommend|suggest|try/i.test(text) &&
    ["food", "café", "dessert"].includes(place.category)
  )
    return `For ${place.name}, I’d start by asking what’s fresh or what the staff loves. I couldn’t verify today’s menu, so I don’t want to name something they may not have. Are you leaning sweet or savory?${place.websiteUrl ? " Their website: " + place.websiteUrl : ""}`;
  return `I couldn’t verify that detail for ${place.name} just now. ${place.websiteUrl ? "Their official site is a good next step: " + place.websiteUrl : "It’s worth checking directly before you head over."} I can still help you adjust the rest of your date.`;
}

export function introductionAnswer(text: string) {
  if (
    /what(?:['’]s| is)? (?:your|ur) name|who are you|are you (?:a bot|an ai|human|real)/i.test(
      text,
    )
  )
    return "I’m Navi, your AI date-planning companion. I can help you find a lovely spot, figure out the route, or decide what to try when you get there.";
}
