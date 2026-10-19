# 开发指南

## 环境

- Node.js `>=22.19.0`（开发使用 `24.16.0`）
- npm 11（仓库含 `package-lock.json`，使用 `npm ci`）
- 目标 DSH `0.2.1-rc.2` 与 Cordis `4.0.5`；宿主和客户端两类依赖都要安装
- 推荐 Windows / macOS / Linux；当前主要在 Windows 验证，跨平台问题请提 Issue

```powershell
npm ci
git config core.hooksPath .githooks   # 一次性：启用发布前路径检查
npm run check:publish
npm run typecheck
npm test
npm run evals
npm run build
npm run smoke
```

或一次运行全部检查：

```powershell
npm run verify
```

`npm run check:publish` 会扫描 git 可见文件，阻止 `.reference/`、`.local/`、备份、tarball、本机盘符路径和个人用户名进入提交。`pre-commit` 已配置为自动执行同一检查。

## 本地演示

```powershell
npm run build
npm run dev
```

默认地址 `http://127.0.0.1:4317`，只监听回环地址，使用离线规则模拟；不调用模型、不产生费用。需要用兼容 Chat Completions 服务时：

```powershell
$env:BOOST_API_KEY = '<key>'
$env:BOOST_BASE_URL = 'https://api.deepseek.com'
$env:BOOST_MODEL = 'deepseek-chat'
npm run dev
```

API key 只存在于启动服务的终端进程中；演示页面本身不存储密钥。`BOOST_BASE_URL` 是接口前缀，代码会追加 `/chat/completions`。

## 结构

```text
src/index.ts            宿主服务、模型调用、会话审计、反馈
src/adapters/           wire / route / context / controls 适配层
src/core/               引擎、任务分类、方案选择、提示词、失败与反馈
src/core/prompt.ts      短核心提示词、渐进式上下文（modelInput）与 PROMPT_VERSION
src/guards/             确定性约束检查
src/client/             React 输入框入口、回填、取消、还原、样式与中英文文案
src/client/copy.ts      客户端状态 / 按钮 / 错误文案的中英字典
demo/                   Vite 之外的本地交互预览（esbuild + http server）
evals/                  80 条构造样例、离线 / 在线指标
tests/                  Node test runner + React Test Renderer
scripts/build.mjs       宿主与客户端 bundle、声明文件
scripts/smoke-package.mjs 构建产物集成冒烟
cordis.patch.yml        DSH bundle 安装层
locale/                 中英文客户端文案
```

## 约束与设计规则

修改功能时请保持这些边界：

1. **不自动发送**：只能通过 `inputActions.insertText` 回填，不调用发送接口。
2. **不隐式改写发送链路**：只在用户点击图标后工作。
3. **不增加额外模型调用**：分类、方案、守卫在本地完成；一次优化最多一次主请求加一次受控修复。
4. **不新增遥测或独立日志**：事件只进有界内存；需要诊断时复用 DSH 会话审计。
5. **新增依赖要克制**：优先原生能力；生产依赖变更需要说明体积、维护状态与安全影响。
6. **DSH 版本固定**：接口变化时更新 `engines.dsh`、peerDependencies、兼容文档与测试，不要在一个版本里同时声称兼容多个 DSH 版本。
7. **失败要可解释**：新增失败分支要定义安全的 `reason_code`，不把提供方异常正文透传到客户端。
8. **提示词按需展开**：通用规则才进 `SYSTEM_PROMPT`；页面默认项、软件方案和保护片段只在适用时由 `modelInput()` 发送。修改原则见 [PROMPT-ENGINEERING.md](./PROMPT-ENGINEERING.md)。

## 测试要求

- 行为变更必须附带测试；核心守卫、回填、取消、版本冲突、上下文边界属于关键路径。
- 新增或修改客户端文案时，同时更新 `src/client/copy.ts` 的中英字典与 `tests/i18n.test.tsx`。
- 修改提示词或默认方案后运行 `npm run evals`，并在 PR 说明是否重新运行了真实模型评测。
- 视觉 / 图标变更提供 `docs/assets/` 下的预览图，不要求真实 DSH 截图。
- 测试不得依赖真实 API key、用户目录或网络；桌面真实模型验证只能在本地手动进行，结果不要提交含凭据的文件。

## 代码风格

- TypeScript，2 空格缩进，无分号，单引号；沿用现有文件风格。
- 保持模块边界：宿主、客户端、核心引擎不交叉引用。
- 注释只解释原因或不明显的约束，不复述代码。
- 不提交构建产物（`lib/`、`demo/dist/`）、本地备份、tarball 或 `.reference/`。

## 提交 PR

1. 从 `main` 拉分支，保持 diff 聚焦。
2. 运行 `npm run verify`。
3. 更新 `CHANGELOG.md`（用户可见行为）和受影响文档。
4. 在 PR 中写清动机、行为变化、验证命令和未覆盖的边界。
