import {
  createOpencodeClient,
  createOpencodeServer,
  type OpencodeClient,
} from "@opencode-ai/sdk";
import { config } from "./config.js";

export interface OpenCodeModel {
  id: string;
  name: string;
}

function authHeaders(): Record<string, string> {
  const pass = process.env.OPENCODE_SERVER_PASSWORD;
  if (!pass) return {};
  const user = process.env.OPENCODE_SERVER_USERNAME || "opencode";
  const token = Buffer.from(`${user}:${pass}`).toString("base64");
  return { Authorization: `Basic ${token}` };
}

export class OpenCodeClient {
  private client?: OpencodeClient;
  private server?: { url: string; close(): void };
  private ownsServer = false;
  private _project = "";
  private idleWaiters = new Map<string, () => void>();
  private onSessionIdleCb?: (sessionID: string) => void;

  get project(): string {
    return this._project || config.opencodeCwd;
  }

  async start(): Promise<void> {
    await this.attach(config.opencodeCwd);
  }

  /** 切换项目：需要网关自己管理的 server 才能重启 */
  async setProject(dir: string): Promise<void> {
    if (!this.ownsServer) {
      throw new Error("检测到外部 opencode 服务（端口被占用），当前无法切换项目");
    }
    this.server?.close();
    this.client = undefined;
    this.server = undefined;
    this._project = "";
    await this.attach(dir);
  }

  onSessionIdle(cb: (sessionID: string) => void): void {
    this.onSessionIdleCb = cb;
  }

  /** 等待某个会话进入 idle，超时返回 false */
  async waitSessionIdle(sessionId: string, timeoutMs: number): Promise<boolean> {
    try {
      const st = await this.requireClient().session.status();
      if (st.data?.[sessionId]?.type === "idle") return true;
    } catch {
      // 状态查询失败就等事件
    }
    return new Promise<boolean>((resolve) => {
      if (this.idleWaiters.has(sessionId)) {
        resolve(false);
        return;
      }
      let done = false;
      const finish = (ok: boolean): void => {
        if (!done) {
          done = true;
          resolve(ok);
        }
      };
      this.idleWaiters.set(sessionId, () => finish(true));
      setTimeout(() => {
        if (this.idleWaiters.get(sessionId)) {
          this.idleWaiters.delete(sessionId);
          finish(false);
        }
      }, timeoutMs);
    });
  }

  private async attach(dir: string): Promise<void> {
    process.chdir(dir);
    this._project = dir;
    const headers = authHeaders();

    // 环境标记：让 opencode 插件识别"这是机器人 spawn 的 serve"（安全插件按此放行/拦截）
    process.env.ZXK_BOT_GATEWAY = "1";
    process.env.ZXK_HOOK_PORT = String(config.hookPort);
    process.env.ZXK_HOOK_TOKEN = config.hookToken;

    const existing = createOpencodeClient({
      baseUrl: `http://127.0.0.1:${config.opencodePort}`,
      headers,
    });
    try {
      const sessions = await existing.session.list();
      if (Array.isArray(sessions.data)) {
        this.client = existing;
        this.ownsServer = false;
        console.log(
          `[opencode] 复用已有服务 http://127.0.0.1:${config.opencodePort}（当前目录 ${process.cwd()}）`,
        );
        this.startEventLoop();
        return;
      }
    } catch {
      // 端口未占用，继续自建
    }

    const server = await createOpencodeServer({ port: config.opencodePort });
    this.server = server;
    this.ownsServer = true;
    this.client = createOpencodeClient({ baseUrl: server.url, headers });
    console.log(`[opencode] 已启动服务 ${server.url}，项目 ${dir}`);

    this.startEventLoop();
  }

