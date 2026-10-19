# DSH Prompt Booster

**在 DSH 输入框里，把一句草稿变成清晰、可执行、仍然属于你的任务。**

DeepSeek Harness（DSH）提示词优化插件：点一下输入框工具行的 ✦，结构化改写结果会直接写回原输入框；不自动发送，不弹预览窗，不打断你的编辑。

> A prompt-optimization plugin for DeepSeek Harness. It rewrites a rough draft into a structured, executable task and writes it back into the composer. No auto-send, no telemetry, no separate editor.

[![License: MIT](https://img.shields.io/badge/license-MIT-2f6f4f.svg)](https://github.com/clarkdonaldtfgbw5081-del/dsh-prompt-booster/blob/main/LICENSE)
[![CI](https://github.com/clarkdonaldtfgbw5081-del/dsh-prompt-booster/actions/workflows/ci.yml/badge.svg)](https://github.com/clarkdonaldtfgbw5081-del/dsh-prompt-booster/actions/workflows/ci.yml)
[![DSH](https://img.shields.io/badge/DSH-0.2.1--rc.2-4a6b5c.svg)](https://github.com/clarkdonaldtfgbw5081-del/dsh-prompt-booster/blob/main/docs/COMPATIBILITY.md)
[![Node](https://img.shields.io/badge/node-%3E%3D22.19-3c873a.svg)](https://github.com/clarkdonaldtfgbw5081-del/dsh-prompt-booster/blob/main/package.json)
![version](https://img.shields.io/badge/version-0.2.2-5b7f6a.svg)

<img src="https://raw.githubusercontent.com/clarkdonaldtfgbw5081-del/dsh-prompt-booster/main/docs/assets/icon.png" width="72" align="right" alt="DSH Prompt Booster 图标" />

![本地交互预览：同一套输入框组件，离线规则模拟](https://raw.githubusercontent.com/clarkdonaldtfgbw5081-del/dsh-prompt-booster/main/docs/assets/demo.png)

> 截图来自本地离线演示，使用规则模拟改写结果，不代表真实模型输出。安装版在 DSH 中通过宿主模型与原生输入框运行。

## 它解决什么

模糊的一句话往往缺少目标、交付物、约束和验收方式，模型只能猜。Prompt Booster 在后台把这些讲清楚，然后：

1. **仍然以你的原意为准**：数字、路径、代码、标识符、否定约束、交付阶段都会被保守校验。
2. **直接回到输入框**：使用 DSH 原生单步 `insertText` 事务，可继续编辑或一键还原。
3. **不自动发送**：发送按钮始终由你按下。
4. **不加额外选型调用**：任务分类、方案选择、约束检查都在本地规则中完成，一次优化只发起一次辅助模型请求（格式失败至多一次受控修复）。

## 功能

- **输入框内入口**：挂在 `conversation.input.left`，没有独立窗口或预览编辑器。
- **直接回填**：成功且通过校验后替换原草稿；请求期间编辑草稿、切换会话、加入结构化引用都会阻止旧结果覆盖。
- **取消与还原**：优化中再次点击图标可取消；失败时点击重试；成功后点击 ↶ 还原原稿。
- **任务感知的改写**：区分代码生成、故障排查、写作、研究、分析、网页 / 应用开发、现有项目修改与纯问答；写作和排错不会套用应用开发模板。
- **按需上下文**：只在草稿含有“这个 / 上面 / 根据”等指代时读取当前会话最近至多 3 条用户消息；文件只读取设置中明确列出的工作区文本，跳过常见凭据、二进制、目录与越界路径。
- **原生设置**：超时、输出预算、模型路由、上下文、详细度 / 语气 / 默认方案、修复策略都可以在 DSH 设置页或 profile patch 中管理。
- **可审计但不遥测**：辅助请求以 ignorable plugin record 写入当前 DSH 会话日志；事件摘要只保存在有界内存中，不单独落盘、不发送遥测。
- **中英状态文案**：按钮、优化中状态和失败提示跟随草稿语言切换；英文 locale 元信息已提供。
- **安全失败**：连接错误、超时、空响应、截断、格式错误和守卫失败会保留原稿并给出简短状态，不自动重试。

## 改写示意

输入：

```text
给这个项目加个登录页，先给方案，不要改代码
```

回填到输入框的内容大致会包含（示意，实际措辞由模型决定）：

```text
任务：为现有项目设计登录页方案，本轮先不改代码。
背景：沿用项目已有技术栈与目录约定；现有实现优先。
交付：方案包含页面结构、所需组件、数据与接口边界、验证方法。
约束：先给方案，等待确认；不新增依赖；不改动现有接口与数据结构。
验收：方案可落地，且明确说明本轮不实施代码改动。
```

改写不会增加原文没有的实体或业务范围；模型如果丢掉了“不要改代码”等约束，本地守卫会回退到原稿。

## 快速开始

### 从 Release 安装（推荐）

要求 DSH `0.2.1-rc.2`，并已配置可用模型。

1. 从本仓库 Releases 下载 `dsh-prompt-booster-0.2.2.tgz`。
2. 用管理该 DSH 安装的 CLI 安装：

   ```powershell
   dsh plugin --profile web add ./dsh-prompt-booster-0.2.2.tgz
   ```

   桌面版请使用应用安装目录自带的 CLI，不要混用其他全局安装的 `dsh`。

3. 完全退出并重新打开 DSH。
4. 打开会话，输入任务草稿，点击输入框工具行的 ✦ 图标。

详细安装、升级、卸载与排障见 [docs/INSTALLATION.md](https://github.com/clarkdonaldtfgbw5081-del/dsh-prompt-booster/blob/main/docs/INSTALLATION.md)。

### 从源码运行

```powershell
git clone https://github.com/clarkdonaldtfgbw5081-del/dsh-prompt-booster.git
cd dsh-prompt-booster
npm ci
npm run build
npm run dev
```

打开 `http://127.0.0.1:4317`。默认是明确标注的离线交互示例，不调用真实模型、不产生费用。

要构建并安装 tarball：

```powershell
npm run verify
npm pack
dsh plugin --profile web add ./dsh-prompt-booster-0.2.2.tgz
```

## 使用

1. 在 DSH 会话里写下任务草稿。
2. 点击输入框工具行的 ✦。
3. 图标旁显示“优化中…”；再次点击可取消。
4. 完成后正文直接显示在原输入框，继续编辑即可。
5. 不想采纳时点击 ↶ 还原原稿，或直接清空重新写。

插件从不调用发送接口。会话切换、草稿被改动、请求被取消时，旧结果不会写入新内容。

## 配置

在 DSH 原生设置中打开 `prompt-booster`，或在 profile patch 中覆盖：

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
    # provider: your-configured-provider
    # model: your-model-id
```

| 配置 | 默认值 | 说明 |
| --- | --- | --- |
| `timeoutMs` | `15000` | 含上下文与修复的总时限，100–120000 ms |
| `maxOutputTokens` | `4096` | 辅助请求输出上限；正文另有长度守卫 |
| `provider` / `model` | 跟随会话 | 同时填写时覆盖当前会话模型 |
| `context.recentMessages` | `referenced` | `off` / `referenced` / `always` |
| `context.recentLimit` | `3` | 最近用户消息条数，1–5 |
| `context.files` | `[]` | 明确选择的工作区文本文件，最多 6 个 |
| `preferences.detail` | `auto` | `auto` / `concise` / `detailed` |
| `preferences.tone` | `auto` | `auto` / `natural` / `formal` |
| `preferences.fillDefaults` | `true` | 是否补齐可调整的常规默认方案 |
| `repairAttempts` | `1` | 仅格式 / 守卫错误可修复一次；`0` 关闭 |

## 数据边界

- 只有点击优化图标后才会发起辅助模型请求；插件不监听每次键入，不自动改写发送链路。
- 默认发送：系统提示词、当前草稿、用户明确允许的上下文片段。
- 指代型草稿可能附带当前会话最近至多 3 条用户消息；可在设置中关闭。
- 选中的文件必须位于当前会话工作区，单文件不超过 48 KB，最多截取 6000 字符；常见凭据模式、`.env`、二进制、目录与越界路径会被跳过。识别规则不能保证发现所有敏感信息。
- 不发送遥测，不创建独立日志或持久化缓存；辅助请求和结果代码会作为 DSH 会话审计记录保存，由 DSH 自己管理存储和清理。
- 完整说明和守卫策略见 [SECURITY.md](https://github.com/clarkdonaldtfgbw5081-del/dsh-prompt-booster/blob/main/SECURITY.md) 与下文“限制”。

## 兼容性

| 项目 | 版本 |
| --- | --- |
| DSH | `0.2.1-rc.2` |
| Cordis | `4.0.5` |
| Node.js | `>=22.19.0`（构建 / 本地开发） |
| 验证环境 | Windows 桌面版；DSH Web 使用相同客户端体系 |

DSH 版本按精确版本固定。其他版本可能可以加载，但本仓库不声明兼容。接口、验证记录和未完成验收项见 [docs/COMPATIBILITY.md](https://github.com/clarkdonaldtfgbw5081-del/dsh-prompt-booster/blob/main/docs/COMPATIBILITY.md)。

## 开发与验证

```powershell
npm ci
npm run typecheck   # 宿主、客户端、检查配置四套 TS 检查
npm test            # 123 项自动化测试
npm run evals       # 80 条人工构造离线样例
npm run build       # 宿主、客户端 bundle、声明文件与本地 demo
npm run smoke       # 对构建产物执行原生 Cordis / 客户端注入冒烟
npm run verify      # 以上全部
```

结构说明：

```text
src/index.ts            原生 DSH 宿主服务与模型调用
src/adapters/wire.ts    显式 Typert RPC 边界
src/core/               任务分类、方案选择、提示模板、优化引擎
src/guards/             约束保留、来源、长度与越界检查
src/client/             输入框入口、直接回填、取消 / 还原 / 焦点
demo/                   本地交互预览（离线规则或兼容 API）
evals/                  黄金集、离线 / 在线评测运行器与方法
tests/                  核心、客户端、宿主集成与回归测试
scripts/build.mjs       构建脚本
cordis.patch.yml        DSH bundle 安装层
```

`npm run evals:live` 会调用真实模型，需要配置 `BOOST_API_KEY`；详见 [evals/README.md](https://github.com/clarkdonaldtfgbw5081-del/dsh-prompt-booster/blob/main/evals/README.md)。自动化测试与离线样例只能证明已覆盖的行为，不能证明任意自然语言输入的语义等价或下游任务质量。

## 限制

- 当前是 **MVP / 早期版本**：固定 DSH 版本，完整 Web 与桌面交互、IME、原生快捷键和更广泛的真实用户质量仍需验收。
- 本地规则是保守检查，不是语义证明；改写后请仍然看一眼输入框再发送。
- 含结构化引用的草稿暂时禁用优化；普通附件保留在宿主输入框，不自动参与优化。
- 真实模型评测样本很小（约 5 条桌面冒烟），不构成生产质量或 P90 延迟承诺。
- 界面状态与错误提示会随草稿语言切换；DSH 设置页字段说明和部分宿主侧文案目前仍以中文为主。
- 项目只支持浅色 / 深色由 DSH 主题决定，不单独维护主题。

后续计划见 [docs/ROADMAP.md](https://github.com/clarkdonaldtfgbw5081-del/dsh-prompt-booster/blob/main/docs/ROADMAP.md)。

## 贡献

欢迎 Issue 和 PR。开始之前请阅读 [CONTRIBUTING.md](https://github.com/clarkdonaldtfgbw5081-del/dsh-prompt-booster/blob/main/CONTRIBUTING.md) 与 [SECURITY.md](https://github.com/clarkdonaldtfgbw5081-del/dsh-prompt-booster/blob/main/SECURITY.md)；安全问题请使用 GitHub 私密漏洞报告，而不是公开 Issue。

## License

[MIT](https://github.com/clarkdonaldtfgbw5081-del/dsh-prompt-booster/blob/main/LICENSE) © 2026 DSH Prompt Booster contributors

本项目独立实现，不包含 [Architect](https://github.com/architect/architect) 或其他框架的源代码；对其方法的借鉴说明见 [docs/ARCHITECT-INTEGRATION.md](https://github.com/clarkdonaldtfgbw5081-del/dsh-prompt-booster/blob/main/docs/ARCHITECT-INTEGRATION.md)。DSH、Cordis 及 DeepSeek 相关包归各自权利人所有。
