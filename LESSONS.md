# LESSONS.md

流水账式教训日志：记录本项目踩过的坑和重大改进。追加入口保持简洁（日期 + 一句话总结 + 现象/根因 + 修复/做法）。与 `AGENTS.md` 的"关键约束"互补——那里是活约束，这里是历史日志。

---

## 2026-08-05 跨项目 session 调 prompt 永久挂起

**一句话**：对 `directory` ≠ 当前 server cwd 的 opencode session 调 `session.prompt()` 会永久挂起。

**现象**：`/session` 切到别的项目建的会话后，下一条消息一直不返回（90s+ 无响应）。

**根因**：`sessionCmd` 把 `project` 字段错写成当前项目，gateway 误判"项目没变"就复用了跨项目会话；`session.get/messages` 都正常，唯独 `prompt` 卡死。

**修复**：`/session` 切换跨项目会话时自动 `setProject(dir)` 重启 server；`listSessions()` 带 `directory`；启动时用 `getSessionDirectory(id)` 校验映射，不符即丢弃重建。

## 2026-08-05 相对路径 + chdir 导致文件存错目录

**一句话**：`OpenCodeClient.start()` 会 `process.chdir()` 到工作目录，相对路径随之错位。

**现象**：`WECHAT_STORAGE_DIR=./data/wechat` 早期被 `mkdirSync` 建到了 test_bot 而非仓库下。

**根因**：config 里存的是裸相对字符串，chdir 之后解析到新 cwd。

**修复**：`config.ts` 在 import 时用 `resolve(".", ...)` 固化成绝对路径（`dataDir`、`wechatStorageDir`）。

## 2026-08-05 session.status() 端点返回空，状态改用事件流跟踪

**一句话**：`client.session.status()` 对任意会话都返回 `{}`，不可用。

**现象**：`/current` 命令的状态字段永远是 unknown。

**根因**：SDK 的 status 端点不返回存量会话状态。

**修复**：在 `startEventLoop` 里订阅 `session.status` / `session.idle` 事件维护 `sessionStatuses` map，server 重启时清空。

## 2026-08-05 权限自动批准方法不在 session 命名空间

**一句话**：`postSessionIdPermissionsPermissionId` 在**顶层 client** 上，不在 `client.session` 上。

**现象**：TypeScript 报 `Property does not exist on type 'Session'`。

**根因**：SDK 生成的类结构里该方法属于 `OpencodeClient` 而非 `Session`。

**修复**：`this.requireClient().postSessionIdPermissionsPermissionId(...)`，并写进 AGENTS.md 约束 #4。

## 2026-08-05 @wechatbot/wechatbot 的 loginCallbacks 构造参数不生效

**一句话**：`WeChatBotOptions.loginCallbacks` 在运行时代码里根本没被消费。

**现象**：启动只打印 SDK 默认的 "Scan this QR code..."，自定义二维码渲染回调不触发。

**根因**：SDK 的 `login()`/`run()` 只读取调用时传入的 `{ callbacks }`。

**修复**：把回调传给 `bot.run({ callbacks })`。

## 2026-08-05 iLink bot 身份的能力边界

**一句话**：iLink 扫码连的是独立 bot 身份（`xxx@im.bot`），不是普通个人号。

**现象**：群消息（含 @）基本收不到，群策略配置了也常无效。

**根因**：iLink 协议对 bot 身份的群事件投递限制在腾讯侧。

**修复**：只按私聊设计；`dm_policy`/allowlist 管控，不依赖群消息。
