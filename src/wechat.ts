import { mkdirSync } from "node:fs";
import qrcode from "qrcode-terminal";
import { createLogger, WeChatBot } from "@wechatbot/wechatbot";
import { Auth } from "./auth.js";
import { config } from "./config.js";
import type { ConversationStore } from "./conversation.js";
import { Gateway } from "./gateway.js";
import { startNotifyHook } from "./hook.js";
import { fileTransport, log, shortId } from "./log.js";
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
    logger: createLogger({ level: config.logLevel as "debug" | "info" | "warn" | "error", transport: fileTransport }),
    botAgent: "ZXKChatBot/0.1",
  });

  const loginCallbacks = {
    onQrUrl: (url: string) => {
      log.info("wechat", `请用微信扫码登录：${url}`);
      try {
        qrcode.generate(url, { small: true }, (s: string) => console.log(s));
      } catch {
        // 终端不支持二维码时仅打印链接
      }
    },
    onScanned: () => log.info("wechat", "已扫码，请在手机上确认..."),
    onExpired: () => log.info("wechat", "二维码已过期，正在刷新..."),
  };

  const messenger = {
    typing: (userId: string) => bot.sendTyping(userId),
    reply: (userId: string, text: string) => bot.send(userId, { text }),
    log: (line: string) => log.info("gateway", line),
  };

  const gateway = new Gateway(opencode, conversations, auth, messenger);

  bot.on("login", (creds) =>
    log.info("wechat", `登录成功: account=${creds.accountId} userId=${shortId(creds.userId)}`),
  );
  bot.on("session:expired", () => log.warn("wechat", "会话过期，需要重新扫码"));
  bot.on("error", (e) => log.error("wechat", `error: ${e instanceof Error ? e.message : String(e)}`));

  bot.onMessage((msg) => {
    gateway.handle(msg).catch((e) =>
      log.error("gateway", `处理异常: ${e instanceof Error ? e.message : String(e)}`),
    );
  });

  await bot.run({ callbacks: loginCallbacks });
  log.info("wechat", "已开始监听消息");

  // 通知 hook：opencode 插件的 wechat_notify 工具把消息送回网关 → 转发微信
  const hook = startNotifyHook(conversations, (userId, text) => bot.send(userId, { text }));
  log.info("wechat", `通知 hook 已启动 127.0.0.1:${hook.port}`);

  return {
    gateway,
    stop: () => {
      hook.close();
      bot.stop();
    },
  };
}
