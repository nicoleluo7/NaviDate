import { z } from "zod";
import { criteriaSchema } from "@/types";
import { browseRestaurants } from "@/lib/maps/discovery";
import { body, guard, failure, HttpError } from "@/lib/api";
export async function POST(req: Request) {
  try {
    await guard(req);
    const { criteria } = z
      .object({ criteria: criteriaSchema })
      .parse(await body(req));
    try {
      return Response.json(
        { places: await browseRestaurants(criteria) },
        { headers: { "Cache-Control": "no-store" } },
      );
    } catch {
      throw new HttpError(
        503,
        "Restaurants couldn't be loaded. Retry in a moment; your preferences are saved.",
      );
    }
  } catch (e) {
    return failure(e);
  }
}
