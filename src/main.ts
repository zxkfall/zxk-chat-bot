import { Auth } from "./auth.js";
import { config } from "./config.js";
import { ConversationStore } from "./conversation.js";
import { OpenCodeClient } from "./opencode.js";
import { startWeChat } from "./wechat.js";

async function main(): Promise<void> {
  if (config.allowFrom.size === 0) {
    console.warn(
      "[config] 警告: ALLOW_FROM 为空，启用首次配对模式（第一个发消息的用户将被允许）。建议配对后把其 ID 写入 ALLOW_FROM。",
    );
  }

  const opencode = new OpenCodeClient();
  await opencode.start();

  const conversations = new ConversationStore();
  conversations.load();

  // 校验会话映射：session 的真实目录与记录项目不一致，或会话已不存在，则丢弃（下次懒重建）
  for (const rec of conversations.all()) {
    const dir = await opencode.getSessionDirectory(rec.opencodeSessionId).catch(() => undefined);
    if (!dir || dir !== rec.project) {
      console.warn(
        `[conversation] 会话 ${rec.opencodeSessionId} 与记录不符（${dir ?? "不存在"} vs ${rec.project}），已重置用户 ${rec.wechatUserId}`,
      );
      conversations.delete(rec.wechatUserId);
    }
  }

  const auth = new Auth();
  auth.load();

  const { stop } = await startWeChat(opencode, conversations, auth);

  const shutdown = (): void => {
    console.log("\n正在退出...");
    stop();
    opencode.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((e) => {
  console.error("启动失败:", e);
  process.exit(1);
});
