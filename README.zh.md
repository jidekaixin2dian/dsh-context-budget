# dsh-context-budget

DeepSeek Harness 的**会话级上下文预算器**。重点不是再做一个 MCP 配置编辑器，而是即时、可逆地控制“这一轮模型到底要背多少工具 schema”。

## 解决什么

DSH 的 MCP 工具（尤其 REA 的 207 个）在每个请求里都会把完整 JSON Schema 送进上下文。配置管理器可以改服务器，但通常要改 `cordis.patch.yml`、重载或重启；而上下文已经付过了。

本插件用 `ctx.tools.restrict()` 在 **agent 作用域**里隐藏工具，因此：

- 改完下一次请求即生效；
- 不修改 `cordis.patch.yml`，不重启 DSH；
- 不停止 MCP 进程，恢复时不需要重连；
- 可按全局默认，也可用模型工具对单个会话覆盖；
- 同时管理 MCP、REA、Skill 目录、记忆工具、定时任务。

## 使用

安装后重启一次 DSH（host 半），浏览器硬刷新（client 半），打开 **设置 → 上下文预算**：

- 顶部显示完整 / 当前 / 已节省的 token 估算；
- 预设：全部显示、只关 REA、MCP 全关、精简模式；
- 分组开关：REA、其他 MCP、Skill 目录、记忆工具、定时任务；
- 核心工具只读保留。

模型工具 `context_budget`：

```text
status                          # 查看当前会话预算
session disabled=["rea"]        # 只覆盖本会话
reset                           # 恢复全局默认
```

## 与现有插件的差异

- `@guowenzhang/dsh-mcp-manager` 重在动态加载、连接池和工具检索；
- `@xxxyz/dsh-mcp-manager` 重在 MCP/Skills 配置 CRUD 和设置页；
- 本插件重在**上下文预算**：一次点击即时隐藏、成本可见、可撤销，不碰配置文件。三者可以共存，不互相替代。

## 限制

- MCP 进程仍然存活，只是 schema 不进入 prompt；内存占用不会因此下降。
- token 数是按 schema JSON / Skill 描述估算，实际以模型分词器为准。
- Skill 组目前是整组开关（隐藏 `skill` 工具和目录）；单 Skill 开关留待后续。
- 子代理/Workflow 在 `agent/created`、`agent/status`、`agent/pre-step` 三处兜底应用；重启后建议用一个 workflow 子会话复验。
- 安装/升级 host 半需要重启 DSH 一次；client 半硬刷新即可。

## 社区插件适配

- **@guowenzhang/dsh-mcp-manager（动态加载 / lazy-mcp）**：监听 `tools/change`，动态工具增删后重建基线并在下一步重新应用；它把按需工具注册在 agent 作用域，`ctx.tools.restrict` 无法隐藏这类 scoped 工具，设置页会显示 `scoped` 数量并提示改用该插件的 `mcp_unload`。
- **@xxxyz/dsh-mcp-manager**：它写 `cordis.patch.yml` / Skills override，本插件不写配置；两者不会互相覆盖，服务器开关触发的工具变化由 `tools/change` 捕获。
- **@michengai/dsh-skills-manager**：它的 rank-0 override 仍负责单 Skill 启停；本插件隐藏 `skill` 工具/目录时是整组预算控制，不修改它的状态。
- **dsh-context**：本插件只减少实际工具 schema，`dsh-context` 的请求头统计会同步下降；两者不抢同一 slot。
- **dsh-better-sidebar**：只注册 `settings.section`（order 18），不注册侧栏 tab，不与它的 side chat/文件树竞争。

## 验证记录（2026-10-19）

- 安装到 `desktop` profile，bundle 已注册；profile 文件已备份
  （`package.json.bak-20261019-001158-context-budget`、
  `cordis.patch.yml.bak-20261019-001158-context-budget`）。
- `POST /dsh-context-budget/api` `status` 返回 200，能读出 207 个 REA 工具、
  22 个 Skill、17 个记忆工具。
- 主会话验证：设置 `disabled=["rea"]` 后，下一次真实请求的 DSH 工具数
  **266 → 60，REA = 0**；网关日志同步显示 `tools: 261 -> 54 (no-rea)`。
- 子代理/Workflow 的兜底补丁（`agent/created`、`agent/status`、`agent/pre-step`）
  已写入，但运行中的桌面实例仍加载旧 host 代码，**需要在重启后用一个
  workflow 子会话复验**；当前不把它写成已通过。
- 设置页的 client 半尚未在重启后做浏览器截图验证。

