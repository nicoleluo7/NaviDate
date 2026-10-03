import Planner from "@/components/planner/Planner";
import { connection } from "next/server";
export default async function Home() {
  await connection();
  return (
    <Planner
      ai={
        !!process.env.XAI_API_KEY &&
        process.env.DISABLE_EXTERNAL_APIS !== "true"
      }
      photon={
        !!(
          process.env.SPECTRUM_PROJECT_ID &&
          process.env.SPECTRUM_PROJECT_SECRET &&
          process.env.PHOTON_AGENT_ADDRESS
        )
      }
    />
  );
}
