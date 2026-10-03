import { Spectrum } from "@spectrum-ts/core";
import { imessage } from "@spectrum-ts/imessage";
import { handleIncoming } from "../src/lib/messaging";
const nodeMajor = Number(process.versions.node.split(".")[0]);
if (nodeMajor < 24) {
  console.error(
    `This worker is running Node ${process.versions.node}. Navidate needs Node 24.`,
  );
  console.error("From the navidate folder: nvm use && npm run worker:photon");
  process.exit(1);
}
async function main() {
  if (!process.env.SPECTRUM_PROJECT_ID || !process.env.SPECTRUM_PROJECT_SECRET)
    throw new Error("Set Spectrum project credentials in .env.local first.");
  const app = await Spectrum({
    projectId: process.env.SPECTRUM_PROJECT_ID,
    projectSecret: process.env.SPECTRUM_PROJECT_SECRET,
    providers: [imessage.config()],
    options: { logLevel: "error" },
  });
  for (const signal of ["SIGINT", "SIGTERM"] as const)
    process.on(signal, () => {
      void app.stop().then(() => process.exit(0));
    });
  console.log(
    "Navidate Spectrum worker connected. Listening for direct messages and shared map links.",
  );
  for await (const [space, message] of app.messages) {
    if (
      message.direction === "outbound" ||
      (message.content.type !== "text" &&
        message.content.type !== "richlink") ||
      !message.sender
    )
      continue;
    if ("type" in space && space.type !== "dm") continue;
    try {
      await handleIncoming(
        {
          id: message.id,
          spaceId: space.id,
          senderId: message.sender.id,
          platform: "imessage",
          text:
            message.content.type === "text"
              ? message.content.text
              : message.content.url,
          own: message.sender.kind === "agent",
          direct: true,
        },
        {
          send: async (text) => {
            const sent = await space.send(text);
            return sent?.id;
          },
        },
      );
    } catch (err) {
      const detail =
        err instanceof Error
          ? `${err.name}: ${err.message}`
          : typeof err === "object" && err && "message" in err
            ? String(err.message)
            : String(err);
      console.error("Message handling failed.", detail.split("\n")[0]);
    }
  }
}
main().catch(() => {
  console.error(
    "Spectrum worker could not connect. Check credentials and dashboard line status, then restart.",
  );
  process.exitCode = 1;
});
