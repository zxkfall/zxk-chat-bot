import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

try {
  process.loadEnvFile(".env");
} catch {
  // .env 不存在时使用默认值
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

export const config = {
  botName: str("BOT_NAME", "ZXK Bot"),
  allowFrom: new Set(list("ALLOW_FROM")),
  opencodeCwd: str("OPENCODE_CWD"),
  opencodePort: int("OPENCODE_PORT", 4096),
  defaultAgent: str("DEFAULT_AGENT", "build") as "build" | "plan",
  wechatStorageDir: resolve(".", str("WECHAT_STORAGE_DIR", "./data/wechat")),
  dataDir: resolve(".", "data"),
  projects: list("PROJECTS"),
  autoApprove: str("AUTO_APPROVE_PERMISSIONS", "true") !== "false",
  hookPort: int("HOOK_PORT", 19890),
  hookToken: str("HOOK_TOKEN") || randomBytes(16).toString("hex"),
};

if (!config.opencodeCwd) {
  throw new Error("OPENCODE_CWD 未配置：请在 .env 中指定 opencode 工作目录");
}

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
