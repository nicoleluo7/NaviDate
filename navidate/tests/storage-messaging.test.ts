import { it, expect, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalStorage } from "../src/lib/storage";
import { handleIncoming, messagesLink, parseLocal } from "../src/lib/messaging";
import {
  answerAboutDate,
  conversationalIntro,
} from "../src/lib/messaging/questions";
import { hash, isOwner, publicPlan } from "../src/lib/storage/dates";
import { criteriaSchema, type Plan } from "../src/types";
it("persists across closing and reopening the local adapter", async () => {
  const path = join(mkdtempSync(join(tmpdir(), "navidate-")), "data.sqlite");
  const a = new LocalStorage(path);
  await a.put("hello", { durable: true });
  a.close();
  const b = new LocalStorage(path);
  expect(await b.get("hello")).toEqual({ durable: true });
  b.close();
});
it("deduplicates concurrent Photon deliveries and skips own messages", async () => {
  const store = new LocalStorage(":memory:"),
    send = vi.fn(async () => "provider-id");
  const event = {
    id: "one",
    spaceId: "space",
    senderId: "sender",
    platform: "local" as const,
    text: "hello",
    own: false,
    direct: true,
  };
  await Promise.all([
    handleIncoming(event, { send }, store),
    handleIncoming(event, { send }, store),
  ]);
  expect(send).toHaveBeenCalledTimes(1);
  await handleIncoming({ ...event, id: "two", own: true }, { send }, store);
  expect(send).toHaveBeenCalledTimes(1);
  store.close();
});
it("records failed sends without replaying ambiguous deliveries", async () => {
  const store = new LocalStorage(":memory:"),
    send = vi.fn(async () => {
      throw new Error("timeout");
    });
  const event = {
    id: "one",
    spaceId: "s",
    senderId: "u",
    platform: "local" as const,
    text: "hi",
    own: false,
    direct: true,
  };
  expect((await handleIncoming(event, { send }, store)).status).toBe("failed");
  expect((await handleIncoming(event, { send }, store)).status).toBe(
    "duplicate",
  );
  expect(send).toHaveBeenCalledTimes(1);
  store.close();
});
it("separates public share IDs from creator authorization", () => {
  const record = { ownerHash: hash("private-cookie"), shareId: "public" };
  expect(isOwner(record, "public")).toBe(false);
  expect(isOwner(record, "private-cookie")).toBe(true);
});
it("redacts precise private starting coordinates and route geometry", () => {
  const plan = {
    start: { lat: 42.42, lng: -76.51, name: "Home", private: true },
    stops: [{ place: { coordinates: { lat: 42.45, lng: -76.48 } } }],
    legs: [
      {
        from: { lat: 42.42, lng: -76.51 },
        toName: "Venue",
        geometry: [{ lat: 42.42, lng: -76.51 }],
      },
    ],
  } as Plan;
  expect(JSON.stringify(publicPlan(plan))).not.toContain("42.42");
  expect(plan.start.lat).toBe(42.42);
});
it("builds an iMessage link with the pair code filled in", () => {
  expect(messagesLink("+14155951440", "4F5F8F1D4520D3E1")).toBe(
    "sms:+14155951440&body=pair%204F5F8F1D4520D3E1",
  );
});
it("answers address, one stop, leave time, walk, and stop cost from the saved plan", () => {
  const now = Date.parse("2026-10-03T17:10:00.000Z");
  const plan = {
    title: "Afternoon",
    startsAt: "2026-10-03T17:00:00.000Z",
    endsAt: "2026-10-03T19:26:00.000Z",
    duration: 146,
    cost: 32,
    walkKm: 2.2,
    weather: { available: true, summary: "Clear.", source: "test" },
    warnings: ["Some opening hours are unverified."],
    stops: [
      {
        place: {
          name: "Cornell Arts Quad",
          address: "Arts Quad, Cornell",
          estimatedCostForTwo: 0,
          typicalDurationMinutes: 25,
        },
        arrival: "2026-10-03T17:00:00.000Z",
        departure: "2026-10-03T17:25:00.000Z",
      },
      {
        place: {
          name: "Libe Slope",
          address: "Libe Slope, Cornell",
          estimatedCostForTwo: 0,
          typicalDurationMinutes: 25,
          openingHours: {
            weekly: { "6": [["09:00", "12:00"]] },
            exceptions: {},
          },
        },
        arrival: "2026-10-03T17:40:00.000Z",
        departure: "2026-10-03T18:05:00.000Z",
      },
      {
        place: {
          name: "Hound and Mare",
          address: "123 Dryden Rd",
          estimatedCostForTwo: 32,
          typicalDurationMinutes: 40,
          websiteUrl: "https://hound.example",
          openingHours: {
            weekly: { "6": [["11:00", "22:00"]] },
            exceptions: {},
          },
        },
        arrival: "2026-10-03T18:46:00.000Z",
        departure: "2026-10-03T19:26:00.000Z",
      },
    ],
    legs: [
      {
        mode: "walk",
        fromName: "Cornell Arts Quad",
        toName: "Libe Slope",
        departure: "2026-10-03T17:25:00.000Z",
        minutes: 15,
        walkKm: 0.6,
      },
      {
        mode: "walk",
        fromName: "Libe Slope",
        toName: "Hound and Mare",
        departure: "2026-10-03T18:05:00.000Z",
        minutes: 41,
        walkKm: 1.6,
      },
    ],
  } as unknown as Plan;
  const ask = (text: string, history: { role: string; text: string }[] = []) =>
    answerAboutDate(plan, "http://localhost/date/abc", text, history, now);
  expect(ask("where is hound and. mare")).toBe(
    "Hound and Mare is at 123 Dryden Rd.",
  );
  expect(ask("where's hound and mare")).toBe(
    "Hound and Mare is at 123 Dryden Rd.",
  );
  expect(
    ask("what is the address", [
      { role: "user", text: "where is hound and mare" },
    ]),
  ).toBe("Hound and Mare is at 123 Dryden Rd.");
  expect(ask("what's the second stop")).toContain("Libe Slope");
  expect(ask("when do I leave arts quad")).toContain("Leave Cornell Arts Quad");
  expect(ask("how long from libe slope to hound and mare")).toContain(
    "Libe Slope to Hound and Mare",
  );
  expect(ask("how long from arts quad to hound and mare")).toContain(
    "aren't next to each other",
  );
  expect(ask("how much is hound and mare")).toBe(
    "About $32 for two at Hound and Mare.",
  );
  expect(ask("how much is this date")).toBe("Estimated $32 for two.");
  expect(ask("what's the website for hound and mare")).toBe(
    "Hound and Mare: https://hound.example",
  );
  expect(ask("what's the website for libe slope")).toContain(
    "don't have a website",
  );
  expect(ask("what's next")).toContain("Libe Slope");
  expect(ask("anything I should know")).toContain("unverified");
  expect(ask("is hound and mare open when we get there")).toBe(
    "Hound and Mare is open 11 AM to 10 PM.",
  );
  expect(ask("is libe slope open")).toBe("Libe Slope is open 9 AM to 12 PM.");
  expect(ask("is arts quad open")).toContain("don't have opening hours");
  expect(ask("where should we be")).toContain("Cornell Arts Quad");
  expect(ask("are we on time")).toContain("Cornell Arts Quad");
  expect(
    answerAboutDate(
      plan,
      "http://localhost/date/abc",
      "where should we be",
      [],
      Date.parse("2026-10-03T18:20:00.000Z"),
    ),
  ).toContain("heading to Hound and Mare");
  expect(ask("where are we going")).toContain("Cornell Arts Quad");
  expect(ask("where are we going")).toContain("Hound and Mare");
  expect(
    ask("and after that?", [{ role: "user", text: "we are at arts quad" }]),
  ).toContain("Libe Slope");
});
it("answers basic questions about a paired date", async () => {
  const plan = {
    title: "Coffee",
    startsAt: "2026-10-03T17:00:00.000Z",
    endsAt: "2026-10-03T19:00:00.000Z",
    duration: 120,
    cost: 40,
    walkKm: 1.2,
    weather: { available: true, summary: "Clear and mild.", source: "test" },
    stops: [
      {
        place: { name: "Hound and Mare" },
        arrival: "2026-10-03T17:00:00.000Z",
      },
    ],
    warnings: [],
  } as unknown as Plan;
  expect(answerAboutDate(plan, "http://localhost/date/abc", "how much?")).toBe(
    "Estimated $40 for two.",
  );
  expect(conversationalIntro(plan)).toContain(
    "You're heading to Hound and Mare.",
  );
  const store = new LocalStorage(":memory:"),
    send = vi.fn<(text: string) => Promise<string>>(async () => "provider-id");
  await store.put("date:abc", {
    shareId: "abc",
    ownerHash: "owner",
    criteria: {},
    plan,
    createdAt: "2026-10-03T00:00:00.000Z",
  });
  await store.put("conversation:" + hash(["local", "space", "me"].join(":")), {
    criteria: {},
    shareId: "abc",
    revision: 0,
  });
  await handleIncoming(
    {
      id: "q1",
      spaceId: "space",
      senderId: "me",
      platform: "local",
      text: "what's the weather?",
      own: false,
      direct: true,
    },
    { send },
    store,
  );
  expect(send).toHaveBeenCalledWith("Clear and mild.");
  await handleIncoming(
    {
      id: "q2",
      spaceId: "space",
      senderId: "nobody",
      platform: "local",
      text: "what time?",
      own: false,
      direct: true,
    },
    { send },
    store,
  );
  expect(send.mock.calls.at(-1)?.[0]).toContain(
    "Where would you like to start",
  );
  store.close();
});
it("parses complete typed criteria locally and applies follow-up changes", () => {
  const c = parseLocal(
    "start=arts-quad; date=2026-10-03; time=13:00; duration=180; budget=50; vibe=Cozy; transport=walk",
    {},
  );
  expect(criteriaSchema.safeParse(c).success).toBe(true);
  expect(parseLocal("make it cheaper", c).budget).toBe(35);
  expect(parseLocal("start time 14:30", c).time).toBe("14:30");
  expect(parseLocal("make it indoors", c).setting).toBe("indoor");
});
