# OpenCode 兼容与更新

当前契约：OpenCode 2.2.4、`@opencode/plugin` 2.2.4、ELD 2.1.0、Node.js 26（本机验证 26.12.1）、npm 12.2.1。

## 依赖的接口

- `Plugin.define` 与 `ctx.session.hook`。
- `prompt`：保存语言元数据，保留原始用户文本。
- `context` / `title` / `generate`：修改请求副本中的 `system` 和 `messages`。
- `compaction`：记录语言；`http.request` 的 `kind=compaction`：在实际摘要提示之后添加约束。
- `ctx.session.context`、`ctx.session.get`、`ctx.agent.list().data`、`ctx.storage`。

压缩传输适配 Chat Completions / Anthropic 的 `messages` 和 Responses 的数组 `input`。其他格式明确报错；当前真实模型验证为 DeepSeek Chat Completions。

原生 synthetic 消息也可能转换为 `role=user`，因此不能把最后一条 role=user 当成人类输入。插件按消息 ID 结合带类型的历史判断来源；新的目标 kickoff 可覆盖较早用户消息的语言。

## 原生模板

`src/native-templates.json` 来自 OpenCode `v2.2.4`：

- `packages/core/src/plugin/command/initialize.txt`
- `packages/core/src/plugin/command/review.txt`
- `packages/core/src/plugin/command/schedule.txt`
- `packages/core/src/plugin/goal/kickoff.txt`

这些模板仅用于精确识别、提取用户参数，不用于替换 OpenCode 原有提示词。版权与许可见 `NOTICE`。目标评审通过最后一条用户请求中的原生 `<untrusted_objective>` 标记识别。

## 升级步骤

1. 比较新版本插件类型及上述四个模板。同步 SDK 版本、模板和锁文件。
2. 检查 native Plan 提醒、自动续接、标题、generate、compaction 的钩子顺序及消息形态。尤其确认摘要模板是否仍在 compaction 钩子之后追加。
3. 运行 `npm run check`，再运行实际模型四语言矩阵及 `--extended`。
4. 确认固定 JSON 字段和摘要标题不变、保存的用户文本不含注入内容，然后更新测试报告与版本。

验收门槛：中文 6/6；四语言合计至少 22/24；日语、阿拉伯语、英语各至少 5/6。Thinking 中出现连续其他语言叙述算失败；代码、标识符、必要引用和固定协议字段不计。没有输出 Thinking 的样本不能算推理语言通过。
