import { randomBytes } from "node:crypto";
import {
  criteriaSchema,
  type Criteria,
  type Plan,
  type SavedDate,
} from "@/types";
import { landmarks } from "@/lib/data";
import { getStorage, type Storage } from "@/lib/storage";
import { hash, saveDate } from "@/lib/storage/dates";
import { displayTime } from "@/lib/planner/time";
import { generate } from "@/lib/planner/service";
import { interpret } from "@/lib/integrations/xai";
export type Incoming = {
  id: string;
  spaceId: string;
  senderId: string;
  platform: "imessage" | "local";
  text: string;
  own: boolean;
  direct: boolean;
};
export type Transport = { send(text: string): Promise<string | undefined> };
export type Conversation = {
  criteria: Partial<Criteria>;
  shareId?: string;
  revision: number;
};
export type Pair = {
  ownerHash: string;
  shareId: string;
  expires: number;
  status: "waiting" | "sending" | "accepted" | "failed" | "unknown";
  providerId?: string;
};
export function itineraryText(plan: Plan, url: string) {
  return [
    `Navidate · ${plan.title}`,
    `${displayTime(plan.startsAt)} → ${displayTime(plan.endsAt)}`,
    `Estimated $${plan.cost} for two · ${plan.duration} min · ${plan.walkKm} km walking`,
    ...plan.stops.map(
      (s, i) =>
        `${i + 1}. ${displayTime(s.arrival)} — ${s.place.name} (${s.place.typicalDurationMinutes} min, est. $${s.place.estimatedCostForTwo})${plan.legs[i]?.bus ? ` · Bus ${plan.legs[i].bus!.route}, scheduled ${displayTime(plan.legs[i].bus!.boardTime)}, wait ${plan.legs[i].bus!.wait} min` : ` · ${plan.legs[i]?.minutes ?? 0} min walking estimate`}`,
    ),
    plan.weather.summary,
    ...plan.warnings,
    url,
  ].join("\n");
}
export async function createPair(
  ownerHash: string,
  shareId: string,
  store: Storage = getStorage(),
) {
  const code = randomBytes(8).toString("hex").toUpperCase();
  await store.put("pair:" + hash(code), {
    ownerHash,
    shareId,
    expires: Date.now() + 10 * 60000,
    status: "waiting",
  } satisfies Pair);
  return code;
}
export function parseLocal(
  text: string,
  prior: Partial<Criteria>,
): Partial<Criteria> {
  const result = { ...prior };
  if (/make it cheaper/i.test(text) && result.budget !== undefined)
    result.budget = Math.max(0, result.budget - 15);
  if (/make it indoors/i.test(text)) result.setting = "indoor";
  const time = text.match(
    /(?:start(?: time)?|time)\s*(?:=|:|to)?\s*(\d{2}:\d{2})/i,
  );
  if (time) result.time = time[1];
  for (const part of text.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim().toLowerCase(),
      value = part.slice(idx + 1).trim();
    if (key === "start") {
      const landmark = landmarks.find(
        (l) => l.id === value || l.name.toLowerCase() === value.toLowerCase(),
      );
      if (landmark) result.start = landmark;
    }
    if (key === "date") result.date = value;
    if (key === "time") result.time = value;
    if (key === "budget") result.budget = Number(value.replace("$", ""));
    if (key === "duration") result.duration = Number(value);
    if (key === "vibe") {
      const parsed = criteriaSchema.shape.vibe.safeParse(
        value.charAt(0).toUpperCase() + value.slice(1).toLowerCase(),
      );
      if (parsed.success) result.vibe = parsed.data;
    }
    if (key === "transport" && (value === "walk" || value === "bus"))
      result.transport = value;
  }
  return result;
}
export async function handleIncoming(
  event: Incoming,
  transport: Transport,
  store: Storage = getStorage(),
) {
  if (event.own || !event.direct || !event.senderId || event.text.length > 1200)
    return { status: "ignored" };
  const eventKey = "event:" + hash(event.platform + ":" + event.id);
  if (!(await store.claim(eventKey, { status: "processing", at: Date.now() })))
    return { status: "duplicate" };
  const conversationKey =
    "conversation:" +
    hash([event.platform, event.spaceId, event.senderId].join(":"));
  let pairKey: string | undefined;
  let response: string;
  try {
    const match = event.text.trim().match(/^pair\s+([A-F0-9]{16})$/i);
    if (match) {
      pairKey = "pair:" + hash(match[1].toUpperCase());
      const pair = await store.get<Pair>(pairKey);
      if (
        !pair ||
        pair.expires < Date.now() ||
        pair.status !== "waiting" ||
        !(await store.claim(pairKey + ":used", true))
      )
        response =
          "That pairing code is expired or already used. Create a new code on your saved itinerary.";
      else {
        const saved = await store.get<SavedDate>("date:" + pair.shareId);
        if (!saved) response = "That itinerary is no longer available.";
        else {
          await store.put(pairKey, { ...pair, status: "sending" });
          await store.put(conversationKey, {
            criteria: saved.criteria,
            shareId: saved.shareId,
            revision: 0,
          });
          response = itineraryText(
            saved.plan,
            `${process.env.APP_URL ?? "http://localhost:3000"}/date/${saved.shareId}`,
          );
        }
      }
    } else {
      const conversation = (await store.get<Conversation>(conversationKey)) ?? {
        criteria: {},
        revision: 0,
      };
      let criteria = parseLocal(event.text, conversation.criteria),
        question: string | undefined;
      if (
        process.env.XAI_API_KEY &&
        process.env.DISABLE_EXTERNAL_APIS !== "true"
      )
        try {
          const interpreted = await interpret(event.text, criteria);
          criteria = interpreted.criteria;
          question = interpreted.question;
        } catch {
          /* The explicit field format remains available. */
        }
      const parsed = criteriaSchema.safeParse(criteria);
      if (!parsed.success) {
        await store.put(conversationKey, { ...conversation, criteria });
        const missing = [
          ...new Set(parsed.error.issues.map((i) => i.path[0])),
        ].join(", ");
        response = `${question ?? `Please provide: ${missing}.`}\nUse this format (edit each value): start=arts-quad; date=2026-10-03; time=13:00; duration=180; budget=50; vibe=Cozy; transport=walk\nStarting landmarks: ${landmarks.map((l) => l.id).join(", ")}. Budget is for two; all times are New York.`;
      } else {
        await store.put(conversationKey, {
          ...conversation,
          criteria: parsed.data,
        });
        const result = await generate(parsed.data, {
          seed: conversation.revision + 1,
        });
        if (!result.plans.length)
          response =
            result.error ??
            "No feasible itinerary. Try more time or a supported landmark.";
        else {
          const saved = await saveDate(
            parsed.data,
            result.plans[0],
            hash(conversationKey),
            store,
          );
          await store.put(conversationKey, {
            criteria: parsed.data,
            shareId: saved.shareId,
            revision: conversation.revision + 1,
          });
          response =
            itineraryText(
              saved.plan,
              `${process.env.APP_URL ?? "http://localhost:3000"}/date/${saved.shareId}`,
            ) +
            "\nReply: make it cheaper, make it indoors, start time 14:00, or regenerate.";
        }
      }
    }
  } catch {
    response =
      "I couldn’t finish that plan. Please send your request again. Your previous criteria are still saved.";
  }
  // Record intent before delivery: duplicate events never retry an ambiguous send.
  await store.put(eventKey, { status: "sending", at: Date.now() });
  try {
    const providerId = await transport.send(response);
    await store.put(eventKey, {
      status: providerId ? "accepted" : "unknown",
      at: Date.now(),
      providerId,
    });
    if (pairKey) {
      const pair = await store.get<Pair>(pairKey);
      if (pair?.status === "sending")
        await store.put(pairKey, {
          ...pair,
          status: providerId ? "accepted" : "unknown",
          providerId,
        });
    }
    return { status: providerId ? "accepted" : "unknown" };
  } catch {
    await store.put(eventKey, { status: "failed", at: Date.now() });
    if (pairKey) {
      const pair = await store.get<Pair>(pairKey);
      if (pair?.status === "sending")
        await store.put(pairKey, { ...pair, status: "failed" });
    }
    return { status: "failed" };
  }
}
