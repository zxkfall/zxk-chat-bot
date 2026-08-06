import { installPlugins, uninstallPlugins } from "../src/plugins.js";

const args = process.argv.slice(2);
const remove = args.includes("--remove");
const opts = {
  global: args.includes("--global"),
  projectDir: args.indexOf("--project") !== -1 ? args[args.indexOf("--project") + 1] : undefined,
};

try {
  if (remove) {
    const r = uninstallPlugins(opts);
    if (r.removed === 0) {
      console.log(`[plugins] 目标目录里没有本仓库的插件（${r.files.join(", ")}），无需卸载`);
    } else {
      console.log(`[plugins] 已移除 ${r.removed} 个插件: ${r.files.slice(0, r.removed).join(", ")}`);
      console.log("[plugins] 重启 opencode（或 serve）后生效");
    }
  } else {
    const r = installPlugins(opts);
    console.log(`[plugins] 已安装 ${r.count} 个插件到 ${r.target}`);
    console.log("[plugins] 重启 opencode（或 serve）后生效");
  }
} catch (e) {
  console.log(`[plugins] ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}
