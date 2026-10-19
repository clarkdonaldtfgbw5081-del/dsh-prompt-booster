# AGENTS.md

本仓库是 DSH 的提示词优化插件。开始前只看与当前改动相关的文档，不要为一个小改动通读全部资料。

## 按任务取上下文

- 修改提示词、上下文裁剪或默认项：读 [docs/PROMPT-ENGINEERING.md](docs/PROMPT-ENGINEERING.md)、`src/core/prompt.ts` 和相关测试。
- 本地开发、构建与测试：读 [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)。
- 安装、版本和发布：读 [docs/INSTALLATION.md](docs/INSTALLATION.md) 和 [docs/PUBLISHING.md](docs/PUBLISHING.md)。
- 修改界面文案：同时看 `src/client/copy.ts` 和 `tests/i18n.test.tsx`。

## 验证

- 行为改动运行 `npm run verify`。本地测试使用临时目录和固定样例，没有生产访问；可以自行运行、修复相关失败并重跑，不需要逐次询问。
- 没有 `BOOST_API_KEY` 时不要运行 `npm run evals:live`，也不要把凭据写进仓库或日志。
- 提交前运行 `npm run check:publish`，不要提交 `.local/`、`.reference/`、`install-backup-*/`、`*.tgz`、`lib/` 或本机绝对路径。

## 边界

- 不自动发送、不改写发送链路、不增加额外模型调用、不添加遥测或独立日志。
- 提示词负责意图，`guards/` 负责确定性检查；不要只加提示词而跳过守卫和测试。
- 核心 `SYSTEM_PROMPT` 保持短；任务指导放到 `intent.ts` / `strategy.ts` / `defaults.ts`，空上下文不要发送。
- 不声称超出测试和评测证据的质量结论；真实模型效果需要 `evals:live` 或人工验收。
