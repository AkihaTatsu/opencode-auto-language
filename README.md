# OpenCode Auto Language

让 OpenCode 的 Thinking、计划、摘要与回答跟随用户语言。语言种类由 ELD 离线识别决定。

## 功能

- 识别用户任务文本的语言，排除代码、引用和原生命令模板；短确认沿用会话语言，支持重启后恢复。
- 向系统提示词末尾和模型收到的用户消息副本追加语言要求，保留保存的用户原文、工具定义、权限及固定输出格式。
- 覆盖原生 `plan` / `build`、工具续接、中断恢复、最大步数总结，以及 `/init`、`/review`、`/schedule`、`/goal`、会话压缩、标题、原生 summary 和目标评审。

第三方角色及原生 `general` / `explore` 不注入语言指令。首次输入无法识别且没有历史语言时，不指定默认语言。

中文、日语、阿拉伯语、英语、法语、西班牙语、德语、俄语、韩语有本地化提示；其他语言通过明确语言名称指定。所有提示另附面向中文模型的中文约束，要求 Thinking 从第一句开始使用目标语言；实际遵循程度取决于模型。

用户明确指定交互语言时优先。离线解析支持“使用法语进行思考和交流”、“用日语回答”等中文表达，其他表达由模型本身遵循；而类似“用法语写邮件，再用中文解释”的提示词则只改变输出文件（邮件）语言。

## 安装与更新

安装：

```sh
opencode plugin add github:AkihaTatsu/opencode-auto-language
```

更新：

```sh
opencode plugin update github:AkihaTatsu/opencode-auto-language
```

安装或更新后重启 OpenCode。
