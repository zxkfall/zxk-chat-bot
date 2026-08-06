#!/usr/bin/env node
// npm 卸载生命周期脚本：只清理复制到 opencode 全局插件目录的插件文件。
// ⚠ 不要在这里删配置/登录凭据 —— npm 在「升级版本」时也会触发本脚本，删数据会导致每次升级清空用户配置。
import { existsSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const dir = join(homedir(), ".config", "opencode", "plugins");
const files = ["block-secrets.ts", "wechat-notify.ts"];

for (const f of files) {
  const p = join(dir, f);
  if (existsSync(p)) {
    rmSync(p);
    console.log(`[zxk-chat-bot] 已移除插件: ${p}`);
  }
}
