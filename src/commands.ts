import { basename } from "node:path";
import { config } from "./config.js";
import type { ConversationStore } from "./conversation.js";
import type { OpenCodeClient } from "./opencode.js";

export interface CommandContext {
  userId: string;
  args: string[];
  conversations: ConversationStore;
  opencode: OpenCodeClient;
}

export interface Command {
  name: string;
  usage: string;
  description: string;
  run(ctx: CommandContext): Promise<string>;
}

async function freshSession(userId: string, ctx: CommandContext): Promise<string> {
  const old = ctx.conversations.get(userId);
  if (old) {
    await ctx.opencode.deleteSession(old.opencodeSessionId).catch(() => {});
  }
  const id = await ctx.opencode.createSession(`微信: ${userId}`);
  ctx.conversations.set(userId, {
    wechatUserId: userId,
    opencodeSessionId: id,
    project: ctx.opencode.project,
    model: old?.model,
    agent: old?.agent ?? config.defaultAgent,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  return `已新建会话 ${id}`;
}

const projectsCmd: Command = {
  name: "projects",
  usage: "/projects",
  description: "列出可用项目",
  async run({ opencode }) {
    const current = opencode.project;
    return (
      "可用项目：\n" +
      config.projects
        .map((p, i) => `  ${i + 1}. ${basename(p)}  ${p === current ? "[当前]" : ""}`)
        .join("\n")
    );
  },
};

const projectCmd: Command = {
  name: "project",
  usage: "/project <编号>",
  description: "切换到指定项目（不自动建会话，可挑已有会话）",
  async run({ userId, args, conversations, opencode }) {
    const target = args[0];
    if (!target) return "用法: /project <编号>，用 /projects 查看列表";
    const idx = Number.parseInt(target, 10);
    const dir = Number.isFinite(idx) && idx >= 1 && idx <= config.projects.length
      ? config.projects[idx - 1]
      : config.projects.find((p) => p === target || basename(p) === target);
    if (!dir) return `未找到项目: ${target}`;
    if (dir === opencode.project) return "已经在当前项目";

    await opencode.setProject(dir);

    const old = conversations.get(userId);
    conversations.set(userId, {
      wechatUserId: userId,
      opencodeSessionId: "",
      project: dir,
      model: old?.model,
      agent: old?.agent ?? config.defaultAgent,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const top = await topSessions(opencode, dir);
    if (!top.length) {
      return `已切换到项目 ${basename(dir)}（暂无会话）。发消息即可创建新会话。`;
    }
    return (
      `已切换到项目 ${basename(dir)}。该项目会话：\n` +
      formatSessions(top) +
      `\n发消息自动创建新会话，或 /session <编号> 选择。`
    );
  },
};

const newCmd: Command = {
  name: "new",
  usage: "/new",
  description: "新建一个会话（丢弃旧上下文）",
  run: (ctx) => freshSession(ctx.userId, ctx),
};

const clearCmd: Command = {
  name: "clear",
  usage: "/clear",
  description: "清空当前会话（等同 /new）",
  run: (ctx) => freshSession(ctx.userId, ctx),
};

const modelCmd: Command = {
  name: "model",
  usage: "/model [provider/model]",
  description: "查看或切换模型",
  async run({ userId, args, conversations, opencode }) {
    const models = await opencode.listModels();
    if (args.length === 0) {
      return models.length
        ? "可用模型：\n" + models.map((m) => `  ${m.id}`).join("\n")
        : "（无可用模型）";
    }
    const target = args[0];
    if (!models.some((m) => m.id === target)) {
      return `模型不存在: ${target}\n用 /model 查看可用列表`;
    }
    const rec = conversations.get(userId);
    if (!rec) return "还没有会话，先随便发条消息";
    rec.model = target;
    rec.updatedAt = Date.now();
    conversations.set(userId, rec);
    return `已切换模型 → ${target}`;
  },
};

const agentCmd: Command = {
  name: "agent",
  usage: "/agent build|plan",
  description: "切换 agent",
  async run({ userId, args, conversations }) {
    const target = args[0]?.toLowerCase();
    if (target !== "build" && target !== "plan") return "用法: /agent build|plan";
    const rec = conversations.get(userId);
    if (!rec) return "还没有会话，先随便发条消息";
    rec.agent = target;
    rec.updatedAt = Date.now();
    conversations.set(userId, rec);
    return `已切换 agent → ${target}`;
  },
};

const abortCmd: Command = {
  name: "abort",
  usage: "/abort",
  description: "中断当前正在处理的请求",
  async run({ userId, conversations, opencode }) {
    const rec = conversations.get(userId);
    if (!rec || !rec.opencodeSessionId) return "当前没有会话";
    await opencode.abort(rec.opencodeSessionId);
    const idle = await opencode.waitSessionIdle(rec.opencodeSessionId, 10000);
    return idle ? "已中断（会话已停止）" : "已发送中断请求（等待超时，会话可能仍忙碌）";
  },
};

function fmtTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function topSessions(opencode: OpenCodeClient, directory?: string) {
  const sessions = await opencode.listSessions();
  const list = directory ? sessions.filter((s) => s.directory === directory) : sessions;
  return list
    .filter((s) => !s.parentID)
    .sort((a, b) => b.created - a.created)
    .slice(0, 10);
}

function formatSessions(
  list: Array<{ id: string; title: string; directory: string; created: number }>,
  showProject = false,
): string {
  if (!list.length) return "（无会话）";
  return list
    .map(
      (s, i) =>
        `  ${i + 1}. ${s.title || s.id}${showProject ? `  [${basename(s.directory)}]` : ""}  (${fmtTime(s.created)})`,
    )
    .join("\n");
}

const sessionsCmd: Command = {
  name: "sessions",
  usage: "/sessions [all]",
  description: "列出会话（默认当前项目，all 显示全部项目）",
  async run({ args, opencode }) {
    const showAll = args[0]?.toLowerCase() === "all";
    const top = await topSessions(opencode, showAll ? undefined : opencode.project);
    if (!top.length) return showAll ? "还没有任何会话" : "当前项目还没有会话";
    const header = showAll
      ? "全部会话（用 /session <编号> 切换）："
      : "当前项目会话（用 /session <编号> 切换）：";
    return header + "\n" + formatSessions(top, showAll);
  },
};

const sessionCmd: Command = {
  name: "session",
  usage: "/session <编号>",
  description: "切换到指定会话继续对话（跨项目会自动切项目）",
  async run({ userId, args, conversations, opencode }) {
    const target = args[0];
    if (!target) return "用法: /session <编号>，用 /sessions 查看列表";
    const top = await topSessions(opencode);
    const idx = Number.parseInt(target, 10);
    const found = Number.isFinite(idx) && idx >= 1 && idx <= top.length
      ? top[idx - 1]
      : top.find((s) => s.id === target || s.id.startsWith(target));
    if (!found) return `未找到会话: ${target}`;

    const dir = found.directory || opencode.project;
    if (dir !== opencode.project) {
      try {
        await opencode.setProject(dir);
      } catch (e) {
        return `无法切换到会话 ${found.title || found.id} 所在项目: ${(e as Error).message}`;
      }
    }

    const old = conversations.get(userId);
    conversations.set(userId, {
      wechatUserId: userId,
      opencodeSessionId: found.id,
      project: dir,
      model: old?.model,
      agent: old?.agent ?? config.defaultAgent,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    return `已切换到会话 ${found.title || found.id}（项目 ${basename(dir)}）`;
  },
};

const historyCmd: Command = {
  name: "history",
  usage: "/history [n]",
  description: "查看当前会话最近 n 条消息（默认 10）",
  async run({ userId, args, conversations, opencode }) {
    const rec = conversations.get(userId);
    if (!rec || !rec.opencodeSessionId) return "当前没有会话";
    const n = args.length ? Number.parseInt(args[0], 10) : 10;
    const limit = Number.isFinite(n) && n > 0 ? Math.min(n, 50) : 10;
    const msgs = await opencode.getSessionMessages(rec.opencodeSessionId, limit);
    if (!msgs.length) return "这个会话还没有消息";
    const MAX = 500;
    return msgs
      .map((m) => {
        const text = m.text.length > MAX ? m.text.slice(0, MAX) + "\n…(截断)" : m.text;
        return `${m.role === "user" ? "你" : "助手"}: ${text}`;
      })
      .join("\n\n");
  },
};

const currentCmd: Command = {
  name: "current",
  usage: "/current",
  description: "显示当前项目/会话/模型/agent 状态",
  async run({ userId, conversations, opencode }) {
    const rec = conversations.get(userId);
    if (!rec) return "还没有会话，先发条消息";

    const project = opencode.project;
    let sessionLine = "  会话: 未创建";
    let model = rec.model ?? "-";
    if (rec.opencodeSessionId) {
      const session = await opencode.getSession(rec.opencodeSessionId).catch(() => undefined);
      const status = session ? await opencode.getSessionStatus(session.id) : "unknown";
      const lastModel = await opencode.getLastUsedModel(rec.opencodeSessionId).catch(() => undefined);
      model = rec.model ?? lastModel ?? "-";
      const title = session?.title && session.title !== session.id ? session.title : undefined;
      sessionLine = `  会话: ${rec.opencodeSessionId}${title ? `（${title}）` : ""}  状态: ${status}`;
    }

    const lines = [
      "当前状态：",
      `  项目: ${basename(project)}  (${project})`,
      sessionLine,
      `  模型: ${model}`,
      `  agent: ${rec.agent}`,
    ];
    return lines.join("\n");
  },
};

const helpCmd: Command = {
  name: "help",
  usage: "/help",
  description: "显示帮助",
  async run() {
    return [
      `可用命令：`,
      ...[...commands.values()].map((c) => `  ${c.usage}  -  ${c.description}`),
      `\n其他消息会直接发给 opencode 会话处理。`,
    ].join("\n");
  },
};

export const commands = new Map<string, Command>(
  [
    newCmd,
    clearCmd,
    projectsCmd,
    projectCmd,
    sessionsCmd,
    sessionCmd,
    historyCmd,
    currentCmd,
    modelCmd,
    agentCmd,
    abortCmd,
    helpCmd,
  ].map((c) => [c.name, c]),
);
