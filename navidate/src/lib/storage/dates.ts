import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import type { Criteria, Plan, SavedDate } from "@/types";
import { getStorage, type Storage } from ".";
export const randomId = () => randomBytes(24).toString("base64url");
export const hash = (text: string) =>
  createHash("sha256").update(text).digest("hex");
export function isOwner(record: { ownerHash: string }, token: string) {
  const a = Buffer.from(record.ownerHash),
    b = Buffer.from(hash(token));
  return a.length === b.length && timingSafeEqual(a, b);
}
export async function saveDate(
  criteria: Criteria,
  plan: Plan,
  ownerToken: string,
  storage: Storage = getStorage(),
): Promise<SavedDate> {
  const record = {
    shareId: randomId(),
    ownerHash: hash(ownerToken),
    criteria,
    plan,
    createdAt: new Date().toISOString(),
  };
  await storage.put("date:" + record.shareId, record);
  return record;
}
export function publicPlan(plan: Plan): Plan {
  if (!plan.start.private) return plan;
  const safe = structuredClone(plan),
    point = safe.stops[0].place.coordinates;
  safe.start = {
    ...point,
    name: "Private starting point hidden",
    private: true,
  };
  safe.legs = safe.legs.map((leg, i) =>
    i === 0 || leg.toName === plan.start.name
      ? {
          ...leg,
          from: point,
          to: point,
          fromName: i === 0 ? "Private start" : leg.fromName,
          toName: i === 0 ? leg.toName : "Private return",
          geometry: undefined,
          bus: undefined,
          label: "Private travel segment hidden",
        }
      : leg,
  );
  return safe;
}
