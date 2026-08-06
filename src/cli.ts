#!/usr/bin/env node
import "./cli-env.js";
import { confirm, input, select } from "@inquirer/prompts";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createLogger, WeChatBot } from "@wechatbot/wechatbot";
import qrcode from "qrcode-terminal";
import { config } from "./config.js";
import { fileTransport, log } from "./log.js";
import { installPlugins, uninstallPlugins } from "./plugins.js";

const PKG_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PKG_VERSION = JSON.parse(readFileSync(join(PKG_ROOT, "package.json"), "utf8")).version;

const HELP = `zxk-chat v${PKG_VERSION} — 微信 ↔ OpenCode 控制网关

用法:
  zxk-chat setup              交互配置向导（工作目录/项目/白名单 + 微信扫码）
  zxk-chat start              前台启动机器人
  zxk-chat status             查看配置/数据/插件状态
  zxk-chat logs               实时查看日志
  zxk-chat plugins:install    安装 opencode 插件（--global / --project <dir>）
  zxk-chat plugins:uninstall  移除插件
  zxk-chat uninstall          清理插件与配置/数据（y/N 确认）
  zxk-chat ping               opencode 连通测试
  zxk-chat --version / -v
  zxk-chat --help / -h
`;

function opencodeFound(): boolean {
  return spawnSync("which", ["opencode"], { stdio: "ignore" }).status === 0;
}

function writeEnv(dir: string, values: Record<string, string>): void {
  mkdirSync(dir, { recursive: true });
  const body = Object.entries(values)
    .map(([k, v]) => (v === "" ? `${k}=` : `${k}=${v}`))
    .join("\n");
  writeFileSync(join(dir, ".env"), body + "\n");
}

async function loginWechat(storageDir: string): Promise<void> {
  mkdirSync(storageDir, { recursive: true });
  const bot = new WeChatBot({
    storage: "file",
    storageDir,
    logger: createLogger({ level: "info", transport: fileTransport }),
    botAgent: "ZXKChatBot/setup",
  });
  await bot.login({
    callbacks: {
      onQrUrl: (url: string) => {
        console.log(`\n请用微信扫码登录：\n${url}\n`);
        try {
          qrcode.generate(url, { small: true }, (s: string) => console.log(s));
        } catch {
          // 终端不支持二维码时仅打印链接
        }
      },
      onScanned: () => console.log("已扫码，请在手机上确认..."),
      onExpired: () => console.log("二维码已过期，正在刷新..."),
    },
  });
  console.log("微信登录成功。");
  bot.stop();
}

async function setupCmd(): Promise<void> {
  console.log(`\nzxk-chat-bot 配置向导（写入 ${join(config.configDir, ".env")}）\n`);
  if (!opencodeFound()) {
    console.warn("⚠ 未检测到 opencode，请先安装：curl -fsSL https://opencode.ai/install.sh | bash\n");
  }

  const workdir = await input({
    message: "opencode 工作目录（机器人所有文件/命令操作都在此目录）",
    default: config.opencodeCwd || join(homedir(), "Documents", "OpenCode"),
    validate: (v: string) => (existsSync(v) ? true : "目录不存在"),
  });

  const projectsInput = await input({
    message: "可用项目（逗号分隔的绝对路径，机器人可在这几个项目间切换）",
    default: workdir,
  });
  const projects = projectsInput
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const agent = await select({
    message: "默认 agent",
    choices: [
      { name: "build（全权：可改文件、执行命令）", value: "build" },
      { name: "plan（只读分析）", value: "plan" },
    ],
  });

  const allowFrom = await input({
    message:
      "允许的微信用户 ID（逗号分隔；留空 = 首次配对模式，第一个私聊机器人的人会被允许）",
    default: "",
  });

  await loginWechat(join(config.dataDir, "wechat"));

  writeEnv(config.configDir, {
    ALLOW_FROM: allowFrom,
    OPENCODE_CWD: workdir,
    PROJECTS: projects.join(","),
    DEFAULT_AGENT: agent,
    AUTO_APPROVE_PERMISSIONS: "true",
  });

  console.log("\n配置完成：");
  console.log(`  配置文件: ${join(config.configDir, ".env")}`);
  console.log(`  微信凭据: ${join(config.dataDir, "wechat")}`);
  console.log("  下一步：zxk-chat plugins:install 装插件，zxk-chat start 启动机器人。");
}

