import { createInterface } from "node:readline";
import { Auth } from "../src/auth.js";
import { ConversationStore } from "../src/conversation.js";
import { Gateway } from "../src/gateway.js";
import { startNotifyHook } from "../src/hook.js";
import { OpenCodeClient } from "../src/opencode.js";

async function main(): Promise<void> {
  const opencode = new OpenCodeClient();
  await opencode.start();
  const conversations = new ConversationStore();
  conversations.load();
  const auth = new Auth();
  auth.load();

  // 通知 hook：CLI 模式下转发到终端，便于验证 wechat_notify 工具
  const hook = startNotifyHook(conversations, async (_userId, text) => {
    console.log(`\n[notify] ${text}\n`);
  });
  console.log(`[cli] 通知 hook 已启动 127.0.0.1:${hook.port}`);

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const messenger = {
    typing: async () => {},
    reply: async (_userId: string, text: string) => {
      console.log(`\n[bot]\n${text}\n`);
    },
    log: (l: string) => console.log(l),
  };
  const gateway = new Gateway(opencode, conversations, auth, messenger);

  let seq = 0;
  let pending = 0;
  let closed = false;
  const fakeMsg = (text: string) =>
    ({
      userId: "cli_test_user",
      text,
      type: "text",
      timestamp: new Date(),
      images: [],
      files: [],
      voices: [],
      videos: [],
      raw: { message_id: ++seq },
    }) as never;

  const maybeExit = (): void => {
    if (closed && pending === 0) {
      hook.close();
      opencode.close();
      process.exit(0);
    }
  };

  console.log("CLI 测试模式。输入消息或 /命令，Ctrl+C 退出。");
  rl.on("line", (line) => {
    const t = line.trim();
    if (!t) return;
    pending++;
    gateway
      .handle(fakeMsg(t))
      .catch((e) => console.error("[cli] 异常:", e))
      .finally(() => {
        pending--;
        maybeExit();
      });
  });
  rl.on("close", () => {
    closed = true;
    maybeExit();
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
