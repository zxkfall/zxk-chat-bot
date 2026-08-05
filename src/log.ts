import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { LogTransport } from "@wechatbot/wechatbot";
import { config } from "./config.js";

type Level = "debug" | "info" | "warn" | "error";
const LEVELS: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3 };
const threshold = LEVELS[config.logLevel as Level] ?? LEVELS.info;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function todayFile(): string {
  const d = new Date();
  return join(config.logDir, `bot-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}.log`);
}

function write(level: Level, module: string, message: string): void {
  if (LEVELS[level] < threshold) return;
  const line = `${new Date().toISOString()} [${level}] [${module}] ${message}\n`;
  const stream = level === "warn" || level === "error" ? process.stderr : process.stdout;
  stream.write(line);
  try {
    mkdirSync(config.logDir, { recursive: true });
    appendFileSync(todayFile(), line);
  } catch {
    // 文件写入失败不影响终端输出
  }
}

export const log = {
  debug: (module: string, message: string) => write("debug", module, message),
  info: (module: string, message: string) => write("info", module, message),
  warn: (module: string, message: string) => write("warn", module, message),
  error: (module: string, message: string) => write("error", module, message),
};

/** 把 @wechatbot/wechatbot 的协议日志接入同一 sink */
export const fileTransport: LogTransport = {
  write(entry) {
    if (entry.level === "silent") return;
    write(entry.level, entry.context ?? "wechat-sdk", entry.message);
  },
};

/** 微信 userId 截断，避免长 ID 刷屏日志 */
export function shortId(id: string, max = 10): string {
  if (id.length <= max) return id;
  return id.slice(0, max) + "…";
}
