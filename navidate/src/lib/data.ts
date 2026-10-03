import { z } from "zod";
import rawPlaces from "../../data/places.json";
import landmarks from "../../data/landmarks.json";
import stops from "../../data/transit/stops.json";
import routes from "../../data/transit/routes.json";
import trips from "../../data/transit/trips.json";
import calendars from "../../data/transit/service-calendar.json";
import { placeSchema } from "@/types";
import {
  transitStopSchema,
  routeSchema,
  tripSchema,
  calendarSchema,
} from "./transit";
export const places = z.array(placeSchema).parse(rawPlaces);
export { landmarks };
export const transit = {
  stops: z.array(transitStopSchema).parse(stops),
  routes: z.array(routeSchema).parse(routes),
  trips: z.array(tripSchema).parse(trips),
  calendars: z.array(calendarSchema).parse(calendars),
};
