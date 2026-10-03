import { createInterface } from "node:readline/promises";
import { randomUUID } from "node:crypto";
import { handleIncoming } from "../src/lib/messaging";
async function main() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  console.log(
    "LOCAL TRANSPORT — no iMessages are sent. Type criteria or follow-up requests.",
  );
  for await (const text of rl) {
    await handleIncoming(
      {
        id: randomUUID(),
        spaceId: "local-demo",
        senderId: "local-user",
        platform: "local",
        text,
        own: false,
        direct: true,
      },
      {
        send: async (reply) => {
          console.log("\n[Local reply]\n" + reply + "\n");
          return "local-" + randomUUID();
        },
      },
    );
  }
}
void main();
