# zxk-chat-bot (ZXKChatBot)

**Control OpenCode from WeChat — a personal WeChat chatbot gateway (CLI).**
微信远程控制 opencode 的 AI 机器人网关：私聊机器人即可切换项目/会话/模型/agent。

[![npm](https://img.shields.io/npm/v/zxk-chat-bot)](https://www.npmjs.com/package/zxk-chat-bot)
[![License](https://img.shields.io/npm/l/zxk-chat-bot)](https://github.com/zxkfall/zxk-chat-bot/blob/main/LICENSE)

- **WeChat via iLink API** — scan QR to login, no local client needed
- **Drive OpenCode from WeChat** — switch projects / sessions / models / agents by chatting
- **CLI** — `zxk-chat setup / start / status / logs / plugins / uninstall`
- 个人微信扫码即登录；远程让 opencode 干活、看结果、切换项目与会话

---

## Install & Usage / 安装与使用

**Prerequisites / 前置**：Node.js ≥ 22，已安装 [opencode](https://opencode.ai)
（`curl -fsSL https://opencode.ai/install.sh | bash`），手机微信。

**Global install（推荐）/ 全局安装**：

```bash
npm install -g zxk-chat-bot
zxk-chat setup            # 交互向导：工作目录/项目/白名单 + 手机扫码登录 → 写配置
zxk-chat plugins:install  # 安装 opencode 插件（安全拦截 + wechat_notify 工具）
zxk-chat start            # 启动机器人
zxk-chat status / logs    # 查看状态 / 实时日志
```

**Without install（临时用）**：`npx zxk-chat setup`、`npx zxk-chat start`。

启动后用手机微信扫码登录，然后**私聊机器人**发任意一条消息即可配对（第一个发消息的用户会被允许）。

## Uninstall / 卸载（两层）

```bash
zxk-chat uninstall          # 清理 opencode 插件 + y/N 确认删配置/数据目录（凭据/会话映射/日志）
npm uninstall -g zxk-chat-bot  # 删除 npm 包本体（自动触发 uninstall 脚本，顺带清插件残留）
```

> npm 的 `uninstall` 生命周期脚本只删复制出去的插件文件，**不碰配置/登录凭据**——因为 npm 升级版本时也会触发它，删数据会导致每次升级清空配置。

## 获取微信用户 ID

`ALLOW_FROM` 填的是 iLink 分配的**不透明用户 ID**，形如 `wx1a2b3c…@im.wechat`——不是微信号、手机号或昵称。

1. 启动机器人并扫码登录
2. 用你的微信给机器人私聊发任意一条消息（首次自动配对）
3. 打开 `~/.config/zxk-chat-bot/data/paired.json`，里面就是你的完整用户 ID
4. 把它写入配置的 `ALLOW_FROM`（多个用逗号分隔），重启生效

## 微信内命令

| 命令 | 说明 |
|------|------|
| `/help` | 显示帮助 |
| `/new` | 新建会话（丢弃旧上下文） |
| `/clear` | 清空当前会话（等同 `/new`） |
| `/projects` | 列出可用项目 |
| `/project <编号>` | 切换项目（列出该项目会话，可挑选续聊或发消息新建） |
| `/sessions [all]` | 列出会话（默认当前项目，`all` 显示全部项目） |
| `/session <编号>` | 切换到当前项目的指定会话继续对话 |
| `/history [n]` | 查看当前会话最近 n 条消息（默认 10） |
| `/model [provider/model]` | 查看或切换模型 |
| `/agent build\|plan` | 切换 agent |
| `/abort` | 中断当前正在处理的请求 |

普通消息直接发给当前 opencode 会话处理。回复方式：处理中发送 typing 提示，完成后一次性发送（Markdown 直通，超 4000 字自动分片）。

## 配置

CLI 版配置/数据默认在 **`~/.config/zxk-chat-bot/`**（可用 `ZXK_CONFIG_DIR` 覆盖）。`setup` 向导会自动写入；也可手动编辑 `<配置目录>/.env`：

| 变量 | 说明 |
|------|------|
| `ALLOW_FROM` | 允许使用的微信用户 ID，逗号分隔（形如 `wx1a2b3c…@im.wechat`，获取方法见上）。为空时启用首次配对模式。**默认拒绝一切** |
| `OPENCODE_CWD` | opencode 工作目录（机器人所有文件/命令操作都在此目录） |
| `PROJECTS` | 可用项目列表，逗号分隔绝对路径。微信里 `/projects` 查看、`/project` 切换 |
| `AUTO_APPROVE_PERMISSIONS` | 自动允许 opencode 工具权限请求（bash/edit 等），默认 `true`。关掉后 headless 下工具调用会挂起 |
| `OPENCODE_PORT` | opencode server 端口，默认 `4096` |
| `DEFAULT_AGENT` | 默认 agent：`build` \| `plan`，默认 `build` |
| `BOT_NAME` | 机器人显示名，默认 `ZXK Bot` |
| `WECHAT_STORAGE_DIR` | 微信登录凭据存储目录，默认 `<配置目录>/data/wechat` |
| `HOOK_PORT` | 本地通知 hook 端口（wechat_notify 工具用），默认 `19890` |
| `HOOK_TOKEN` | hook 鉴权 token，不填则每次启动随机生成 |
| `LOG_LEVEL` | 日志级别：`debug` \| `info` \| `warn` \| `error`，默认 `info` |
| `LOG_DIR` | 日志目录，默认 `<配置目录>/data/logs`，按天轮转 `bot-YYYYMMDD.log` |

## 插件

内置 opencode 插件（`plugins/` 目录），用 `zxk-chat plugins:install` 安装（默认全局 `~/.config/opencode/plugins/`，`--project <dir>` 指定项目级）：

- `block-secrets.ts`（安全）：仅对机器人会话生效（`ZXK_BOT_GATEWAY=1`），拦截工具访问 `.env`、`data/wechat`、`paired.json`、`conversations.json`
- `wechat-notify.ts`：注册 `wechat_notify` 工具，模型可在会话里主动给微信发消息（进度/通知），经网关本地 hook 转发

改完插件/装完新插件后，重启 opencode（或 serve）生效。本地脚本等价物：`npm run plugins:install` / `plugins:uninstall`（支持 `--global` / `--project`）。

## 日志

运行日志同时输出到终端并写入 `<配置目录>/data/logs/bot-YYYYMMDD.log`（按天轮转，含微信 SDK 协议日志；不打印 token/凭据，微信 userId 截断）。

```bash
zxk-chat logs     # 实时 tail 当天日志
```

## 架构

```
手机微信 ──扫码登录──▶ iLink Bot API
                          ▲
        @wechatbot/wechatbot   ←── wechat.ts (Adapter)
                          ▲
                     ChatMessage
                          ▲
  gateway.ts (白名单/配对/去重/串行锁/命令分发)
        ├── conversation.ts   userId ↔ opencode sessionId，JSON 持久化
        ├── auth.ts           白名单 + 首次配对
        ├── commands.ts       命令注册表
        └── opencode.ts       @opencode-ai/sdk（自动拉起 opencode serve）
```

## 目录结构

```
src/
├── main.ts         入口：拉起 serve + 会话映射校验 + 启动微信
├── config.ts       .env 加载（import 时解析为绝对路径）
├── wechat.ts       iLink adapter：扫码登录、typing、回复、启动 notify hook
├── gateway.ts      每用户串行锁、白名单/配对、去重、命令分发、busy 安全网
├── conversation.ts 会话映射持久化（conversations.json）
├── auth.ts         白名单 + 首次配对（paired.json）
├── hook.ts         本地 HTTP hook：wechat_notify 工具回调转发微信
├── commands.ts     微信内 /命令
├── opencode.ts     OpenCodeClient：session/project/prompt/abort/models + 权限自动批准
├── plugins.ts      插件安装/卸载逻辑
├── cli.ts          npm CLI 入口（zxk-chat）：setup/start/status/logs/plugins/uninstall/ping
└── format.ts       Markdown 整理（空行折叠）
plugins/
├── block-secrets.ts   安全插件（仅机器人会话生效）
└── wechat-notify.ts   wechat_notify 工具
scripts/
├── ping.ts             OpenCode SDK 连通性测试（npm run ping）
├── cli.ts              CLI 假 adapter，终端里测命令（npm run cli）
├── install-plugins.ts  插件安装/卸载（npm run plugins:install / uninstall）
└── npm-uninstall.mjs   npm uninstall 生命周期：清 opencode 插件（不动配置/凭据）
```

## 本地开发

```bash
npm install
npm run plugins:install -- --global   # 或项目级 npm run plugins:install
cp .env.example .env                  # 填 OPENCODE_CWD、PROJECTS
npm run dev                           # 启动：拉起 opencode serve + 微信登录二维码
```

开发命令：

```bash
npm run build             # tsc 编译到 dist/（发布/CLI 用）
npm run typecheck         # tsc --noEmit
npm run ping              # 直接测 OpenCodeClient（建会话 + 发消息）
npm run cli               # 终端里用假微信用户测全部命令（用真实 data/）
npm run cli:test          # 同上，但数据隔离到 .test-data/（测试专用，不碰真实 data/）
npm run logs              # 实时查看运行日志
```

## 发布（维护者）

包发布走 **npm Trusted Publishing**（GitHub Actions 用 OIDC 认证，无需在 GitHub 存 token）。仓库已配好 `.github/workflows/publish.yml`：推送 `v*` tag 时自动 `npm publish --provenance`。

**① 首次发布**（创建 npm 包，需要一次本地登录）：

```bash
npm whoami            # 确认已登录（未登录先 npm login）
npm publish           # 发布当前版本（自动跑 build + typecheck）
```

**② 一次性配置 Trusted Publishing**（npm 网页操作）：

npmjs.com → 包 `zxk-chat-bot` → **Settings → Trusted Publishing** → Add source：
- Provider: `GitHub Actions`
- Owner / Repository: 你的 GitHub 用户名和仓库名（如 `<用户名>/zxk-chat-bot`）
- Workflow: `publish.yml`

**③ 日常发版**（从此全自动，不用手动 npm publish）：

```bash
npm version patch        # 升版本 + 自动提交 + 打 v0.x.x tag
git push --follow-tags   # 推代码和 tag → GitHub Actions 自动发布到 npm
```

> **遇到问题？** CI 发布 404 等排查见 [`TROUBLESHOOTING.md`](TROUBLESHOOTING.md)。常见坑：Trusted Publishing 要求 npm ≥ 11.5.1（workflow 已内置 publish 前 `npm install -g npm@latest`）。

## 安全提示

- 机器人能通过 opencode 执行 bash/edit，等于**微信可达的远程控制通道**：务必配置 `ALLOW_FROM`，不要对陌生人开放
- `AUTO_APPROVE_PERMISSIONS=true` 会无条件允许工具调用，仅建议自用
- 个人微信自动化有封号风险（iLink 虽为腾讯托管 API），建议用小号测试、控制频率
- iLink bot 是独立身份（`xxx@im.bot`），基本收不到普通群消息，只适合私聊

## 链接 / Links

- GitHub: https://github.com/zxkfall/zxk-chat-bot
- npm: https://www.npmjs.com/package/zxk-chat-bot
- 排查记录: [`TROUBLESHOOTING.md`](TROUBLESHOOTING.md)
