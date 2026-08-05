# ZXKChatBot

微信 ↔ OpenCode 控制网关：用个人微信私聊机器人，远程控制 opencode 处理任务、切换项目/会话。

- **微信接入**：iLink Bot API（腾讯托管，`ilinkai.weixin.qq.com`），手机微信扫码即登录，无需本地客户端
- **控制后端**：`opencode serve`（由网关自动拉起），官方 `@opencode-ai/sdk` 驱动
- **架构**：平台只是 Adapter，OpenCode 只是 Provider，核心是 Conversation 映射

## 快速开始

前置：Node.js ≥ 22、已安装 [opencode](https://opencode.ai)。

```bash
npm install
npm run plugins:install -- --global   # 安装全局插件（机器人所有项目生效，推荐）
# 或项目级：npm run plugins:install    # 装到当前目录 .opencode/plugins/
cp .env.example .env                  # 填 OPENCODE_CWD、PROJECTS
npm run dev                           # 启动：拉起 opencode serve + 微信登录二维码
```

启动后用手机微信扫码登录，然后**私聊机器人**发任意消息即可配对（第一个发消息的用户会被允许，ID 会打印在日志里）。建议把该 ID 写入 `.env` 的 `ALLOW_FROM` 固化。

## 插件安装

插件源码在仓库 `plugins/`，用脚本安装到 opencode（安装目标二选一/多选）：

| 命令 | 目标 |
|---|---|
| `npm run plugins:install` | 项目级：当前目录 `.opencode/plugins/` |
| `npm run plugins:install -- --global` | 全局：`~/.config/opencode/plugins/`（所有项目/实例生效） |
| `npm run plugins:install -- --project <dir>` | 指定项目：`<dir>/.opencode/plugins/` |
| `npm run plugins:uninstall` | 移除（同样支持 `--global` / `--project`，只删本仓库的两个插件，其他插件不动） |

内置插件：
- `block-secrets.ts`（安全）：仅对机器人会话生效（`ZXK_BOT_GATEWAY=1`），拦截工具访问 `.env`、`data/wechat`、`paired.json`、`conversations.json`
- `wechat-notify.ts`：注册 `wechat_notify` 工具，模型可在会话里主动给微信发消息（进度/通知），经网关本地 hook 转发

改完插件/装完新插件后，重启 opencode（或 serve）生效。

## 命令

| 命令 | 说明 |
|------|------|
| `/help` | 显示帮助 |
| `/new` | 新建会话（丢弃旧上下文） |
| `/clear` | 清空当前会话（等同 `/new`） |
| `/projects` | 列出可用项目 |
| `/project <编号>` | 切换项目（重启 opencode server） |
| `/sessions` | 列出当前所有会话（带项目标签） |
| `/session <编号>` | 切换到指定会话继续对话（跨项目自动切项目） |
| `/history [n]` | 查看当前会话最近 n 条消息（默认 10） |
| `/model [provider/model]` | 查看或切换模型 |
| `/agent build\|plan` | 切换 agent |
| `/abort` | 中断当前正在处理的请求 |

普通消息直接发给当前 opencode 会话处理。回复方式：处理中发送 typing 提示，完成后一次性发送（Markdown 直通，超 4000 字自动分片）。

## 配置（.env）

| 变量 | 说明 |
|------|------|
| `ALLOW_FROM` | 允许使用的微信用户 ID，逗号分隔。为空时启用首次配对模式。**默认拒绝一切** |
| `OPENCODE_CWD` | opencode 工作目录（机器人所有文件/命令操作都在此目录） |
| `PROJECTS` | 可用项目列表，逗号分隔绝对路径。微信里 `/projects` 查看、`/project` 切换 |
| `AUTO_APPROVE_PERMISSIONS` | 自动允许 opencode 工具权限请求（bash/edit 等），默认 `true`。关掉后 headless 下工具调用会挂起 |
| `OPENCODE_PORT` | opencode server 端口，默认 `4096` |
| `DEFAULT_AGENT` | 默认 agent：`build` \| `plan`，默认 `build` |
| `BOT_NAME` | 机器人显示名，默认 `ZXK Bot` |
| `WECHAT_STORAGE_DIR` | 微信登录凭据存储目录，默认 `./data/wechat` |
| `HOOK_PORT` | 本地通知 hook 端口（wechat_notify 工具用），默认 `19890` |
| `HOOK_TOKEN` | hook 鉴权 token，不填则每次启动随机生成 |

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
├── conversation.ts 会话映射持久化（data/conversations.json）
├── auth.ts         白名单 + 首次配对（data/paired.json）
├── hook.ts         本地 HTTP hook：wechat_notify 工具回调转发微信
├── commands.ts     /new /clear /projects /project /sessions /session /history /model /agent /abort /help
├── opencode.ts     OpenCodeClient：session/project/prompt/abort/models + 权限自动批准 + session.idle 事件
└── format.ts       Markdown 整理（空行折叠）
plugins/
├── block-secrets.ts   安全插件（仅机器人会话生效）
└── wechat-notify.ts   wechat_notify 工具
scripts/
├── ping.ts         OpenCode SDK 连通性测试（npm run ping）
├── cli.ts          CLI 假 adapter，终端里测命令（npm run cli）
└── install-plugins.ts  插件安装/卸载（npm run plugins:install / uninstall）
```

## 开发

```bash
npm run typecheck         # tsc --noEmit
npm run ping              # 直接测 OpenCodeClient（建会话 + 发消息）
npm run cli               # 终端里用假微信用户测全部命令
npm run plugins:install   # 安装插件（--global / --project <dir> 变体）
npm run dev               # 完整启动（真实微信）
```

## 安全提示

- 机器人能通过 opencode 执行 bash/edit，等于**微信可达的远程控制通道**：务必配置 `ALLOW_FROM`，不要对陌生人开放
- `AUTO_APPROVE_PERMISSIONS=true` 会无条件允许工具调用，仅建议自用
- 个人微信自动化有封号风险（iLink 虽为腾讯托管 API），建议用小号测试、控制频率
- iLink bot 是独立身份（`xxx@im.bot`），基本收不到普通群消息，只适合私聊
