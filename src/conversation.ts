import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "./config.js";

export interface ConversationRecord {
  wechatUserId: string;
  opencodeSessionId: string;
  project?: string;
  model?: string;
  agent: string;
  createdAt: number;
  updatedAt: number;
}

const file = resolve(config.dataDir, "conversations.json");

export class ConversationStore {
  private records = new Map<string, ConversationRecord>();

  load(): void {
    if (!existsSync(file)) return;
    try {
      const parsed = JSON.parse(readFileSync(file, "utf8")) as Record<
        string,
        ConversationRecord
      >;
      for (const [k, v] of Object.entries(parsed)) {
        if (v?.opencodeSessionId) this.records.set(k, v);
      }
    } catch (e) {
      console.error("[conversation] 读取持久化数据失败:", e);
    }
  }

  save(): void {
    mkdirSync(config.dataDir, { recursive: true });
    writeFileSync(file, JSON.stringify(Object.fromEntries(this.records), null, 2));
  }

  get(userId: string): ConversationRecord | undefined {
    return this.records.get(userId);
  }

  set(userId: string, record: ConversationRecord): void {
    this.records.set(userId, record);
    this.save();
  }

  delete(userId: string): boolean {
    const ok = this.records.delete(userId);
    if (ok) this.save();
    return ok;
  }

  all(): ConversationRecord[] {
    return [...this.records.values()];
  }

  findBySessionId(sessionId: string): ConversationRecord | undefined {
    for (const rec of this.records.values()) {
      if (rec.opencodeSessionId === sessionId) return rec;
    }
    return undefined;
  }
}
