# dsh-context-budget

**DeepSeek Harness 的会话级上下文预算器。** 按 MCP 服务器、Skill、记忆和定时任务分组，在下一轮 prompt 里即时隐藏/恢复整组工具 schema，并显示估算 token 成本。不改 `cordis.patch.yml`，不重启，不停止 MCP 进程。

![上下文预算](assets/context-budget.svg)

## 为什么

每个 MCP 工具都会以完整 JSON Schema 进入每次请求。工具多的服务器会悄悄吃掉大量上下文，甚至超过对话本身。配置管理器能增删/开关服务器，但下一轮 prompt 仍然要付这份成本。

这个插件把当前工具集按 MCP 服务器分组，直接隐藏整组：

- 下一次请求立刻使用缩减后的 schema；
- MCP 进程仍然存活，恢复时无需重连；
- 设置页保存全局默认，`context_budget` 可对单个会话覆盖/恢复；
- 显示完整 / 当前 / 已节省的 token 估算。

## 安装

从 GitHub 安装（包含 `lib/`，无需构建）：

```sh
dsh plugin --profile <你的 profile> add github:jidekaixin2dian/dsh-context-budget
```

官方桌面端如果由应用自己的插件管理器管理 profile，请在应用内安装。装完 host 半后重启一次 DSH，再硬刷新 Web UI。

## 使用

打开 **设置 → 上下文预算**：

- **全部显示**：清除所有隐藏；
- **关闭全部 MCP**：一次隐藏所有 `mcp__<server>__*` 分组；
- **关闭最大组**：按估算 token 选当前最大的一组；
- **精简模式**：MCP + Skill + 记忆 + 定时任务全部关闭；
- 每个 MCP 服务器一行，另有 Skill 目录、记忆工具、定时任务。

核心工具只读保留。

模型工具：

```text
context_budget action=status
context_budget action=session disabled=["mcp:github", "skills"]
context_budget action=reset
```

`mcp` 是全部 MCP 的通配；`mcp:<server>` 只针对一台服务器。设置页的全局配置作用于所有会话和子代理；`action=session` 只覆盖当前会话。

## 原理

host 半在 `agent/pre-step` 里对 agent 作用域调用 `ctx.tools.restrict({ deny })`，工具 schema 在 prompt 组装前被移除。它监听 `tools/change`、`agent/created`、`agent/status`，动态 MCP 工具和子代理也会被覆盖。它不写 `cordis.patch.yml`。

token 数按序列化 JSON schema 加 Skill 描述估算，不是模型分词器的精确值。

## 兼容性

- **动态 MCP 管理器**（例如 lazy MCP）把工具注册在 agent 作用域：设置页会显示 `scoped` 数量，但 `ctx.tools.restrict` 无法隐藏 scoped 注册；请用对应管理器的 unload。
- **MCP/Skills 配置管理器**继续负责它们的文件与凭据；本插件不写这些文件，`tools/change` 会捕获它们的变化。
- **Skills 管理器**仍可单 Skill 启停；本插件的 Skill 组是整组预算。
- **dsh-context** 读取请求头；本插件隐藏后，它的工具 schema 行和实际 prompt 会一起下降。

## 限制

- MCP 进程仍然存活；省的是 prompt token，不是内存。
- Skill 是整组开关，单 Skill 开关属于 skills manager。
- 需要先知道工具 schema 才能计算限制；首个请求会校准完整基线。
- host 半更新需要重启 DSH；client 半硬刷新即可。

## 开发

```sh
npm test
```

分组规则在 `lib/groups.js`；host/client 手写 ESM/CJS，保持零额外依赖。

MIT。
