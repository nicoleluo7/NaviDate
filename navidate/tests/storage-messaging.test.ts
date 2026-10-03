import { it, expect, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalStorage } from "../src/lib/storage";
import { handleIncoming, parseLocal } from "../src/lib/messaging";
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
