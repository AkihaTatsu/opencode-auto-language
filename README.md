# OpenCode Auto Language

让 OpenCode 的 Thinking、计划、摘要与回答跟随用户语言。使用 ELD 离线识别 60 种语言，不额外调用 LLM；针对 OpenCode **2.2.4** 的 V2 插件接口开发，已使用 DeepSeek 验证。

## 功能

- 识别用户任务文本的语言，排除代码、引用和原生命令模板；短确认沿用会话语言，支持重启后恢复。
- 向系统提示词末尾和模型收到的用户消息副本追加语言要求，保留保存的用户原文、工具定义、权限及固定输出格式。
- 覆盖原生 `plan` / `build`、工具续接、中断恢复、最大步数总结，以及 `/init`、`/review`、`/schedule`、`/goal`、会话压缩、标题、原生 summary 和目标评审。

第三方角色及原生 `general` / `explore` 不注入语言指令。首次输入无法识别且没有历史语言时，不指定默认语言。

中文、日语、阿拉伯语、英语、法语、西班牙语、德语、俄语、韩语有本地化提示；其他语言通过明确语言名称指定。所有提示另附面向中文模型的中文约束，要求 Thinking 从第一句开始使用目标语言；实际遵循程度取决于模型。

用户明确指定交互语言时优先。离线解析支持“使用法语进行思考和交流”“用日语回答”等中文表达，其他表达由模型遵循。“用法语写邮件，再用中文解释”只改变邮件语言。

## 安装与更新

本地开发需要 Node.js 26 和 npm：

```sh
npm ci
npm run check
```

在 OpenCode V2 配置的 `plugins` 数组中添加仓库绝对路径，保留已有插件项：

```json
{
  "plugins": ["/absolute/path/to/opencode-auto-language"]
}
```

重启 OpenCode 会话服务以加载插件。更新本地仓库后，重新执行 `npm ci`、`npm run check` 并重启；移除配置项并重启即可停用。

上传到自己的 Git 仓库后，也可使用以下方式安装和更新（替换 `OWNER`）：

```sh
opencode plugin add 'git+ssh://git@github.com/OWNER/opencode-auto-language.git'
opencode plugin update 'git+ssh://git@github.com/OWNER/opencode-auto-language.git'
```

私有仓库使用已有 Git 凭据。

## 开发与兼容

`npm test` 执行离线行为测试；`npm run check` 同时执行类型检查和测试。

OpenCode SDK 固定为 2.2.4。升级时需检查插件钩子、原生命令模板及压缩提示的追加顺序，再运行检查。压缩请求支持 Chat Completions / Anthropic 的 `messages` 和 Responses 的数组 `input`；其他格式明确报错。

`src/native-templates.json` 保留上游模板用于提取用户参数，来源和许可见 [NOTICE](NOTICE)。
