import { mkdirSync } from "node:fs";
import qrcode from "qrcode-terminal";
import { WeChatBot } from "@wechatbot/wechatbot";
import { Auth } from "./auth.js";
import { config } from "./config.js";
import type { ConversationStore } from "./conversation.js";
import { Gateway } from "./gateway.js";
import { startNotifyHook } from "./hook.js";
import type { OpenCodeClient } from "./opencode.js";

export async function startWeChat(
  opencode: OpenCodeClient,
  conversations: ConversationStore,
  auth: Auth,
): Promise<{ gateway: Gateway; stop(): void }> {
  mkdirSync(config.wechatStorageDir, { recursive: true });

  const bot = new WeChatBot({
    storage: "file",
    storageDir: config.wechatStorageDir,
    logLevel: "info",
    botAgent: "ZXKChatBot/0.1",
  });

  const loginCallbacks = {
    onQrUrl: (url: string) => {
      console.log(`\n[wechat] 请用微信扫码登录：\n${url}\n`);
      try {
        qrcode.generate(url, { small: true }, (s: string) => console.log(s));
      } catch {
        // 终端不支持二维码时仅打印链接
      }
    },
    onScanned: () => console.log("[wechat] 已扫码，请在手机上确认..."),
    onExpired: () => console.log("[wechat] 二维码已过期，正在刷新..."),
  };

  const messenger = {
    typing: (userId: string) => bot.sendTyping(userId),
    reply: (userId: string, text: string) => bot.send(userId, { text }),
    log: (line: string) => console.log(line),
  };

  const gateway = new Gateway(opencode, conversations, auth, messenger);

  bot.on("login", (creds) =>
    console.log(`[wechat] 登录成功: account=${creds.accountId} userId=${creds.userId}`),
  );
  bot.on("session:expired", () => console.log("[wechat] 会话过期，需要重新扫码"));
  bot.on("error", (e) => console.error("[wechat] error:", e));

  bot.onMessage((msg) => {
    gateway.handle(msg).catch((e) => console.error("[gateway] 处理异常:", e));
  });

  await bot.run({ callbacks: loginCallbacks });
  console.log("[wechat] 已开始监听消息");

  // 通知 hook：opencode 插件的 wechat_notify 工具把消息送回网关 → 转发微信
  const hook = startNotifyHook(conversations, (userId, text) => bot.send(userId, { text }));
  console.log(`[wechat] 通知 hook 已启动 127.0.0.1:${hook.port}`);

  return {
    gateway,
    stop: () => {
      hook.close();
      bot.stop();
    },
  };
}
