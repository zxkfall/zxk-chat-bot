import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const DEFAULT_CONFIG_DIR = join(homedir(), ".config", "zxk-chat-bot");

// 配置定位：
//  1) ZXK_CONFIG_DIR 显式指定
//  2) 仓库/当前目录有 .env → 本地模式（cwd 相对，兼容 npm run dev）
//  3) 否则用全局默认 ~/.config/zxk-chat-bot/
function resolveConfigDir(): string {
  if (process.env.ZXK_CONFIG_DIR) return resolve(process.env.ZXK_CONFIG_DIR);
  if (existsSync(resolve(".", ".env"))) return ".";
  return DEFAULT_CONFIG_DIR;
}

const configDir = resolveConfigDir();

if (configDir === ".") {
  try {
    process.loadEnvFile(".env");
  } catch {
    // 无 .env 用默认值
  }
} else {
  try {
    process.loadEnvFile(join(configDir, ".env"));
  } catch {
    // 未配置过，用默认值
  }
}

function str(name: string, fallback = ""): string {
  const v = process.env[name];
  return v === undefined || v === "" ? fallback : v.trim();
}

function int(name: string, fallback: number): number {
  const v = Number.parseInt(str(name, String(fallback)), 10);
  return Number.isFinite(v) ? v : fallback;
}

function list(name: string): string[] {
  return str(name)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// data 根目录：可用 DATA_DIR 覆盖（如测试隔离），否则跟随 configDir
const dataDir = resolve(configDir === "." ? "." : configDir, str("DATA_DIR", "data"));

export const config = {
  configDir: configDir === "." ? process.cwd() : configDir,
  botName: str("BOT_NAME", "ZXK Bot"),
  allowFrom: new Set(list("ALLOW_FROM")),
  opencodeCwd: str("OPENCODE_CWD"),
  opencodePort: int("OPENCODE_PORT", 4096),
  defaultAgent: str("DEFAULT_AGENT", "build") as "build" | "plan",
  wechatStorageDir: resolve(".", str("WECHAT_STORAGE_DIR", join(dataDir, "wechat"))),
  dataDir,
  projects: list("PROJECTS"),
  autoApprove: str("AUTO_APPROVE_PERMISSIONS", "true") !== "false",
  hookPort: int("HOOK_PORT", 19890),
  hookToken: str("HOOK_TOKEN") || randomBytes(16).toString("hex"),
  logLevel: str("LOG_LEVEL", "info"),
  logDir: resolve(".", str("LOG_DIR", join(dataDir, "logs"))),
};

// OPENCODE_CWD 未配置时不在 import 期抛错（setup/uninstall/status 等命令可能不需要它），
// 由 OpenCodeClient.start() 在使用时校验并给出明确提示。

if (config.projects.length === 0) {
  config.projects.push(config.opencodeCwd);
} else {
  config.projects = config.projects.filter((p) => {
    const ok = existsSync(p);
    if (!ok) console.warn(`[config] 项目目录不存在，已忽略: ${p}`);
    return ok;
  });
  if (!config.projects.includes(config.opencodeCwd)) {
    config.projects.unshift(config.opencodeCwd);
  }
}
