import { homedir } from "node:os";
import { join } from "node:path";

// 让 zxk-chat CLI 固定使用全局配置目录，避免受"当前目录有 .env"的本地模式影响。
// 仅在未显式设置 ZXK_CONFIG_DIR 时生效；本地 dev（npm run dev/cli）不经过此文件。
if (!process.env.ZXK_CONFIG_DIR) {
  process.env.ZXK_CONFIG_DIR = join(homedir(), ".config", "zxk-chat-bot");
}
