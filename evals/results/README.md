# 真实模型评测工件

本目录有两类工件：

1. **0.2.4 起：仓库运行器 `--live --out` 产物**。带 `schema: 1`、模型、时间、git 提交与逐条结果，可复跑（需要 `BOOST_API_KEY`）。当前记录使用 DeepSeek API（`BOOST_BASE_URL` 默认 `https://api.deepseek.com`，`BOOST_MODEL` 默认 `deepseek-chat`）。
2. **0.2.0 / 0.2.1：桌面版 DSH 上本地“配置桌面账户适配器”脚本的冒烟记录**。不是 `evals/run.ts --live` 的产物：
   - 采集脚本没有提交到仓库，**无法从仓库复现**；工件缺少 `model`、`created_at`、`git_commit`，不能用来对照当前代码或复跑。
   - `syntheticRequests: true` 表示请求是固定/合成样例，不是真实用户草稿；`syntheticModelResponse` 是当时保存的模型输出原文。
   - 样本量很小（每轮 1–5 条），只作为那次桌面冒烟的记录，不构成质量、生产可用性或 P90 延迟承诺。

真实模型证据的说明见 [../README.md](../README.md) 与 [docs/COMPATIBILITY.md](../../docs/COMPATIBILITY.md)。

## 0.2.4 DeepSeek API 评测工件

| 文件 | 内容 |
| --- | --- |
| `live-deepseek-chat-20261020.json` | 最终一轮：76 条非跳过样例，75 ok / 1 fallback（`inj3` 注入防御），coverage 0.9868，约束保留 29/29，P50 1141 ms / P90 1550 ms / max 1978 ms |
| `live-deepseek-chat-20261020-after-bookkeeping.json` | 中间轮：修正“改写释义默认项被 fact_not_in_body 拒绝”后，70 ok / 6 fallback |
| `live-deepseek-chat-20261020-before-tune.json` | 首轮基线：63 ok / 13 fallback（英文句首动词被误判为实体、释义默认项/来源记录被拒） |

运行方式：

```powershell
$env:BOOST_API_KEY = '<deepseek-api-key>'
$env:BOOST_BASE_URL = 'https://api.deepseek.com'
$env:BOOST_MODEL = 'deepseek-chat'
npm run evals:live -- --out evals/results/live-deepseek-chat-20261020.json
```

注意：三份 0.2.4 工件是在未提交的 0.2.4 工作树上生成的，`git_commit` 字段等于当时 HEAD（`ac65ff5`），不代表被测工作树的最终提交；凭据不会写入工件。

## 0.2.0 / 0.2.1 桌面冒烟文件

| 文件 | 内容 |
| --- | --- |
| `live-desktop-before.json` | 0.2.0 调整前基线冒烟（3 条，含 fallback 与 `fact_not_in_body`） |
| `live-desktop-after.json` | 0.2.0 调整后冒烟（3 条） |
| `live-desktop-0.2.0.json` | 0.2.0 冒烟（3 条，均为 ok） |
| `live-desktop-0.2.1.json` | 0.2.1 冒烟（5 条，含一次 fallback 复查） |
| `live-desktop-0.2.1-final.json` | 0.2.1 收尾复查（2 条，均为 ok） |
| `live-desktop-captured.json` | 单条传输失败记录（负向样例，`model_request_failed`） |

## 今后如何生成可追溯工件

使用运行器的 `--out` 输出，不要手工编辑或拼接：

```powershell
npm run evals:live -- --limit 10 --out evals/results/live-<model>-<yyyyMMdd>.json
```

`--out` 工件带 `schema: 1`、`model`、`created_at`、`git_commit`、逐条结果与 `summary`（字段说明见 [../README.md](../README.md)）。

提交前确认：

- 不含 `BOOST_API_KEY`、提供方错误正文或真实用户草稿/正文；
- 记录了模型名与提交号，能说明是哪一版代码、哪一轮样本（若工作树未提交，请像上文一样说明 `git_commit` 只是基线）；
- 单轮样本量仍然很小，结论只写“本轮已检查项目”，不要外推为生产质量。
