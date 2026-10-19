# 安装

## 环境要求

- **DSH**：`0.2.1-rc.2`（当前固定目标；其他版本需自行验证）。
- **Cordis**：`4.0.5`。
- **Node.js**：`>=22.19.0`（仅从源码构建或运行本地演示时需要；安装预打包 tarball 时由 DSH 运行时负责）。
- **操作系统**：DSH Web / 桌面版；目前已知可在 Windows 桌面版安装。

> 本插件是 DSH 插件，不是独立应用。安装前请确认 DSH 已配置可用的模型服务。

## 从 Release 安装（推荐）

1. 从仓库 Release 下载与 DSH 版本匹配的 `dsh-prompt-booster-<version>.tgz`。
2. 使用管理该 DSH 安装的 CLI 安装：

   ```powershell
   dsh plugin --profile web add ./dsh-prompt-booster-0.2.2.tgz
   ```

   桌面版请使用应用安装目录中附带的 CLI，不要混用其他全局安装的 `dsh`。

3. 重启 DSH（桌面版需完全退出并重新打开），新插件会在输入框工具行出现。
4. 打开一个会话，输入任务草稿，点击输入框工具行的 ✦ 图标。

## 从源码构建并安装

```powershell
git clone https://github.com/clarkdonaldtfgbw5081-del/dsh-prompt-booster.git
cd dsh-prompt-booster
npm ci
npm run typecheck
npm test
npm run build
npm pack
dsh plugin --profile web add ./dsh-prompt-booster-0.2.2.tgz
```

`npm pack` 会依次执行发布前路径检查、类型检查、123 项测试、离线评测、构建和产物冒烟检查；全部通过后才会生成 tarball。

## 升级

```powershell
dsh plugin --profile web add ./dsh-prompt-booster-0.3.0.tgz
```

安装后完全退出并重启 DSH。插件配置保存在当前 DSH profile 中；升级默认保留已有配置。

## 卸载

```powershell
dsh plugin --profile web remove dsh-prompt-booster
```

重启 DSH 后生效。卸载不会删除会话本身，也不会清理 DSH 会话中已有的插件审计记录（由 DSH 会话机制管理）。

## 配置

安装后可在 DSH 原生设置页打开 `prompt-booster`。也可以把配置写在 DSH profile 的 patch 中，例如：

```yaml
- id: prompt-booster
  config:
    timeoutMs: 15000
    maxOutputTokens: 4096
    repairAttempts: 1
    context:
      recentMessages: referenced
      recentLimit: 3
      files: []
    preferences:
      detail: auto
      tone: auto
      fillDefaults: true
```

字段说明见主 README 的“配置”一节。DSH 的行配置会整体替换，修改时应列出完整配置。

## 常见问题

**安装后没有看到图标。**
确认 DSH 版本为 `0.2.1-rc.2`，插件已安装到当前使用的 profile，并且 DSH 已完全重启。桌面版请确认使用的是应用附带的 CLI。

**模型请求失败或超时。**
插件会保留原稿并显示简短失败状态，点击图标可重试。检查 DSH 当前会话的模型配置、网络和 `timeoutMs` 设置；插件不会自动重试传输错误。

**输入框中有结构化引用或正在提交。**
含结构化引用时优化入口会禁用；这是为了避免破坏引用身份。移除引用后可再次尝试。

**如何确认没有自动发送？**
插件只调用输入框的原生 `insertText` 回填，不调用发送接口。是否发送始终由用户决定。

## 隐私与安全

插件只在用户点击优化图标后，将当前草稿、用户明确允许的上下文片段和系统提示词发送给 DSH 当前配置的模型；默认不发送遥测、不创建独立日志、不持久化正文。详细边界见主 README 的“数据边界”与 [SECURITY.md](../SECURITY.md)。
