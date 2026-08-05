import type { IncomingMessage } from "@wechatbot/wechatbot";
import { Auth } from "./auth.js";
import { commands } from "./commands.js";
import { config } from "./config.js";
import type { ConversationStore } from "./conversation.js";
import { tidyMarkdown } from "./format.js";
import { log, shortId } from "./log.js";
import type { OpenCodeClient } from "./opencode.js";

export interface Messenger {
  typing(userId: string): Promise<void>;
  reply(userId: string, text: string): Promise<void>;
  log(line: string): void;
}

const DEDUP_WINDOW_MS = 5000;

export class Gateway {
  private busy = new Set<string>();
  private recent = new Map<string, number>();
  private locks = new Map<string, Promise<unknown>>();

  constructor(
    private opencode: OpenCodeClient,
    private conversations: ConversationStore,
    private auth: Auth,
    private messenger: Messenger,
  ) {
    // 安全网：prompt 万一卡死，session.idle 到达时释放该用户的 busy 锁
    this.opencode.onSessionIdle((sessionID) => {
      const rec = this.conversations.findBySessionId(sessionID);
      if (rec && this.busy.has(rec.wechatUserId)) {
        this.messenger.log(`会话 ${sessionID} 已空闲，释放 busy 锁`);
        this.busy.delete(rec.wechatUserId);
      }
    });
  }

  handle(msg: IncomingMessage): Promise<void> {
    const userId = msg.userId;
    const prev = this.locks.get(userId) ?? Promise.resolve();
    const next = prev.then(() => this.handleLocked(msg)).catch((e) => {
      log.error("gateway", `处理异常: ${e instanceof Error ? e.message : String(e)}`);
    });
    this.locks.set(userId, next);
    next.finally(() => {
      if (this.locks.get(userId) === next) this.locks.delete(userId);
    });
    return next.then(() => undefined);
  }

  private async handleLocked(msg: IncomingMessage): Promise<void> {
    const { userId } = msg;

    // 白名单 / 首次配对
    if (!this.auth.isAllowed(userId)) {
      if (this.auth.pair(userId)) {
        this.messenger.log(`已配对用户 ${shortId(userId)}（可写入 ALLOW_FROM 固化）`);
      } else {
        this.messenger.log(`忽略非白名单用户 ${shortId(userId)}`);
        return;
      }
    }

    // 去重
    const dedupKey = msg.raw?.message_id
      ? `${userId}:${msg.raw.message_id}`
      : `${userId}:${msg.text}:${msg.timestamp.getTime()}`;
    const now = Date.now();
    if (this.isDuplicate(dedupKey, now)) {
      this.messenger.log(`去重跳过消息 ${shortId(dedupKey)}`);
      return;
    }

    const text = msg.text.trim();
    if (!text) {
      if (msg.images.length || msg.files.length || msg.videos.length) {
        await this.messenger.reply(userId, "V1 只处理文本，暂不支持图片/文件。").catch(() => {});
      }
      return;
    }

    // 命令
    if (text.startsWith("/")) {
      const [name, ...args] = text.slice(1).split(/\s+/);
      const cmd = commands.get(name.toLowerCase());
      if (!cmd) {
        await this.messenger.reply(userId, `未知命令 /${name}，发送 /help 查看可用命令`);
        return;
      }
      try {
        const result = await cmd.run({
          userId,
          args,
          conversations: this.conversations,
          opencode: this.opencode,
        });
        await this.messenger.reply(userId, result);
      } catch (e) {
        await this.messenger.reply(userId, `命令执行失败: ${(e as Error).message}`);
      }
      return;
    }

    // 会话消息：无会话或项目已切换则重建
    let rec = this.conversations.get(userId);
    if (!rec || rec.project !== this.opencode.project) {
      const id = await this.opencode.createSession(`微信: ${userId}`);
      const isSwitch = !!rec && rec.project !== this.opencode.project;
      rec = {
        wechatUserId: userId,
        opencodeSessionId: id,
        project: this.opencode.project,
        model: rec?.model,
        agent: rec?.agent ?? config.defaultAgent,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      this.conversations.set(userId, rec);
      await this.messenger.reply(userId, isSwitch ? "已切换项目，创建新会话。" : "已为你创建新会话。");
    }

    if (this.busy.has(userId)) {
      await this.messenger.reply(userId, "上一条还在处理中，稍后再试（或发送 /abort 中断）");
      return;
    }

    this.busy.add(userId);
    await this.messenger.typing(userId).catch(() => {});
    try {
      const texts = await this.opencode.sendText(rec.opencodeSessionId, text, {
        agent: rec.agent,
        model: rec.model,
      });
      const reply = tidyMarkdown(texts.join("\n\n"));
      await this.messenger.reply(userId, reply || "（本次没有文本回复）");
      rec.updatedAt = Date.now();
      this.conversations.set(userId, rec);
    } catch (e) {
      await this.messenger.reply(userId, `处理出错: ${(e as Error).message}`);
    } finally {
      this.busy.delete(userId);
    }
  }

  private isDuplicate(key: string, now: number): boolean {
    const last = this.recent.get(key);
    this.recent.set(key, now);
    if (this.recent.size > 500) {
      for (const [k, t] of this.recent) {
        if (now - t > DEDUP_WINDOW_MS) this.recent.delete(k);
      }
    }
    return last !== undefined && now - last < DEDUP_WINDOW_MS;
  }
}
