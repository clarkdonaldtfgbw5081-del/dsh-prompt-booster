# 人工构造回归集与真实模型评测

为 DESIGN.md 8.1 提供可重复的回归基线。83 条样例由人工构造，尚未组成真实用户请求黄金集。样例定义在 [cases.ts](./cases.ts)，运行器是 [run.ts](./run.ts)。

## 运行

```powershell
npm run evals              # 离线回归（无模型调用，零成本，进 prepack）
npm run evals:live         # 真实模型评测，需要 BOOST_API_KEY（见主 README）
npm run evals:live -- --limit 10   # 只跑前 10 条，控制成本
npm run evals:live -- --limit 10 --out evals/results/live-<model>-<date>.json
```

## 两种模式

**离线（默认）** 是确定性回归，不依赖模型：

- 路由断言：五类任务分类、明确跳过分支（空输入、寒暄、继续、宿主命令）。
- 守卫回归：把 `scripted.candidate` 当作模型输出发给真实的守卫层，断言接受（`ok`）或回退
  （`fallback` 且 `warnings` 包含期望的错误码，如 `lost_constraint`、`expanded_scope`）。
  对应设计的“MVP 回归样例中的关键约束变更必须修复后才能发布”。

离线失败会以退出码 1 结束，`npm test` 之外由 `prepack` 再次把关。

**--live** 调用 `BOOST_API_KEY` 指向的真实服务，默认使用 DeepSeek 兼容端点（`BOOST_BASE_URL` 默认 `https://api.deepseek.com`，`BOOST_MODEL` 默认 `deepseek-chat`，也可覆盖为其他兼容服务），对非跳过样例逐条执行完整优化，统计：

- 状态分布（ok / skipped / fallback / cancelled）。
- 可用改写覆盖率；回退和取消作为失败报告，不从样本中悄悄排除。
- 成功改写的约束保留率：同时显示成功稿分母与所有含约束尝试数。
- 无依据新增：`forbidden` 内容出现在正文即判失败。
- 延迟 P50 / P90 / 最大值，采用 nearest-rank 分位数，空样本显示 n/a。

出现回退、取消、约束丢失、无依据新增或没有任何可用改写时，`--live` 以退出码 1 结束。参数缺失、负数、零或小数 `--limit` 会在调用模型前拒绝；没有 `BOOST_API_KEY` 时同样先报错退出，不产生任何工件。

### 机器可读工件（--out）

默认只在终端输出摘要。加 `--out <path>` 会把同一轮结果写成 JSON 工件；目录不存在时自动创建。

```powershell
npm run evals:live -- --limit 10 --out evals/results/live-deepseek-chat-20261020.json
```

工件字段（`schema: 1`）：

- `model`：实际使用的模型名（不包含凭据）。
- `created_at`：本轮开始时间（UTC ISO 8601）。
- `git_commit`：仓库 HEAD；git 不可用、目录不是仓库或没有提交时为 `null`，不中断评测。
- `cases[]`：`id`、`group`、`status`、`reason`、`warnings`、`latency_ms`、`attempts`、
  `chars`（优化稿字符数）、可行的 `preservation_ok` 与 `forbidden_hits`。
- `summary`：`total` / `ok` / `fallback` / `skipped` / `cancelled`，`coverage`（可用改写比例 0–1），
  `preservation`（含约束样本的保留比例 0–1，无样本时为 `null`），
  `p50` / `p90` / `max`（nearest-rank 毫秒，无样本时为 `null`）。
- `options.limit`：本轮 `--limit` 抽样上限，未设置时为 `null`。

工件**不包含**草稿正文、优化后正文、`BOOST_API_KEY` 或提供方错误正文；失败时仍会写出工件便于复盘，但退出码仍为 1。历史工件（0.2.0 / 0.2.1 桌面冒烟）的来源与限制见 [results/README.md](./results/README.md)；不要提交含凭据或真实用户正文的结果。

## 样例类别

五类核心任务（code_gen / debug / research / writing / analysis）、明确跳过、短请求、
否定约束、代码与路径、多语言、资料冲突、提示注入、长度上限、未采纳建议、数字单位。
当前 83 条；条数落在设计的目标区间，但不等于已经满足“真实用户黄金集”的来源要求。

0.2.5 在 `quality-cases.ts` 增加 12 组代表场景。`npm run evals` 另外执行 24 项正反对照断言，`tests/quality.test.ts` 同时检验同义表达、明确多任务遗漏，以及新规则不能放宽数字、路径、禁止项或被页面默认项掩盖。样例覆盖排查卡顿、周报、界面调整、安装与卸载、邮件与会议总结等；均为人工编写，不含收集的真实用户数据，未冒充真实模型输出。现有 `--live` 仍运行原回归集，不把这些新增离线对照计入旧版 76 条模型结果。

## 结论边界

- 守卫规则是保守检查：离线全过不能证明任意自然语言的语义等价，也不能证明模型在真实
  输入上的行为；后者只能由 `--live` 与人工抽评补充。
- `must_preserve` / `forbidden` 只能表达可判定的子串级事实；意图保真度仍需人工评价。
- `--live` 会把草稿与资料发送至所配置的模型服务，注意数据边界。
- 0.2.4 已用 DeepSeek API（`deepseek-chat`）跑 76 条非跳过样例（75 ok，1 条为注入防御命中），工件见 [results/README.md](./results/README.md)；0.2.0 / 0.2.1 另有少量桌面账户冒烟记录。样本仍小，不能据此宣称质量或 P90 延迟；0.2.2 / 0.2.3 没有真实模型样本。
