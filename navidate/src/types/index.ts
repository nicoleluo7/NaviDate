import { z } from "zod";
export const pointSchema = z.object({
  lat: z.number().min(42.3).max(42.6),
  lng: z.number().min(-76.65).max(-76.3),
});
export type Point = z.infer<typeof pointSchema>;
export const vibeSchema = z.enum([
  "Cozy",
  "Romantic",
  "Adventurous",
  "Casual",
  "Creative",
]);
export const criteriaSchema = z.object({
  start: pointSchema.extend({
    id: z.string().max(80).optional(),
    name: z.string().min(1).max(120),
    private: z.boolean().default(true),
  }),
  date: z.iso.date(),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  duration: z.number().int().min(30).max(720),
  budget: z.number().min(0).max(1000),
  dateType: z
    .enum(["any", "food", "coffee", "dessert", "outdoors"])
    .default("any"),
  vibe: vibeSchema,
  transport: z.enum(["walk", "bus"]),
  dietary: z
    .array(z.enum(["vegetarian", "vegan", "gluten-free"]))
    .max(3)
    .default([]),
  setting: z.enum(["any", "indoor", "outdoor"]).default("any"),
  maxWalkKm: z.number().min(0.1).max(20).default(5),
  returnToStart: z.boolean().default(false),
  preferences: z.string().max(1000).default(""),
});
export type Criteria = z.infer<typeof criteriaSchema>;
export const hoursSchema = z.object({
  weekly: z.record(
    z.string(),
    z.array(
      z.tuple([
        z.string().regex(/^\d{2}:\d{2}$/),
        z.string().regex(/^\d{2}:\d{2}$/),
      ]),
    ),
  ),
  exceptions: z
    .record(z.string(), z.array(z.tuple([z.string(), z.string()])))
    .default({}),
});
export const placeSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.enum(["café", "food", "dessert", "park", "culture", "free"]),
  coordinates: pointSchema,
  address: z.string(),
  description: z.string(),
  vibeTags: z.array(vibeSchema),
  indoorOutdoor: z.enum(["indoor", "outdoor"]),
  estimatedCostForTwo: z.number().nonnegative(),
  typicalDurationMinutes: z.number().int().positive(),
  dietaryTags: z.array(z.string()),
  openingHours: hoursSchema.nullable(),
  websiteUrl: z.url(),
  sourceUrl: z.url(),
  verifiedAt: z.iso.date().nullable(),
  verificationStatus: z.enum([
    "source-reviewed",
    "needs-verification",
    "fixture",
  ]),
});
export type Place = z.infer<typeof placeSchema>;
export type Weather = {
  available: boolean;
  summary: string;
  rain?: number;
  high?: number;
  source: string;
};
export type Leg = {
  mode: "walk" | "bus";
  from: Point;
  to: Point;
  fromName: string;
  toName: string;
  departure: string;
  arrival: string;
  minutes: number;
  walkKm: number;
  cost: number;
  label: string;
  geometry?: Point[];
  bus?: {
    route: string;
    tripId: string;
    boarding: string;
    alighting: string;
    wait: number;
    ride: number;
    boardTime: string;
    alightTime: string;
    boardingPoint: Point;
    alightingPoint: Point;
    serviceDate: string;
    demo: boolean;
  };
};
export type Stop = { place: Place; arrival: string; departure: string };
export type Plan = {
  id: string;
  title: string;
  explanation: string;
  start: Criteria["start"];
  startsAt: string;
  endsAt: string;
  stops: Stop[];
  legs: Leg[];
  cost: number;
  duration: number;
  walkKm: number;
  warnings: string[];
  weather: Weather;
  suitability: string;
};
export type PlanResult = {
  plans: Plan[];
  notices: string[];
  error?: string;
  ai: boolean;
};
export type SavedDate = {
  shareId: string;
  ownerHash: string;
  criteria: Criteria;
  plan: Plan;
  createdAt: string;
};
