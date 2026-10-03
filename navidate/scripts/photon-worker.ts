import { Spectrum } from "@spectrum-ts/core";
import { imessage } from "@spectrum-ts/imessage";
import { handleIncoming } from "../src/lib/messaging";
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
    "Navidate Spectrum worker connected. Incoming direct text messages only.",
  );
  for await (const [space, message] of app.messages) {
    if (
      message.direction === "outbound" ||
      message.content.type !== "text" ||
      !message.sender
    )
      continue;
    try {
      const im = imessage(app),
        resolved = await im.space.get(space.id);
      if (resolved.type !== "dm") continue;
      await handleIncoming(
        {
          id: message.id,
          spaceId: space.id,
          senderId: message.sender.id,
          platform: "imessage",
          text: message.content.text,
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
    } catch {
      console.error(
        "Message handling failed. No message content or credentials logged.",
      );
    }
  }
}
main().catch(() => {
  console.error(
    "Spectrum worker could not connect. Check credentials and dashboard line status, then restart.",
  );
  process.exitCode = 1;
});
