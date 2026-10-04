import type { Leg, Place, Plan, Stop } from "@/types";
import {
  approximateDuration,
  dateAt,
  displayTime,
  weekday,
} from "@/lib/planner/time";
import { routeUrlForPlan } from "@/lib/maps/googleMapsUrl";
export const questionHelp =
  "Ask me the time, the cost, a stop, its address, when to leave, whether it's open, where you should be, the walk between two stops, or the weather.";
export function limitedAnswer(title: string) {
  return `Happy to help with “${title}”. Want to change something, or hear more about a stop?`;
}
function walkingRoute(plan: Plan) {
  if (!plan.start || !plan.stops?.length) return undefined;
  return routeUrlForPlan(plan);
}
export function conversationalIntro(plan: Plan) {
  const names = plan.stops.map((stop) => stop.place.name);
  const route =
    names.length < 2
      ? `You're heading to ${names[0] ?? "the first stop"}.`
      : `You're starting at ${names[0]}, then ${names.slice(1).join(", then ")}.`;
  const weather = plan.weather.summary.replace(/(\d+)–\1°F/g, "$1°F");
  const maps = walkingRoute(plan);
  const routeLink = maps ? `\n\nYour walking route:\n${maps}` : "";
  return `You’re all set — this sounds like a lovely way to spend some time together.\n\n${displayTime(plan.startsAt)} · ${approximateDuration(plan.duration)}\n${route}\nAround $${plan.cost} for the two of you. ${weather}${routeLink}\n\nAsk me the time, the cost, an address, when to leave, whether a stop is open, or where you should be.`;
}
export function isPlannerCommand(text: string) {
  return (
    text.includes("=") ||
    /cheaper|indoors|regenerate|another (?:date|plan)|new date|plan (?:a |my |our )?date|(?:start|time|tomorrow|today|tonight).*\d|\b(?:coffee|dinner|lunch)\b|no preference|any budget|surprise me/i.test(
      text,
    )
  );
}
type Turn = { role: string; text: string };
const filler = new Set(["the", "and", "of", "at"]);
function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function aliases(name: string) {
  const full = normalize(name);
  const words = full.split(" ").filter((word) => word && !filler.has(word));
  const compact = words.join(" ");
  const variants = [full, compact];
  if (words.length >= 2) {
    variants.push(words.slice(0, 2).join(" "), words.slice(-2).join(" "));
  }
  return [...new Set(variants.filter((alias) => alias.length >= 5))];
}
function namesMatch(a: string, b: string) {
  const left = normalize(a);
  const right = normalize(b);
  if (!left || !right) return false;
  if (left.includes(right) || right.includes(left)) return true;
  const other = aliases(b);
  return aliases(a).some((alias) => other.includes(alias));
}
function stopsInOrder(plan: Plan, text: string) {
  const q = normalize(text);
  return plan.stops
    .map((stop) => {
      const alias = aliases(stop.place.name).find((item) => q.includes(item));
      return alias ? { stop, at: q.indexOf(alias) } : undefined;
    })
    .filter((item): item is { stop: Stop; at: number } => !!item)
    .sort((a, b) => a.at - b.at)
    .map((item) => item.stop);
}
function ordinalIndex(text: string, count: number) {
  const q = normalize(text);
  if (/\bfirst\b|\b1st\b/.test(q)) return 0;
  if (/\bsecond\b|\b2nd\b/.test(q)) return 1;
  if (/\bthird\b|\b3rd\b/.test(q)) return 2;
  if (/\blast\b/.test(q)) return count - 1;
  const numbered = q.match(/\bstop ([1-9])\b/);
  if (numbered) return Number(numbered[1]) - 1;
  return undefined;
}
function stopFromContext(plan: Plan, text: string, history: Turn[]) {
  const named = stopsInOrder(plan, text);
  if (named.length === 1) return named[0];
  const index = ordinalIndex(text, plan.stops.length);
  if (index !== undefined && plan.stops[index]) return plan.stops[index];
  for (const turn of [...history].reverse()) {
    const past = stopsInOrder(plan, turn.text);
    if (past.length === 1) return past[0];
  }
  return plan.stops.length === 1 ? plan.stops[0] : undefined;
}
function whichStop(plan: Plan) {
  return `Which stop did you mean? ${plan.stops.map((stop) => stop.place.name).join(", ")}.`;
}
function shownTime(value?: string) {
  if (!value || Number.isNaN(Date.parse(value))) return undefined;
  return displayTime(value);
}
function legTo(plan: Plan, name: string) {
  return (plan.legs ?? []).find((leg) => namesMatch(leg.toName, name));
}
function travelSentence(leg: Leg) {
  return `${approximateDuration(leg.minutes)} from ${leg.fromName} to ${leg.toName}, about ${leg.walkKm.toFixed(1)} km.`;
}
function clockLabel(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  const suffix = hour % 24 >= 12 ? "PM" : "AM";
  const shown = (hour % 24) % 12 || 12;
  return minute
    ? `${shown}:${String(minute).padStart(2, "0")} ${suffix}`
    : `${shown} ${suffix}`;
}
function listedHours(place: Place, at: number) {
  const hours = place.openingHours;
  if (!hours) return;
  const date = dateAt(at);
  const windows =
    hours.exceptions[date] ?? hours.weekly[String(weekday(date))] ?? [];
  return windows.length
    ? windows
        .map(([open, close]) => `${clockLabel(open)} to ${clockLabel(close)}`)
        .join(", ")
    : "";
}
function hoursAnswer(stop: Stop) {
  const name = stop.place.name;
  if (!stop.place.openingHours)
    return `I don't have opening hours saved for ${name}.`;
  const arrival = Date.parse(stop.arrival);
  if (!Number.isFinite(arrival)) return `I don't have a visit time for ${name}.`;
  const listed = listedHours(stop.place, arrival);
  return listed
    ? `${name} is open ${listed}.`
    : `${name} is closed that day.`;
}
function plannedWhere(plan: Plan, now: number) {
  const stops = plan.stops.filter((stop) => shownTime(stop.arrival));
  if (!stops.length) return "This plan doesn't have timed stops.";
  const first = stops[0];
  const last = stops[stops.length - 1];
  if (now < Date.parse(first.arrival))
    return `You're early. You should be on the way to ${first.place.name}. Arrive at ${displayTime(first.arrival)}.`;
  if (last.departure && now >= Date.parse(last.departure))
    return `The planned visit is over. ${last.place.name} was the last stop, and you were due to leave at ${displayTime(last.departure)}.`;
  for (let i = 0; i < stops.length; i++) {
    const stop = stops[i];
    const leave = Date.parse(stop.departure || stop.arrival);
    if (now >= Date.parse(stop.arrival) && now < leave)
      return `You should be at ${stop.place.name} until ${displayTime(stop.departure)}.`;
    const next = stops[i + 1];
    if (next && now >= leave && now < Date.parse(next.arrival))
      return `You should be heading to ${next.place.name}. You're due there at ${displayTime(next.arrival)}.`;
  }
  return `You should be at ${last.place.name}.`;
}
function leaveSentence(from: string, when: string, now: number, leg?: Leg) {
  const planned = `Leave ${from} at ${displayTime(when)}.`;
  if (Date.parse(when) >= now || !leg)
    return Date.parse(when) >= now
      ? planned
      : `${planned} That time has already passed.`;
  const arrive = displayTime(
    new Date(now + leg.minutes * 60000).toISOString(),
  );
  return `${planned} That time has already passed. The walk to ${leg.toName} is ${approximateDuration(leg.minutes)}, so leaving now gets you there around ${arrive}.`;
}
export function savedFactAnswer(
  plan: Plan,
  text: string,
  history: Turn[] = [],
  now = Date.now(),
) {
  const q = normalize(text);
  const named = stopsInOrder(plan, text);
  if (
    /where should (?:i|we) be|where (?:are|am) (?:i|we) supposed to be|(?:are we|am i) on time|on schedule/.test(
      q,
    )
  )
    return plannedWhere(plan, now);
  if (
    /\b(?:is|are) .+ open\b|\bopen when\b|\bopening hours\b|\bwhat time (?:do|does) .+ (?:open|close)\b|\bwhen (?:do|does) .+ (?:open|close)\b|\bhours for\b|\bstill open\b/.test(
      q,
    )
  ) {
    if (named.length > 1)
      return `Which one, ${named.map((stop) => stop.place.name).join(" or ")}?`;
    const stop = named[0] ?? stopFromContext(plan, text, history);
    if (!stop) return whichStop(plan);
    return hoursAnswer(stop);
  }
  if (/\bwebsite\b|\bhomepage\b|\btheir site\b|\bsite for\b/.test(q)) {
    if (named.length > 1)
      return `Which one, ${named.map((stop) => stop.place.name).join(" or ")}?`;
    const stop = stopFromContext(plan, text, history);
    if (!stop) return whichStop(plan);
    return stop.place.websiteUrl
      ? `${stop.place.name}: ${stop.place.websiteUrl}`
      : `I don't have a website saved for ${stop.place.name}.`;
  }
  if (/\baddress\b|\bwhere is\b|\bwhere s\b|\bwhere are\b/.test(q)) {
    const wholePlan =
      /\bgoing\b|\bitinerary\b|\bthe plan\b/.test(q) &&
      named.length === 0 &&
      ordinalIndex(text, plan.stops.length) === undefined;
    if (!wholePlan) {
      if (named.length > 1)
        return `Which one, ${named.map((stop) => stop.place.name).join(" or ")}?`;
      const stop = stopFromContext(plan, text, history);
      if (stop)
        return stop.place.address
          ? `${stop.place.name} is at ${stop.place.address}.`
          : `I don't have an address saved for ${stop.place.name}.`;
      if (/\baddress\b/.test(q)) return whichStop(plan);
    }
  }
  if (
    /when (?:do|should) (?:i|we) leave|what time (?:do|should) (?:i|we) leave|when to leave|leave for/.test(
      q,
    )
  ) {
    const indexed = ordinalIndex(text, plan.stops.length);
    const chosen =
      (/leave for/.test(q) ? named[named.length - 1] : named[0]) ??
      (indexed !== undefined ? plan.stops[indexed] : undefined) ??
      stopFromContext(plan, "", history);
    if (!chosen) return whichStop(plan);
    if (/leave for/.test(q)) {
      const leg = legTo(plan, chosen.place.name);
      if (!leg || !shownTime(leg.departure))
        return `I don't have a leave time for ${chosen.place.name}.`;
      return leaveSentence(leg.fromName, leg.departure, now, leg);
    }
    if (!shownTime(chosen.departure))
      return `I don't have a leave time for ${chosen.place.name}.`;
    const next = plan.stops[plan.stops.indexOf(chosen) + 1];
    return leaveSentence(
      chosen.place.name,
      chosen.departure,
      now,
      next ? legTo(plan, next.place.name) : undefined,
    );
  }
  const asksTravel = /how long|how far|\bwalk\b|\bkm\b/.test(q);
  if (asksTravel && named.length >= 2) {
    const from = named[0];
    const to = named[named.length - 1];
    const leg = (plan.legs ?? []).find(
      (item) =>
        namesMatch(item.fromName, from.place.name) &&
        namesMatch(item.toName, to.place.name),
    );
    return leg
      ? travelSentence(leg)
      : `${from.place.name} and ${to.place.name} aren't next to each other on this plan.`;
  }
  if (
    asksTravel &&
    named.length === 1 &&
    /\bto\b|\bfrom\b|\bwalk\b/.test(q)
  ) {
    const leg = legTo(plan, named[0].place.name);
    return leg
      ? travelSentence(leg)
      : `I don't have a walk to ${named[0].place.name} on this plan.`;
  }
  if (
    /how long is the walk|how far|walking time|walk time/.test(q) &&
    named.length === 0
  ) {
    const minutes = (plan.legs ?? [])
      .filter((leg) => leg.mode === "walk")
      .reduce((sum, leg) => sum + leg.minutes, 0);
    return minutes
      ? `${approximateDuration(minutes)} of walking, about ${plan.walkKm} km.`
      : `About ${plan.walkKm} km of walking.`;
  }
  if (
    /how long|duration/.test(q) &&
    named.length === 1 &&
    !/\bdate\b|\bthis\b/.test(q) &&
    named[0].place.typicalDurationMinutes
  )
    return `${named[0].place.name} is ${approximateDuration(named[0].place.typicalDurationMinutes)}.`;
  if (
    /how much|\bcost\b|\bprice\b|\bbudget\b|expensive/.test(q) &&
    !/this date|the date|whole|total|altogether|in all|this plan/.test(q)
  ) {
    if (named.length > 1)
      return `Which one, ${named.map((stop) => stop.place.name).join(" or ")}?`;
    const stop =
      named[0] ??
      (ordinalIndex(text, plan.stops.length) !== undefined
        ? plan.stops[ordinalIndex(text, plan.stops.length)!]
        : undefined);
    if (stop && stop.place.estimatedCostForTwo !== undefined)
      return `About $${stop.place.estimatedCostForTwo} for two at ${stop.place.name}.`;
  }
  if (/\bafter that\b|\band after\b|\bwhat s after\b|\bwhat is after\b/.test(q)) {
    for (const turn of [...history].reverse()) {
      const past = stopsInOrder(plan, turn.text);
      const last = past[past.length - 1];
      if (!last) continue;
      const index = plan.stops.indexOf(last);
      if (index < 0) continue;
      if (index >= plan.stops.length - 1)
        return `${last.place.name} is the last stop.`;
      const next = plan.stops[index + 1];
      return `After ${last.place.name}, you go to ${next.place.name} at ${displayTime(next.arrival)}.`;
    }
  }
  if (/\bwhat s next\b|\bwhats next\b|\bnext stop\b|\bwhere next\b/.test(q)) {
    const upcoming = plan.stops.find((stop) => Date.parse(stop.arrival) > now);
    if (!upcoming) {
      const last = plan.stops[plan.stops.length - 1];
      return last
        ? `${last.place.name} is the last stop. You were due there at ${displayTime(last.arrival)}.`
        : "This plan doesn't have any stops.";
    }
    return `Next is ${upcoming.place.name} at ${displayTime(upcoming.arrival)}.`;
  }
  if (
    (/\b(first|second|third|last|1st|2nd|3rd)\b/.test(q) &&
      /\b(stop|location|place|spot)\b/.test(q)) ||
    /\bstop [1-9]\b/.test(q)
  ) {
    const index = ordinalIndex(text, plan.stops.length);
    const stop = index !== undefined ? plan.stops[index] : undefined;
    if (!stop) return whichStop(plan);
    const arrive = shownTime(stop.arrival);
    const leave = shownTime(stop.departure);
    if (arrive && leave)
      return `${stop.place.name}. Arrive ${arrive}, leave ${leave}.`;
    if (arrive) return `${stop.place.name} at ${arrive}.`;
    return stop.place.name;
  }
  if (
    /\bwarning\b|heads up|watch out|anything i should know|should i know|anything to watch|be aware/.test(
      q,
    )
  )
    return plan.warnings.length
      ? plan.warnings.join("\n")
      : "Nothing else flagged on this plan. Hours and prices are still estimates.";
  return;
}
export function answerAboutDate(
  plan: Plan,
  url: string,
  text: string,
  history: Turn[] = [],
  now = Date.now(),
) {
  const fact = savedFactAnswer(plan, text, history, now);
  if (fact) return fact;
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
    return "I’m Navi. I can help with the plan, the time, the cost, or the walking route.";
}
