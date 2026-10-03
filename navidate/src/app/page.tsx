import Planner from "@/components/planner/Planner";
export default function Home() {
  return (
    <Planner
      ai={!!process.env.XAI_API_KEY}
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
