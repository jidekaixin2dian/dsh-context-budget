# dsh-context-budget

**在 DeepSeek Harness 里管理 MCP 服务器、Skill，并把工具组从下一轮 prompt 中隐藏，附 token 成本估算。** 预算调整不改配置、不重启、不停止 MCP；MCP 服务器的增删改写回正常 patch 文件，通过 HMR 生效。

![上下文预算](assets/context-budget.svg)

## 为什么

每个 MCP 工具都会以完整 JSON Schema 进入每次请求。工具多的服务器会悄悄吃掉大量上下文，甚至超过对话本身。配置管理器能增删/开关服务器，但下一轮 prompt 仍然要付这份成本。

这个插件把三件事放在一页：

- **MCP 服务器**：列表、新增、编辑、删除、启用/停用；写 profile/global 的 `cordis.patch.yml`，HMR 生效。
- **Skills**：搜索目录，新建/删除（移到 .trash），按单个 Skill 启用/停用（rank-0 override provider）。
- **Prompt 预算**：按 MCP 服务器分组，整组隐藏/恢复，显示完整/当前/已节省 token 估算；MCP 进程继续存活。

## 安装

从 GitHub 安装（包含 `lib/`，无需构建）：

```sh
dsh plugin --profile <你的 profile> add github:jidekaixin2dian/dsh-context-budget
```

官方桌面端如果由应用自己的插件管理器管理 profile，请在应用内安装。装完 host 半后重启一次 DSH，再硬刷新 Web UI。

## 使用

打开 **设置 → 上下文预算**，三个 tab：

### 上下文预算

- **全部显示**：清除所有隐藏；
- **关闭全部 MCP**：一次隐藏所有 `mcp__<server>__*` 分组；
- **关闭最大组**：按估算 token 选当前最大的一组；
- **精简模式**：MCP + Skill + 记忆 + 定时任务全部关闭；
- 每个 MCP 服务器一行，另有 Skill 目录、记忆工具、定时任务；核心工具只读保留。

### MCP 服务器

- 列表显示 serverName、transport、目标、启用状态、写入位置；
- 新增/编辑支持 stdio 的 command/args/env，或 streamable-http 的 url/headers；
- 启用/停用写 override 行；删除只删除 `@deepseek-ai/dsh-mcp-client` 行；
- 保存后由 DSH HMR 应用，不需要重启。

### Skills

- 搜索、查看描述、单 Skill 启用/停用；
- 新建 Skill 可写用户 `~/.dsh/skills` 或项目 `.dsh/skills`；删除会移到 `.trash`；
- 停用通过 rank-0 override provider，不改 Skill 文件。

模型工具：

```text
context_budget action=status
context_budget action=session disabled=["mcp:github", "skills"]
context_budget action=reset
```

`mcp` 是全部 MCP 的通配；`mcp:<server>` 只针对一台服务器。设置页的全局预算作用于所有会话和子代理；`action=session` 只覆盖当前会话。

## 原理

预算部分在 `agent/pre-step` 里对 agent 作用域调用 `ctx.tools.restrict({ deny })`，工具 schema 在 prompt 组装前被移除；监听 `tools/change`、`agent/created`、`agent/status`，动态 MCP 工具和子代理也会被覆盖。

MCP 部分按行编辑 profile/global 的 `cordis.patch.yml`，保留无关行和注释；Skill 部分注册 rank-0 override provider，把停用项的 `modelInvocable` 设为 false。

token 数按序列化 JSON schema 加 Skill 描述估算，不是模型分词器的精确值。

## 兼容性

- **动态 MCP 管理器**（例如 lazy MCP）把工具注册在 agent 作用域：设置页会显示 `scoped` 数量，但 `ctx.tools.restrict` 无法隐藏 scoped 注册；请用对应管理器的 unload。
- **其他 MCP/Skills 管理器**继续负责它们自己的行和文件；本插件只编辑 `@deepseek-ai/dsh-mcp-client` 行和自己的 override，`tools/change` 会捕获它们的变化。
- **dsh-context** 读取请求头；本插件隐藏后，它的工具 schema 行和实际 prompt 会一起下降。

## 限制

- 只用预算时 MCP 进程仍然存活；省的是 prompt token，不是内存。
- MCP CRUD 会写 `cordis.patch.yml`；如果手工改过该文件，保存前先看 diff。
- Skill 停用走全局注册表；只在 scoped provider 出现的 Skill 可能无法隐藏。
- 本页支持新建/删除 Skill 文件（用户或项目目录，删除移到 `.trash`）；ZIP/文件夹导入暂未实现。
- 需要先知道工具 schema 才能计算限制；首个请求会校准完整基线。
- host 半更新需要重启 DSH；client 半硬刷新即可。

## 开发

```sh
npm test
```

分组规则在 `lib/groups.js`，MCP 行编辑在 `lib/mcp-config.js`，Skill 文件操作在 `lib/skills-config.js`；host/client 手写 ESM/CJS，保持零额外依赖。

MIT。
