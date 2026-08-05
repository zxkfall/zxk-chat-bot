import { existsSync, mkdirSync, readdirSync, rmSync, copyFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_PLUGINS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "plugins");
const GLOBAL_PLUGINS_DIR = join(homedir(), ".config", "opencode", "plugins");

const args = process.argv.slice(2);
const remove = args.includes("--remove");
const globalTarget = args.includes("--global");

const projectIdx = args.indexOf("--project");
const projectDir = projectIdx !== -1 ? args[projectIdx + 1] : undefined;

function resolveTarget(): string {
  if (globalTarget) return GLOBAL_PLUGINS_DIR;
  if (projectDir) return join(resolve(projectDir), ".opencode", "plugins");
  return join(process.cwd(), ".opencode", "plugins");
}

function pluginFilenames(): string[] {
  if (!existsSync(REPO_PLUGINS_DIR)) return [];
  return readdirSync(REPO_PLUGINS_DIR).filter((f) => /\.(ts|js)$/.test(f));
}

function install(target: string): void {
  const files = pluginFilenames();
  if (files.length === 0) {
    console.log(`[plugins] 仓库 ${REPO_PLUGINS_DIR} 里没有插件文件`);
    process.exit(1);
  }
  mkdirSync(target, { recursive: true });
  for (const f of files) {
    copyFileSync(join(REPO_PLUGINS_DIR, f), join(target, f));
  }
  console.log(`[plugins] 已安装 ${files.length} 个插件到 ${target}`);
  console.log(`[plugins] 重启 opencode（或 serve）后生效`);
}

function uninstall(target: string): void {
  if (!existsSync(target)) {
    console.log(`[plugins] 目标目录不存在，无需卸载: ${target}`);
    return;
  }
  const files = pluginFilenames();
  let removed = 0;
  for (const f of files) {
    const p = join(target, f);
    if (existsSync(p)) {
      rmSync(p);
      removed++;
    }
  }
  if (removed === 0) {
    console.log(`[plugins] 目标目录里没有本仓库的插件（${files.join(", ")}），无需卸载`);
    return;
  }
  console.log(`[plugins] 已移除 ${removed} 个插件: ${files.slice(0, removed).join(", ")}`);
  console.log(`[plugins] 重启 opencode（或 serve）后生效`);
}

const target = resolveTarget();
if (remove) {
  uninstall(target);
} else {
  install(target);
}
