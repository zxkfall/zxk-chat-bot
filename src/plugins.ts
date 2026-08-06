import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const GLOBAL_PLUGINS_DIR = join(homedir(), ".config", "opencode", "plugins");

export interface PluginTargetOptions {
  global?: boolean;
  projectDir?: string;
}

/** 插件源码目录：dist/plugins.js → 包根 plugins/；src/plugins.ts → 仓库根 plugins/ */
export function resolvePluginsSource(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "..", "plugins");
}

export function resolvePluginsTarget(opts: PluginTargetOptions): string {
  if (opts.global) return GLOBAL_PLUGINS_DIR;
  if (opts.projectDir) return join(resolve(opts.projectDir), ".opencode", "plugins");
  return join(process.cwd(), ".opencode", "plugins");
}

function pluginFilenames(source: string): string[] {
  if (!existsSync(source)) return [];
  return readdirSync(source).filter((f) => /\.(ts|js)$/.test(f));
}

export function installPlugins(opts: PluginTargetOptions): { count: number; target: string } {
  const source = resolvePluginsSource();
  const files = pluginFilenames(source);
  if (files.length === 0) throw new Error(`插件目录 ${source} 里没有插件文件`);
  const target = resolvePluginsTarget(opts);
  mkdirSync(target, { recursive: true });
  for (const f of files) {
    copyFileSync(join(source, f), join(target, f));
  }
  return { count: files.length, target };
}

export function uninstallPlugins(opts: PluginTargetOptions): {
  removed: number;
  target: string;
  files: string[];
} {
  const source = resolvePluginsSource();
  const files = pluginFilenames(source);
  const target = resolvePluginsTarget(opts);
  let removed = 0;
  if (existsSync(target)) {
    for (const f of files) {
      const p = join(target, f);
      if (existsSync(p)) {
        rmSync(p);
        removed++;
      }
    }
  }
  return { removed, target, files };
}