function statusCmd(): void {
  const envFile = join(config.configDir, ".env");
  const wechatDir = join(config.dataDir, "wechat");
  const pluginDir = join(homedir(), ".config", "opencode", "plugins");
  const installed = ["block-secrets.ts", "wechat-notify.ts"].filter((f) =>
    existsSync(join(pluginDir, f)),
  );
  console.log(`配置目录: ${config.configDir}`);
  console.log(`数据目录: ${config.dataDir}`);
  console.log(`配置文件: ${envFile}  ${existsSync(envFile) ? "✓" : "✗"}`);
  console.log(`微信凭据: ${wechatDir}  ${existsSync(wechatDir) ? "✓" : "✗（setup 或 start 时扫码）"}`);
  console.log(`opencode 插件: ${installed.length ? installed.join(", ") : "未安装（plugins:install）"}`);
  console.log(`opencode CLI: ${opencodeFound() ? "✓" : "✗ 未检测到"}`);
  console.log(`默认 agent: ${config.defaultAgent}`);
  console.log(`可用项目: ${config.projects.length ? config.projects.join(", ") : "（未配置）"}`);
}

function logsCmd(): void {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const file = join(
    config.logDir,
    `bot-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}.log`,
  );
  if (!existsSync(file)) {
    console.log(`暂无日志文件: ${file}`);
    return;
  }
  spawn("tail", ["-f", file], { stdio: "inherit" });
}

function pluginCmd(remove: boolean, rest: string[]): void {
  const pi = rest.indexOf("--project");
  const projectDir = pi !== -1 ? rest[pi + 1] : undefined;
  // 全局 CLI 默认装到全局（机器人所有项目生效）；--project <dir> 指定项目级
  const opts = { global: !projectDir, projectDir };
  if (remove) {
    const r = uninstallPlugins(opts);
    if (r.removed === 0) console.log(`无已安装插件（${r.files.join(", ")}）`);
    else console.log(`已移除 ${r.removed} 个插件: ${r.files.slice(0, r.removed).join(", ")}`);
  } else {
    const r = installPlugins(opts);
    console.log(`已安装 ${r.count} 个插件到 ${r.target}`);
  }
  console.log("重启 opencode（或 serve）后生效。");
}

async function uninstallCmd(): Promise<void> {
  const r = uninstallPlugins({ global: true });
  if (r.removed > 0) {
    console.log(`已移除 opencode 插件: ${r.files.slice(0, r.removed).join(", ")}`);
  } else {
    console.log("无已安装插件。");
  }

  const purge = await confirm({
    message: `删除配置与数据目录 ${config.configDir}（含微信登录凭据、会话映射、日志）？`,
    default: false,
  });
  if (purge) {
    rmSync(config.configDir, { recursive: true, force: true });
    console.log(`已删除 ${config.configDir}`);
  } else {
    console.log("保留配置与数据。");
  }
  console.log("\n最后一步：运行 npm uninstall -g zxk-chat-bot 卸载 npm 包本体。");
}

async function pingCmd(): Promise<void> {
  const { OpenCodeClient } = await import("./opencode.js");
  const oc = new OpenCodeClient();
  await oc.start();
  try {
    const id = await oc.createSession("ping");
    console.log(`opencode serve OK，session=${id}`);
    await oc.deleteSession(id).catch(() => {});
  } finally {
    oc.close();
  }
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  switch (cmd) {
    case "--help":
    case "-h":
    case undefined:
      console.log(HELP);
      break;
    case "--version":
    case "-v":
      console.log(PKG_VERSION);
      break;
    case "setup":
      await setupCmd();
      break;
    case "start":
      await import("./main.js");
      break;
    case "status":
      statusCmd();
      break;
    case "logs":
      logsCmd();
      break;
    case "plugins:install":
      pluginCmd(false, rest);
      break;
    case "plugins:uninstall":
      pluginCmd(true, rest);
      break;
    case "uninstall":
      await uninstallCmd();
      break;
    case "ping":
      await pingCmd();
      break;
    default:
      console.error(`未知命令: ${cmd}\n`);
      console.log(HELP);
      process.exit(1);
  }
}

main().catch((e) => {
  log.error("cli", `命令失败: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
