import { createServer, type Server } from "node:http";
import { config } from "./config.js";
import type { ConversationStore } from "./conversation.js";

export const NOTIFY_MAX_LENGTH = 2000;

export interface NotifyHook {
  port: number;
  close(): void;
}

/**
 * 本地 HTTP hook：opencode 插件的 wechat_notify 工具通过它把消息送回网关，
 * 由网关转发到对应微信用户。仅绑定 127.0.0.1，Bearer token 校验。
 */
export function startNotifyHook(
  conversations: ConversationStore,
  send: (userId: string, text: string) => Promise<void>,
): NotifyHook {
  const server: Server = createServer((req, res) => {
    if (req.method !== "POST" || req.url !== "/notify") {
      res.writeHead(404).end("not found");
      return;
    }
    if (req.headers.authorization !== `Bearer ${config.hookToken}`) {
      res.writeHead(401).end("unauthorized");
      return;
    }

    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1e5) req.destroy();
    });
    req.on("error", () => res.destroy());
    req.on("end", () => {
      try {
        const data = JSON.parse(body) as { sessionID?: string; message?: string };
        if (!data.sessionID || typeof data.message !== "string") {
          res.writeHead(400).end("bad request");
          return;
        }
        const rec = conversations.findBySessionId(data.sessionID);
        if (!rec) {
          res.writeHead(404).end("session not found");
          return;
        }
        const text = data.message.slice(0, NOTIFY_MAX_LENGTH);
        send(rec.wechatUserId, text)
          .then(() => res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ ok: true })))
          .catch((e) => res.writeHead(500).end(String(e)));
      } catch (e) {
        res.writeHead(500).end(String(e));
      }
    });
  });

  server.listen(config.hookPort, "127.0.0.1");
  return {
    port: config.hookPort,
    close: () => server.close(),
  };
}
