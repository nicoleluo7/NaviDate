import { connection } from "next/server";
import LocationShare from "@/components/planner/LocationShare";
export default async function LocationPage() {
  await connection();
  return <LocationShare address={process.env.PHOTON_AGENT_ADDRESS ?? ""} />;
}
