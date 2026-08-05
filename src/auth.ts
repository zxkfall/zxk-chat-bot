import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "./config.js";
import { log } from "./log.js";

const file = resolve(config.dataDir, "paired.json");

export class Auth {
  private paired = new Set<string>();

  load(): void {
    if (!existsSync(file)) return;
    try {
      this.paired = new Set(JSON.parse(readFileSync(file, "utf8")) as string[]);
    } catch (e) {
      log.error("auth", `读取配对数据失败: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  isAllowed(userId: string): boolean {
    if (config.allowFrom.has(userId)) return true;
    // allowlist 已配置时严格拒绝；未配置时走首次配对
    if (config.allowFrom.size > 0) return false;
    return this.paired.has(userId);
  }

  /** 配对第一个发来消息的用户，返回是否新配对 */
  pair(userId: string): boolean {
    if (this.paired.has(userId)) return false;
    this.paired.add(userId);
    mkdirSync(config.dataDir, { recursive: true });
    writeFileSync(file, JSON.stringify([...this.paired], null, 2));
    return true;
  }
}
