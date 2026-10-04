import { randomBytes } from "node:crypto";
import { criteriaSchema, type Criteria, type SavedDate } from "@/types";
import { landmarks } from "@/lib/data";
import { getStorage, type Storage } from "@/lib/storage";
import { hash, saveDate } from "@/lib/storage/dates";
import { routeUrlForPlan } from "@/lib/maps/googleMapsUrl";
import { generate } from "@/lib/planner/service";
import {
  flexibleCriteria,
  naturalCriteria,
  nextQuestion,
  locationInvitation,
  appUrl,
  sharedCoordinates,
} from "./preferences";
import { geminiConfigured } from "@/lib/maps/config";
import {
  answerWithGemini,
  interpretMessage,
  researchVenueWithGemini,
  type ChatTurn,
} from "@/lib/integrations/gemini";
import {
  answerAboutDate,
  conversationalIntro,
  savedFactAnswer,
  isPlannerCommand,
  limitedAnswer,
  isVenueQuestion,
  venueFallback,
  introductionAnswer,
} from "@/lib/messaging/questions";
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
  history?: ChatTurn[];
};
function withTurn(conversation: Conversation, user: string, assistant: string) {
  return {
    ...conversation,
    history: [
      ...(conversation.history ?? []),
      { role: "user" as const, text: user.slice(0, 400) },
      { role: "assistant" as const, text: assistant.slice(0, 700) },
    ].slice(-8),
  };
}
export type Pair = {
  ownerHash: string;
  shareId: string;
  expires: number;
  status: "waiting" | "sending" | "accepted" | "failed" | "unknown";
  providerId?: string;
};
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
export function messagesLink(address: string, code: string) {
  const recipient = address.trim().startsWith("+")
    ? address.trim()
    : `+${address.trim()}`;
  return `sms:${recipient}&body=${encodeURIComponent(`pair ${code}`)}`;
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
    if (
      key === "transport" &&
      (value === "walk" || value === "bus" || value === "drive")
    )
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
  const pending: Promise<unknown>[] = [];
  let settlePair:
    | ((providerId: string | undefined, failed?: boolean) => Promise<void>)
    | undefined;
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
          response = conversationalIntro(saved.plan);
          settlePair = (providerId, failed) =>
            store.put(pairKey!, {
              ...pair,
              status: failed
                ? "failed"
                : providerId
                  ? "accepted"
                  : "unknown",
              providerId,
            });
          pending.push(
            store.put(
              conversationKey,
              withTurn(
                {
                  criteria: saved.criteria,
                  shareId: saved.shareId,
                  revision: 0,
                },
                "Tell me about this date.",
                response,
              ),
            ),
          );
        }
      }
    } else {
      const conversation = (await store.get<Conversation>(conversationKey)) ?? {
        criteria: {},
        revision: 0,
      };
      const saved = conversation.shareId
        ? await store.get<SavedDate>("date:" + conversation.shareId)
        : null;
      const text = event.text.trim();
      const introduction = introductionAnswer(text);
      let criteria = naturalCriteria(
        text,
        parseLocal(text, conversation.criteria),
      );
      let intent: "plan" | "answer" | "location" | "greeting" =
        isPlannerCommand(text) || !saved ? "plan" : "answer";
      const coords = sharedCoordinates(text);
      const locationRequest =
        !coords &&
        /(?:my|current|live) location|where am i|share.*location|maps\.app\.goo\.gl|maps\.apple\.com/i.test(
          text,
        );
      const fact = saved
        ? savedFactAnswer(saved.plan, text, conversation.history ?? [])
        : undefined;
      if (locationRequest) intent = "location";
      else if (coords) intent = "plan";
      else if (saved && (fact || isVenueQuestion(text))) intent = "answer";
      else if (!saved && !introduction && geminiConfigured()) {
        try {
          const interpreted = await interpretMessage(
            text,
            conversation.criteria,
            conversation.history,
          );
          criteria = naturalCriteria(
            text,
            parseLocal(text, interpreted.criteria),
          );
          intent = interpreted.intent;
        } catch {
          /* Natural local parsing still supports essentials and revisions. */
        }
      }
      if (
        !saved &&
        /(?:make it |something |a bit )?cheaper|less expensive/i.test(text)
      ) {
        criteria.budget = Math.max(
          0,
          (conversation.criteria.budget ?? 50) - 15,
        );
        criteria.unrestricted = criteria.unrestricted?.filter(
          (p) => p !== "budget",
        );
        intent = "plan";
      }
      if (
        saved &&
        /cheaper|less expensive|make it indoors|keep it indoors|regenerate|another (?:date|plan)|new date|plan (?:a |my |our )?date|different time|start time\s*\d|tweak the|swap/i.test(
          text,
        )
      )
        intent = "plan";
      else if (fact) intent = "answer";
      if (introduction) {
        response = introduction;
        criteria = conversation.criteria;
      } else if (intent === "location") response = locationInvitation();
      else if (saved && intent === "answer") {
        criteria = conversation.criteria;
        const url = `${appUrl()}/date/${saved.shareId}`;
        const local = answerAboutDate(
          saved.plan,
          url,
          text,
          conversation.history ?? [],
        );
        if (/google maps|maps route|directions|open route/i.test(text))
          response = `Here’s your walking route, with the stops in order:\n${routeUrlForPlan(saved.plan) ?? url}`;
        else if (local) response = local;
        else if (isVenueQuestion(text)) {
          try {
            response = await researchVenueWithGemini(
              saved.plan,
              text,
              conversation.history ?? [],
            );
          } catch {
            response = venueFallback(
              saved.plan,
              text,
              conversation.history ?? [],
            );
          }
        } else if (geminiConfigured()) {
          try {
            response = await answerWithGemini(
              saved.plan,
              url,
              text,
              conversation.history ?? [],
            );
          } catch {
            response = limitedAnswer(saved.plan.title);
          }
        } else response = limitedAnswer(saved.plan.title);
      } else if (saved && (intent === "plan" || intent === "location")) {
        criteria = conversation.criteria;
        response = `I can answer questions about this date, but I can’t change it from a text. Update the time, budget, or stops in the planner where you saved it.`;
      } else if (saved && intent === "greeting") {
        response =
          "Hey, lovely to hear from you. Ask me about the time, a stop, the cost, or the weather.";
      } else {
        await store.put(conversationKey, { ...conversation, criteria });
        const defaults = flexibleCriteria(criteria),
          question = nextQuestion(defaults);
        if (question) response = question;
        else {
          const parsed = criteriaSchema.parse(defaults);
          const result = await generate(parsed, {
            seed: conversation.revision + 1,
          });
          if (!result.plans.length)
            response = `I couldn’t find a good fit just yet. ${result.error ?? "Could you try a different start time or give the date a little more time?"}`;
          else {
            const date = await saveDate(
              parsed,
              result.plans[0],
              hash(conversationKey),
              store,
            );
            conversation.shareId = date.shareId;
            conversation.revision++;
            const assumptions = [
              criteria.duration === undefined
                ? "I’ve planned about three hours together."
                : "",
              parsed.unrestricted?.length
                ? "I’ve left your unspecified preferences open and looked for sensible nearby options."
                : "",
            ]
              .filter(Boolean)
              .join(" ");
            response = `Here’s an idea for the two of you. ${assumptions}\n\n${conversationalIntro(date.plan)}`;
          }
        }
      }
      pending.push(
        store.put(
          conversationKey,
          withTurn({ ...conversation, criteria }, text, response),
        ),
      );
    }
  } catch (error) {
    response =
      error instanceof Error && error.message.startsWith("That location")
        ? error.message
        : "Sorry, I couldn’t finish that just now. Want to try again? I’ve kept the details you already shared.";
  }
  // The inbound event is already claimed, so a duplicate will not send again.
  try {
    const providerId = await transport.send(response);
    await Promise.all([
      store.put(eventKey, {
        status: providerId ? "accepted" : "unknown",
        at: Date.now(),
        providerId,
      }),
      ...pending,
      settlePair?.(providerId) ?? Promise.resolve(),
    ]);
    return { status: providerId ? "accepted" : "unknown" };
  } catch (err) {
    console.error(
      "iMessage reply was not sent.",
      err instanceof Error ? `${err.name}: ${err.message}` : String(err),
    );
    await Promise.all([
      store.put(eventKey, { status: "failed", at: Date.now() }),
      ...pending,
      settlePair?.(undefined, true) ?? Promise.resolve(),
    ]);
    return { status: "failed" };
  }
}