  /**
   * headless 下无人响应会挂起的两个点，都在这条 SSE 流上处理：
   * - permission.updated → 自动允许，让 build agent 的工具调用能执行
   * - session.idle → 通知等待方 / 网关 busy 安全网
   */
  private async startEventLoop(): Promise<void> {
    try {
      const events = await this.requireClient().event.subscribe();
      (async () => {
        for await (const event of events.stream) {
          const type = event?.type;
          if (type === "permission.updated" && config.autoApprove) {
            const p = event.properties as { id?: string; sessionID?: string; title?: string };
            if (!p?.id || !p?.sessionID) continue;
            try {
              await this.requireClient().postSessionIdPermissionsPermissionId({
                path: { id: p.sessionID, permissionID: p.id },
                body: { response: "always" },
              });
              console.log(`[opencode] 已自动允许权限: ${p.title ?? p.id}`);
            } catch (e) {
              console.error("[opencode] 自动允许权限失败:", e);
            }
          } else if (type === "session.idle") {
            const sid = (event.properties as { sessionID?: string })?.sessionID;
            if (!sid) continue;
            const w = this.idleWaiters.get(sid);
            if (w) {
              this.idleWaiters.delete(sid);
              w();
            }
            this.onSessionIdleCb?.(sid);
          }
        }
      })().catch((e) => console.error("[opencode] 事件流中断:", e));
    } catch (e) {
      console.warn("[opencode] 订阅事件失败:", e);
    }
  }

  close(): void {
    this.server?.close();
  }

  async createSession(title?: string): Promise<string> {
    const res = await this.requireClient().session.create({ body: { title } });
    if (!res.data?.id) throw new Error("创建会话失败");
    return res.data.id;
  }

  async deleteSession(id: string): Promise<void> {
    await this.requireClient().session.delete({ path: { id } });
  }

  async sendText(
    sessionId: string,
    text: string,
    opts: { agent?: string; model?: string } = {},
  ): Promise<string[]> {
    const body: Record<string, unknown> = {
      parts: [{ type: "text", text }],
    };
    if (opts.agent) body.agent = opts.agent;
    if (opts.model) {
      const [providerID, modelID] = splitModel(opts.model);
      body.model = { providerID, modelID };
    }

    const res = await this.requireClient().session.prompt({
      path: { id: sessionId },
      body: body as never,
    });
    if (!res.data) {
      throw new Error(res.error ? JSON.stringify(res.error) : "调用失败");
    }

    const texts: string[] = [];
    for (const part of res.data.parts ?? []) {
      if (part.type === "text") {
        const p = part as { text: string; synthetic?: boolean };
        if (!p.synthetic && p.text) texts.push(p.text);
      }
    }
    return texts;
  }

  async abort(sessionId: string): Promise<void> {
    await this.requireClient().session.abort({ path: { id: sessionId } });
  }

  async listSessions(): Promise<
    Array<{ id: string; title: string; directory: string; created: number; parentID?: string }>
  > {
    const res = await this.requireClient().session.list();
    const sessions = res.data ?? [];
    return sessions.map((s) => ({
      id: s.id,
      title: s.title,
      directory: s.directory,
      created: s.time?.created ?? 0,
      parentID: s.parentID,
    }));
  }

  async getSessionDirectory(sessionId: string): Promise<string | undefined> {
    const res = await this.requireClient().session.get({ path: { id: sessionId } });
    return res.data?.directory;
  }

  async getSessionMessages(
    sessionId: string,
    limit: number,
  ): Promise<Array<{ role: "user" | "assistant"; text: string }>> {
    const res = await this.requireClient().session.messages({ path: { id: sessionId } });
    const list = res.data ?? [];
    const out: Array<{ role: "user" | "assistant"; text: string }> = [];
    for (const m of list) {
      const role = m.info?.role;
      if (role !== "user" && role !== "assistant") continue;
      const text = (m.parts ?? [])
        .filter((p) => p.type === "text")
        .map((p) => (p as { text: string }).text)
        .filter((t) => t)
        .join("\n");
      if (text) out.push({ role, text });
    }
    return out.slice(-limit);
  }

  async listModels(): Promise<OpenCodeModel[]> {
    const res = await this.requireClient().config.providers();
    const providers = res.data?.providers ?? [];
    const out: OpenCodeModel[] = [];
    for (const p of providers) {
      for (const [id, model] of Object.entries(p.models ?? {})) {
        out.push({ id: `${p.id}/${id}`, name: `${p.name} ${model.name}` });
      }
    }
    return out;
  }

  private requireClient(): OpencodeClient {
    if (!this.client) throw new Error("OpenCodeClient 未启动");
    return this.client;
  }
}

function splitModel(id: string): [string, string] {
  const idx = id.indexOf("/");
  if (idx === -1) throw new Error(`模型 ID 格式应为 provider/model，收到: ${id}`);
  return [id.slice(0, idx), id.slice(idx + 1)];
}
