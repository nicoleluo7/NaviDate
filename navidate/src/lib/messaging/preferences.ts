import { Temporal } from "@js-temporal/polyfill";
import { criteriaSchema, pointSchema, type Criteria } from "@/types";
import { landmarks } from "@/lib/data";

export { publicAppUrl as appUrl } from "@/lib/urls";
import { publicAppUrl as appUrl } from "@/lib/urls";
export const locationInvitation = () =>
  `Of course — tap here to check your current location, then send it back to me: ${appUrl()}/location\nOr tell me a nearby Ithaca landmark. I can’t see your location until you choose to share it.`;
export function sharedCoordinates(text: string): Criteria["start"] | undefined {
  let source = text;
  const link = text.match(/https?:\/\/[^\s]+/);
  if (link) {
    try {
      const u = new URL(link[0]);
      if (
        /(^|\.)(google\.com|maps\.apple\.com|maps\.google\.com)$/.test(
          u.hostname,
        )
      )
        source =
          u.searchParams.get("ll") ||
          u.searchParams.get("q") ||
          u.searchParams.get("query") ||
          u.searchParams.get("origin") ||
          "";
    } catch {}
  }
  const match = source.match(
    /(?:^|[^\d.])(-?\d{1,3}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)(?:$|[^\d.])/,
  );
  if (!match) return;
  const point = pointSchema.safeParse({
    lat: Number(match[1]),
    lng: Number(match[2]),
  });
  if (!point.success)
    throw new Error(
      "That location is outside the Ithaca area I can plan for. Could you pick an Ithaca landmark instead?",
    );
  return { ...point.data, name: "My location", private: true };
}
export function naturalCriteria(
  text: string,
  prior: Partial<Criteria>,
  now = Temporal.Now.zonedDateTimeISO("America/New_York"),
): Partial<Criteria> {
  const c = { ...prior },
    t = text.toLowerCase();
  const start = sharedCoordinates(text);
  if (start) c.start = start;
  const landmark = landmarks.find(
    (l) => t.includes(l.name.toLowerCase()) || t.includes(l.id),
  );
  if (landmark) c.start = landmark;
  if (/\bcommons\b/.test(t))
    c.start = landmarks.find((l) => /Ithaca Commons/i.test(l.name)) ?? c.start;
  const date = text.match(/\b\d{4}-\d{2}-\d{2}\b/);
  if (date) c.date = date[0];
  if (/\btomorrow\b/.test(t))
    c.date = now.add({ days: 1 }).toPlainDate().toString();
  else if (/\btoday\b|\btonight\b/.test(t))
    c.date = now.toPlainDate().toString();
  if (/\b(any (?:day|time)|whenever|you pick the time)\b/.test(t)) {
    const soon = now
      .add({ hours: 1 })
      .with({ minute: 0, second: 0, millisecond: 0 });
    c.date = c.date ?? soon.toPlainDate().toString();
    c.time = c.time ?? soon.toPlainTime().toString().slice(0, 5);
  }
  if (/\b(anywhere|you pick the start)\b/.test(t))
    c.start = landmarks.find((l) => /Ithaca Commons/i.test(l.name));
  const clock = t.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
  if (clock && +clock[1] >= 1 && +clock[1] <= 12)
    c.time = `${String((+clock[1] % 12) + (clock[3] === "pm" ? 12 : 0)).padStart(2, "0")}:${clock[2] ?? "00"}`;
  const military = t.match(/\b([01]\d|2[0-3]):([0-5]\d)\b/);
  if (military && !clock) c.time = `${military[1]}:${military[2]}`;
  const budget =
    t.match(
      /(?:under|budget(?: of)?|up to|max(?:imum)?)\s*\$?\s*(\d+(?:\.\d+)?)/,
    ) || t.match(/\$(\d+(?:\.\d+)?)/);
  if (budget) c.budget = +budget[1];
  const duration = t.match(
    /\b(\d+(?:\.\d+)?)\s*(hours?|hrs?|minutes?|mins?)\b/,
  );
  if (duration)
    c.duration = Math.round(
      +duration[1] * (duration[2].startsWith("h") ? 60 : 1),
    );
  const walk = t.match(
    /(?:max(?:imum)?|under|up to)?\s*(\d+(?:\.\d+)?)\s*km\b/,
  );
  if (walk) c.maxWalkKm = +walk[1];
  if (/\b(coffee|caf[eé])\b/.test(t)) c.dateType = "coffee";
  else if (/\b(food|dinner|lunch|restaurant)\b/.test(t)) c.dateType = "food";
  else if (/\b(dessert|ice cream)\b/.test(t)) c.dateType = "dessert";
  if (/\bindoor(s)?\b/.test(t)) c.setting = "indoor";
  else if (/\boutdoor(s)?\b/.test(t)) c.setting = "outdoor";
  if (/\bwalk(?:ing)? only\b|\bno bus\b/.test(t)) c.transport = "walk";
  else if (/\bdriv(?:e|ing)\b/.test(t)) c.transport = "drive";
  else if (/\bbus\b/.test(t)) c.transport = "bus";
  for (const vibe of [
    "Cozy",
    "Romantic",
    "Adventurous",
    "Casual",
    "Creative",
  ] as const)
    if (t.includes(vibe.toLowerCase())) c.vibe = vibe;
  const unrestricted = new Set(c.unrestricted ?? []);
  if (budget) unrestricted.delete("budget");
  if (walk) unrestricted.delete("distance");
  if (c.vibe !== prior.vibe) unrestricted.delete("vibe");
  if (
    /(?:any|no|unlimited|flexible) budget|budget (?:doesn.t matter|is flexible)|no spending limit/.test(
      t,
    )
  ) {
    delete c.budget;
    unrestricted.add("budget");
  }
  if (
    /(?:any|unlimited) distance|no (?:walking |distance )limit|distance (?:doesn.t matter|is flexible)/.test(
      t,
    )
  ) {
    delete c.maxWalkKm;
    unrestricted.add("distance");
  }
  if (/any (?:vibe|mood)|no (?:vibe|mood) preference/.test(t)) {
    delete c.vibe;
    unrestricted.add("vibe");
  }
  if (
    /any (?:type|kind)(?: of date)?|surprise me|no (?:date )type preference/.test(
      t,
    )
  ) {
    c.dateType = "any";
    delete c.restaurantId;
  }
  if (/no preferences?|anything (?:is fine|works)|up to you/.test(t)) {
    delete c.budget;
    delete c.maxWalkKm;
    delete c.vibe;
    c.dateType = "any";
    c.setting = "any";
    c.dietary = [];
    delete c.restaurantId;
    unrestricted.add("budget");
    unrestricted.add("distance");
    unrestricted.add("vibe");
  }
  c.unrestricted = [...unrestricted];
  return c;
}
export function flexibleCriteria(c: Partial<Criteria>): Partial<Criteria> {
  const unrestricted = new Set(c.unrestricted ?? []);
  if (c.budget === undefined) unrestricted.add("budget");
  if (c.maxWalkKm === undefined) unrestricted.add("distance");
  if (c.vibe === undefined) unrestricted.add("vibe");
  return {
    duration: 180,
    budget: 1000,
    maxWalkKm: 20,
    vibe: "Casual",
    dateType: "any",
    transport: "bus",
    setting: "any",
    dietary: [],
    returnToStart: false,
    preferences: "",
    ...c,
    unrestricted: [...unrestricted],
  };
}
export function nextQuestion(c: Partial<Criteria>) {
  if (!c.start)
    return `I’d love to help. Where would you like to start — maybe Cornell or the Commons? You can also share your current location here: ${appUrl()}/location`;
  if (!c.date)
    return "What day are you thinking? “Today” or “tomorrow” works too.";
  if (!c.time) return "Lovely. Around what time would you like to head out?";
  const parsed = criteriaSchema.safeParse(c);
  if (!parsed.success) {
    const key = parsed.error.issues[0]?.path[0];
    return key === "budget"
      ? "What spending limit should I use for the two of you? You can also say “any budget”."
      : key === "duration"
        ? "How much time would you like together? I can plan a few hours if you’re flexible."
        : key === "time"
          ? "What start time works for you? Something like “6:30 pm” is perfect."
          : "Could you rephrase that last detail? I’ll keep everything else you’ve told me.";
  }
}
