# OpenCode Auto Language

让 OpenCode 的 Thinking、计划、摘要与回答跟随用户语言。语言识别在本地完成，不调用 LLM。

针对 OpenCode **2.2.4** 开发，使用 V2 插件接口。实测模型为 `deepseek/deepseek-flash#max`。验证结果见 [TEST-RESULTS.md](TEST-RESULTS.md)。

## 工作方式

1. 使用 ELD 离线识别用户任务文本，排除代码块、引用和原生命令模板。支持检测 60 种语言。
2. 把检测结果记录在消息元数据中。短确认或无法可靠识别的输入沿用会话语言；会话语言通过插件存储跨重启保留。
3. 向系统提示词末尾和模型实际收到的最后一条用户消息副本追加语言要求，不修改用户保存的文本。压缩请求在原生摘要模板追加后补充语言要求。

中文、日语、阿拉伯语、英语、法语、西班牙语、德语、俄语、韩语有对应语言的提示模板；其他语言通过明确的语言名称指定。针对 DeepSeek 的实测结果，所有模板另附中文语言约束，明确指定目标语言，要求推理从第一句开始遵循。

用户明确指定交互语言时优先。当前离线解析支持中文形式，例如“使用法语进行思考和交流”“用日语回答”；其他自然表达交由模型遵循提示中的优先级规则。“用法语写邮件，再用中文解释”只改变邮件语言。

## 覆盖范围

- 原生 `plan` / `build`：普通请求、工具续接、中断恢复、最大步数后的总结。
- `/init`、`/review`、`/schedule`、`/goal`：提取用户参数，避免把英文模板误判为用户语言。
- 会话压缩和压缩后续接、标题、原生 summary 请求、目标评审。

保持原有系统规则、工具定义、Plan 权限、JSON 字段和固定摘要标题。第三方角色及原生 `general` / `explore` 不注入语言指令。不会翻译工具或 skill 文本。

首次输入只有“继续”或不带参数的命令，且没有历史语言时，不注入猜测的默认语言。

## 本地使用

开发与测试需要 Node.js 26 及 npm；依赖由 `package-lock.json` 锁定。

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

重新启动 OpenCode 会话服务使插件加载。移除该项并重启即可停用。

## 独立仓库与更新

本项目可作为独立的公开或私有 Git 仓库维护。本地路径安装时，更新仓库后执行 `npm ci`、`npm run check`，再重启 OpenCode。

上传到自己的远程仓库后，可使用 OpenCode 的 Git 包安装方式。以下地址需替换为自己的仓库：

```sh
opencode plugin add 'git+ssh://git@github.com/OWNER/opencode-auto-language.git'
opencode plugin check
opencode plugin update 'git+ssh://git@github.com/OWNER/opencode-auto-language.git'
```

私有仓库使用现有 Git SSH 密钥或 HTTPS 凭据，不需要在插件源码中保存令牌。插件更新和 OpenCode 更新是两件事；升级 OpenCode 前按 [COMPATIBILITY.md](COMPATIBILITY.md) 检查接口与模板。

## 验证

```sh
npm run check
# 以下命令会调用 DeepSeek，产生正常 API 用量
npm run test:live -- --smoke
npm run test:live
npm run test:live -- --extended
```

实测脚本优先读取 `DEEPSEEK_API_KEY`，否则只读本机 OpenCode 数据库中的 DeepSeek 凭据。每个测试使用临时 XDG 目录和独立服务；退出时清理临时配置、数据库、缓存与进程。标准输出含模型测试文本；如重定向到文件，测试后自行删除该输出文件。

语言检测支持不等于所有模型都会遵循语言指令。具体通过率及失败后的调整记录以测试报告为准。
