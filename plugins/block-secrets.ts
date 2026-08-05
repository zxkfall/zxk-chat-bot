import { type Plugin } from "@opencode-ai/plugin";

/**
 * 安全插件：仅对机器人 spawn 的 opencode serve（ZXK_BOT_GATEWAY=1）生效。
 * 拦截 read/bash/edit/grep 等工具对敏感文件的访问（.env、微信凭据、会话映射）。
 * 你自己的 TUI/桌面会话不受影响。
 */
const SENSITIVE_PATTERNS = [
  /\.env(?=[^A-Za-z0-9])/, // .env / .env.local / ...
  /data[\\/]wechat/,
  /paired\.json/,
  /conversations\.json/,
];

export const BlockSecretsPlugin: Plugin = async () => {
  return {
    "tool.execute.before": async (_input, output) => {
      if (process.env.ZXK_BOT_GATEWAY !== "1") return;
      const s = JSON.stringify(output.args ?? {});
      for (const re of SENSITIVE_PATTERNS) {
        const m = s.match(re);
        if (m) {
          throw new Error(`安全限制：机器人会话禁止访问敏感文件（${m[0]}）`);
        }
      }
    },
  };
};
