import { OpenCodeClient } from "../src/opencode.js";

async function main(): Promise<void> {
  const oc = new OpenCodeClient();
  await oc.start();
  try {
    const sid = await oc.createSession("ping");
    console.log("session:", sid);
    const texts = await oc.sendText(sid, "只回复两个字：你好");
    console.log("reply:", JSON.stringify(texts, null, 2));
  } finally {
    oc.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
