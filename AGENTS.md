# AGENTS.md

面向在此仓库工作的 AI Agent（包括 opencode 自身）的开发指引。

## 项目是什么

微信 ↔ OpenCode 控制网关。个人微信私聊机器人 → Gateway → opencode 会话，可切换项目/会话/模型/agent。

技术栈：Node.js ≥ 22 + TypeScript，ESM（`"type": "module"`），无框架、无 dotenv（用 `process.loadEnvFile`），用 `tsx` 直接跑 TS。

## 常用命令

```bash
npm run typecheck   # tsc --noEmit，改动后必须跑
npm run ping        # 直接测 OpenCodeClient（建会话 + 发消息），验证 SDK 链路
npm run cli         # 终端假 adapter，测 gateway/命令（stdin 输入，stdout 看回复）
npm run dev         # 完整启动：拉起 opencode serve + 微信扫码
```

验证新功能：优先用 `npm run cli` 管道输入命令，例如 `printf '/sessions\n' | npm run cli`。

## 目录职责

- `src/main.ts` — 入口：`OpenCodeClient.start()` → 会话映射校验 → 启动微信 adapter
- `src/config.ts` — 读 `.env`，导出 `config`；**import 时就用 `resolve(".", ...)` 定成绝对路径**
- `src/wechat.ts` — 包装 `@wechatbot/wechatbot`：扫码登录回调、`sendTyping`、`send`、构造 Gateway
- `src/gateway.ts` — `Gateway.handle()`：白名单/配对 → 去重 → 命令分发 → 会话消息；每用户串行锁
- `src/opencode.ts` — `OpenCodeClient`：`createSession/deleteSession/sendText/abort/listSessions/getSessionMessages/listModels/setProject/getSessionDirectory` + 权限自动批准
- `src/conversation.ts` — `ConversationStore`：userId ↔ opencode session 映射，JSON 持久化（`data/conversations.json`）
- `src/auth.ts` — `Auth`：`ALLOW_FROM` 白名单；为空时首次配对（`data/paired.json`）
- `src/commands.ts` — 命令注册表（`commands: Map`），新命令加进数组即可，`/help` 自动列出
- `src/hook.ts` — 本地 HTTP hook：插件 `wechat_notify` 工具 POST 回网关，按 `sessionID → userId` 反查转发微信（Bearer token 校验）
- `src/format.ts` — Markdown 空行折叠

全局插件（`~/.config/opencode/plugins/`，不进本仓库）：
- `block-secrets.ts` — 仅当 `process.env.ZXK_BOT_GATEWAY === "1"` 时拦截敏感文件访问（`.env`/`data/wechat`/`paired.json`/`conversations.json`）
- `wechat-notify.ts` — 注册 `wechat_notify` 工具，POST `127.0.0.1:${ZXK_HOOK_PORT}/notify` 把消息送回网关

数据目录 `data/` 与 `.env` 已在 `.gitignore`，不要提交。

## 关键约束（血泪坑，改动时务必遵守）

1. **路径与 chdir**：`OpenCodeClient.start()/setProject()` 会 `process.chdir()` 到 opencode 工作目录。任何需要指向本项目仓库的路径，必须在 `config.ts` import 时用 `resolve(".", ...)` 固化（`dataDir`、`wechatStorageDir` 已如此）。

2. **禁止对跨项目 session 调 prompt**：`session.prompt()` 在会话 `directory` ≠ 当前 server cwd 时会**永久挂起**（`session.get/messages` 正常，唯独 prompt 卡死）。跨项目必须：
   - 先 `opencode.setProject(dir)` 重启 server（会报错如果端口被外部服务占用），或
   - 启动时校验：`getSessionDirectory(id)` 与记录不符就丢弃映射（见 `main.ts`）
   - `sessionCmd` 切换跨项目会话时必须自动 `setProject`（已实现）

3. **opencode serve 鉴权**：环境里有 `OPENCODE_SERVER_PASSWORD` 时 serve 要求 basic auth。`authHeaders()` 已自动构造，新加 API 调用务必通过 `this.requireClient()` 的客户端，不要裸 `fetch`。

4. **权限自动批准**：方法在**顶层 client**：`client.postSessionIdPermissionsPermissionId(...)`，不在 `session` 命名空间。订阅 `client.event.subscribe()` 的 `permission.updated` 事件自动响应 `always`。headless 下若权限请求无人响应，模型会挂起。

5. **每用户串行**：`Gateway.handle()` 用 per-user promise 链（`locks` Map）串行化，避免并发创建会话互相覆盖。新逻辑别绕过它。

6. **会话映射字段**：`ConversationRecord.project` 必须是**会话真实目录**（来自 `session.get().directory`），不要写成 `opencode.project`。项目变了 gateway 会重建会话。

7. **SDK 返回结构**：所有 SDK 调用返回 `{ data, error, request, response }`（fields 风格），判 `res.data` 是否为空，`res.error` 要抛。消息文本从 `data.parts` 里 `type === "text"` 抽取，跳过 `synthetic`。

8. **环境标记**：`OpenCodeClient.attach()` 在 spawn 前写入 `ZXK_BOT_GATEWAY=1`、`ZXK_HOOK_PORT`、`ZXK_HOOK_TOKEN`，serve 继承后插件据此识别机器人会话。`session.idle` 事件已用于 busy 安全网（`gateway.ts`）和 `/abort` 等待（`opencode.waitSessionIdle`）。

## 代码风格

- 无注释（除非必要），与现有代码保持一致
- ESM：相对导入必须带 `.js` 后缀（`import ... from "./config.js"`）
- 改动后跑 `npm run typecheck`，并用 `npm run cli` 做冒烟验证
