# TROUBLESHOOTING.md

踩坑排查记录。每个条目：现象 / 根因 / 修复 / 排查要点。遇到新问题按同格式追加。

---

## npm 发布 CI 报 404 "not in this registry"

**现象**：GitHub Actions 里 `npm publish --provenance` 报
`404 Not Found - PUT https://registry.npmjs.org/zxk-chat-bot`（`'zxk-chat-bot@0.1.1' is not in this registry`），
但日志里 provenance（"Signed provenance statement"）已成功签名。

**根因**：runner 上 Node 22.x 捆绑的 npm 是 10.9.8，低于 npm Trusted Publishing（OIDC）要求的
**npm ≥ 11.5.1**。npm CLI 版本不够 → 无法自动做 OIDC 认证 → 以未认证身份 PUT → 404。

**修复**：publish workflow 里 publish 前加一步升级 npm：
```yaml
- run: npm install -g npm@latest
```

**排查要点**：
- provenance 签名走 sigstore，**签名成功 ≠ npm OIDC 认证成功**，两者独立。
- `npm whoami` **不反映 OIDC 状态**（npm 文档注明），用它调试没用。
- npm 保存 Trusted Publisher 时**不校验**，只有发布时才报错。
  - 报 `ENEEDAUTH`（Unable to authenticate）= Owner / Repo / Workflow 字段不匹配
    （区分大小写；Workflow 只填文件名如 `publish.yml`，不含路径）。
- Trusted Publishing **不需要** `actions/setup-node` 的 `auth-type: oidc`——npm CLI 自动检测 OIDC 环境。
- workflow 只需 `permissions: id-token: write` + `registry-url: https://registry.npmjs.org`。

**相关**：详见 README「作为 npm CLI 发布」章节。
