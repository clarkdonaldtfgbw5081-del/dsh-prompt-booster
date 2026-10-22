# 发布到 GitHub

这份清单帮助把仓库整理成可公开的 GitHub 项目。当前假设仓库为 `clarkdonaldtfgbw5081-del/dsh-prompt-booster`；如果最终使用其他 owner 或仓库名，请同步替换文中的 owner / repo。

## 1. 发布前检查

```powershell
# 确认以下本地目录没有被提交
git status --short
# .reference/  install-backup-*/  *.tgz  .local/  node_modules/  lib/  demo/dist/ 应全部不出现
# 本次整理已把 .reference 移到仓库外，并把个人记录/备份移到 .local/
```

- [ ] 已运行 `npm run check:publish`；本地 pre-commit hook 指向 `.githooks`（一次性配置：`git config core.hooksPath .githooks`）。
- [ ] 提交前另运行 `node scripts/check-publish.mjs --staged` 检查实际暂存 blob；只清理工作区不会消除已经暂存的敏感内容。首次公开前还要检查 Git 历史，删除当前文件不能清除旧提交。
- [ ] `.reference/` 是本地 DSH 源码参考副本，不能公开或提交；本次已移到仓库外的本地参考目录。
- [ ] `install-backup-*/` 是本地 DSH profile 备份，不能提交；仓库已将其忽略。
- [ ] `.local/` 保存了个人安装记录、旧版 review 和仅本地可用的 QA 脚本，已在 `.gitignore` 中忽略。
- [ ] `dsh-prompt-booster-*.tgz` 是构建产物，应通过 GitHub Release 分发，不进 git。
- [ ] `docs/DESIGN.md`、`docs/COMPATIBILITY.md`、`docs/ARCHITECT-INTEGRATION.md` 中的路径和链接已更新。
- [ ] 全仓库搜索盘符路径、本机用户名、`DeepSeek-Harness-Recovered`，确认只剩测试样例或说明文本。
- [ ] `npm run verify` 通过（已包含版本一致性、打包内容与 tarball 冒烟）。
- [ ] `npm run test:browser` 通过；首次需 `npx playwright install chromium`。完整 DSH 与系统输入法待验项见 INTERACTION-ACCEPTANCE.md，不能用夹具测试替代。
- [ ] `npm run check:pack` 只包含 `lib/`、`locale/`、`cordis.patch.yml`、`README.md`、`CHANGELOG.md`、`package.json` 与 `LICENSE`。

## 2. 仓库信息

`package.json` 当前已填写以下字段；如果最终更换 owner / repo，需要同步更新：

```json
{
  "repository": {
    "type": "git",
    "url": "git+https://github.com/clarkdonaldtfgbw5081-del/dsh-prompt-booster.git"
  },
  "bugs": { "url": "https://github.com/clarkdonaldtfgbw5081-del/dsh-prompt-booster/issues" },
  "homepage": "https://github.com/clarkdonaldtfgbw5081-del/dsh-prompt-booster#readme"
}
```

README 与 docs 中的仓库地址也已按 `clarkdonaldtfgbw5081-del/dsh-prompt-booster` 填写。README 已包含 CI 徽章；如果最终仓库地址变化，需同步替换徽章 URL。

```markdown
[![CI](https://github.com/clarkdonaldtfgbw5081-del/dsh-prompt-booster/actions/workflows/ci.yml/badge.svg)](https://github.com/clarkdonaldtfgbw5081-del/dsh-prompt-booster/actions/workflows/ci.yml)
```

## 3. 初始化与推送

本仓库已执行 `git init -b main`。如果是重新从压缩包开始，先初始化；正常情况下直接提交并推送：

```powershell
git add .
git commit -m "chore: initial public release"
git remote -v
# 仅当 origin 尚未配置时执行：
# git remote add origin https://github.com/clarkdonaldtfgbw5081-del/dsh-prompt-booster.git
git push -u origin main
```

如果仓库尚未创建且本地尚未配置同名 `origin`，也可以使用 GitHub CLI；已有仓库沿用现有 remote：

```powershell
gh repo create clarkdonaldtfgbw5081-del/dsh-prompt-booster --public --source=. --remote=origin --push
```

## 4. 创建 Release

发布由 `.github/workflows/release.yml` 自动完成：推送形如 `v*` 的 tag 后，工作流会校验 tag 与 `package.json` 版本一致，运行 `npm run verify`，安装 Chromium 并执行 `npm run test:browser`，再打包、从 CHANGELOG.md 提取说明并创建附带 tarball 的 GitHub Release。

```powershell
git tag v0.2.9
git push origin v0.2.9
# 等待 Release 工作流完成；会生成 dsh-prompt-booster-0.2.9.tgz
```

手工步骤仅在需要本地预演或工作流不可用时作为补充：

```powershell
npm run verify
npm pack
# 生成 dsh-prompt-booster-0.2.9.tgz
```

如果更新了版本，请先运行 `npm run release:version 0.2.9`，再提交并打 tag；随后核对 README badge、README / INSTALLATION 中的 `dsh-prompt-booster-0.2.9.tgz`、本文件的版本示例与 `.github/ISSUE_TEMPLATE/bug_report.yml` 的版本占位是否已同步。

Release notes 由 `scripts/changelog-notes.mjs` 从 `CHANGELOG.md` 对应版本生成（自动化工作流会用它创建 Release），应包含 DSH 基线 `0.2.1-rc.2`、测试结果和限制。

## 5. GitHub 仓库设置

- [ ] Settings → Security → 启用 **Private vulnerability reporting**。
- [ ] Settings → Code security → 启用 **Dependabot alerts** 和 **security updates**。
- [ ] 添加 topics：`deepseek-harness`、`dsh-plugin`、`prompt-engineering`、`cordis`。
- [ ] 保护 `main`：要求 CI 通过、禁止强制推送。
- [ ] 在 About 中填写一句话描述和 `docs/INSTALLATION.md` 链接。
- [ ] 检查 Actions 权限：CI 工作流只需要只读权限（`ci.yml` 声明 `contents: read`）；Release 工作流需要写权限（`release.yml` 声明 `contents: write`，用于创建 GitHub Release 并上传 tarball），仓库的 Workflow permissions 需允许该工作流写入。

## 6. npm（可选）

npm 包名是否可用需要在发布时查询，本文不保证仍然空闲。这是 DSH 插件，`npm install` 单装无法脱离 DSH 运行；peerDependencies 需要目标 DSH 环境提供。如果发布：

```powershell
npm login
npm publish
```

发布前确认：

- [ ] `package.json` 的 `repository`、`bugs`、`homepage` 已补全。
- [ ] `npm pack --dry-run --ignore-scripts` 内容干净。
- [ ] 版本号不与已有 Release 冲突。
- [ ] 已在 README 明确“安装到 DSH，而不是独立运行”。
- [ ] README 中的 `docs/` 链接与截图默认只存在于 GitHub；若要让 npm 页面也能显示，需把 `docs/assets` 加入 `files` 或改用绝对 URL。

## 7. 发布后核对

- [ ] 全新克隆后 `npm ci && npm run build && npm run dev` 可运行。
- [ ] 从 Release 下载 tarball 并按 INSTALLATION 安装到 DSH 可用。
- [ ] README 截图路径、文档互链、Issue / PR 模板可打开。
- [ ] 搜索仓库没有 `.reference/`、备份、tarball、密钥、个人路径。
- [ ] Release notes 与 `CHANGELOG.md` 一致，并再次说明真实模型评测的样本限制。
