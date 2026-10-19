# 工具闸门

管理 MCP 服务器与 Skill，决定下一轮 prompt 带哪些工具。

[English](README.en.md)

每个 MCP 工具都会带完整 JSON Schema 进入请求。服务器一多，schema 会比对话更占地方。

![工具 schema 数量示意](assets/readme-schema-v2.svg)

这个插件把配置和暴露分开。配置负责服务器和 Skill，暴露负责这一轮到底带哪些 schema。

## 安装

```sh
dsh plugin --profile <profile> add github:jidekaixin2dian/dsh-toolgate
```

桌面端由应用管理 profile 时，请在插件管理器里安装。安装或更新 host 半后，退出并重新打开 DSH；桌面端没有浏览器式 `Ctrl+R` 硬刷新。

## 使用

打开 **设置 -> 工具闸门**。

**预算** 按 MCP 服务器分组，隐藏这一轮不需要的整组 schema，随时恢复。MCP 进程继续运行。全部显示、关闭全部 MCP、关闭最大组、精简模式都在这一页。

**MCP 服务器** 新增、编辑、删除、启停，写 profile 或 global 的 `cordis.patch.yml`，HMR 生效。stdio 用 command/args/env，streamable-http 用 url/headers。

**Skills** 搜索、新建、删除、单 Skill 启停。新建可写用户或项目目录，删除移到 `.trash`。

模型工具：

```text
toolgate action=status
toolgate action=session disabled=["mcp:github", "skills"]
toolgate action=reset
```

`mcp` 是全部 MCP 的通配，`mcp:<server>` 只针对一台服务器。设置页的全局预算作用于所有会话和子代理，`action=session` 只覆盖当前会话。

## 原理

预算部分在 `agent/pre-step` 里调用 `ctx.tools.restrict({ deny })`，工具 schema 在 prompt 组装前被移除。MCP 部分按行编辑 `cordis.patch.yml`，保留无关行和注释，由 HMR 应用。Skill 部分用 rank-0 override provider 把停用项设为 `modelInvocable:false`。

token 数按序列化 schema 和 Skill 描述估算，不是模型分词器的精确值。

## 边界

- 动态 MCP 管理器把工具注册在 agent 作用域时，`ctx.tools.restrict` 隐藏不了，请用对应管理器的 unload。
- MCP CRUD 会写 `cordis.patch.yml`；手工改过该文件时，保存前先看 diff。
- Skill 的 ZIP 或文件夹导入暂未实现；只在 scoped provider 出现的 Skill 可能无法隐藏。
- host 半和 client 半更新都需要重开 DSH。

## 开发

```sh
npm test
```

17 个单元测试覆盖分组规则、MCP 行编辑、HTTP 契约和 Skill 文件操作。

[GitHub](https://github.com/jidekaixin2dian/dsh-toolgate) · [Releases](https://github.com/jidekaixin2dian/dsh-toolgate/releases) · MIT

