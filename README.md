# 工具闸门

**0.1.2** 对齐 Release 标签与安装包，完整包含启动冲突修复、管理接口认证、YAML 精确编辑和生命周期修复。见[变更记录](CHANGELOG.md)与[安全说明](SECURITY.md)。

管理 MCP 服务器与 Skill，决定下一轮 prompt 带哪些工具。

[English](README.en.md)

每个 MCP 工具都会带完整 JSON Schema 进入请求。服务器一多，schema 会比对话更占地方。

![工具 schema 数量示意](assets/readme-schema-v2.svg)

这个插件把配置和暴露分开。配置负责服务器和 Skill，暴露负责这一轮到底带哪些 schema。

## 安装

```sh
dsh plugin --profile <profile> add https://github.com/jidekaixin2dian/dsh-toolgate/releases/latest/download/dsh-toolgate.tgz
```

桌面端由应用管理 profile 时，请在插件管理器里安装。安装或更新 host 半后，退出并重新打开 DSH；桌面端没有浏览器式 `Ctrl+R` 硬刷新。

需要 Node >=24。管理接口要求宿主提供 `connection.requestRejection()` 和当前 `profileContext`；本仓库的宿主回归固定到 DSH **0.2.1-rc.2**。缺少认证能力时接口拒绝访问，缺少当前 profile 时不猜测其他安装目录。

## 使用

打开 **设置 -> 工具闸门**。

**预算** 按 MCP 服务器分组，隐藏这一轮不需要的整组 schema，随时恢复。MCP 进程继续运行。全部显示、关闭全部 MCP、关闭最大组、精简模式都在这一页。

**MCP 服务器** 新增、编辑、删除、启停，写当前 profile 或 global 的 `cordis.patch.yml`，HMR 生效。stdio 用 command/args/env，streamable-http 用 url/headers。编辑保留同块兄弟配置、未知字段和注释；写前备份到 `DSH_HOME/backups/toolgate/`。env/headers 不回传明文，编辑时默认保留；勾选“替换”后才写入新值，勾选后留空表示清空。

有效配置遵循宿主顺序：bundle → profile → global → 启动 overlays。启停更新最后的可写覆盖层；编辑保留定义所在层，不隐式搬移。有动态 YAML、重复 id、config 覆盖或只读来源时，会明确拒绝不能安全完成的操作。

**Skills** 先选工作区对应的会话，再搜索、新建、删除或启停。项目根目录按宿主规则选择最近的 `.git`，没有 Git 时使用所选会话目录；用户目录取当前 `DSH_HOME`。列表保留 provider/source/path，只有匹配所选根目录的真实 `.dsh/skills/<name>/SKILL.md` 目录可删除，删除移到 `.trash`。`.agents`、bundled、custom 和虚拟来源只读；独立作用域无法被覆盖时禁用启停按钮。

模型工具：

```text
toolgate action=status
toolgate action=session disabled=["mcp:github", "skills"]
toolgate action=reset
```

`mcp` 是全部 MCP 的通配，`mcp:<server>` 只针对一台服务器。设置页的全局预算作用于所有会话和子代理，`action=session` 只覆盖当前会话。

## 原理

预算部分在 `agent/pre-step` 里调用 `ctx.tools.restrict({ deny })`，工具 schema 在 prompt 组装前被移除。每次插件加载使用独立状态，卸载释放已安装的限制，Agent 销毁清理其覆盖。MCP 部分解析 YAML 节点，只重写受影响的补丁块，并使用宿主合成函数计算结果。Skill 部分用 rank-0 override provider 按来源身份和项目根目录保存停用规则。

token 数按序列化 schema 和 Skill 描述的字符数估算，不是模型分词器的精确值，也不是费用或延迟测量。已知无法隐藏的 scoped 工具不计入预计节省。

## 边界

- 动态 MCP 管理器把工具注册在 agent 作用域时，`ctx.tools.restrict` 隐藏不了，请用对应管理器的 unload。
- MCP CRUD 会写 `cordis.patch.yml`；手工改过该文件时，保存前先看 diff。
- Skill 的 ZIP 或文件夹导入暂未实现；只在 scoped provider 出现的 Skill 可能无法隐藏。
- host 半和 client 半更新都需要重开 DSH。
- 工具隐藏是上下文预算控制，不是权限沙箱；会话覆盖可恢复工具，MCP 进程继续运行。
- 备份包含原始配置及其中的秘密值，请勿放到公共 Issue。安全边界见 [SECURITY.md](SECURITY.md)。

## 开发

```sh
npm ci --ignore-scripts --legacy-peer-deps
npm test
npm run setup:host
npm run test:host
npm run pack:check
```

需要 Git 与 pnpm（锁定宿主使用 11.28.5）。宿主源码和临时 DSH_HOME 均位于 `work/`，不使用正式 profile 或 API Key。`TOOLGATE_HOST` 可指向同一固定 commit 的已有干净 checkout。

单元回归覆盖 YAML 精确编辑、复杂参数、真实补丁顺序、写入失败回滚、来源和路径检查。宿主套件使用真实 Cordis/tools/skills、HTTP 服务器和 Cookie 认证；设置 `TOOLGATE_BROWSER=1` 时还运行真实 React 设置页的浏览器操作（Windows 使用 Edge，Linux 先运行 `npx --no-install playwright install --with-deps chromium`）。CI 在 Windows/Linux 都执行单元、宿主、浏览器和安装包检查。这些设置页测试不是完整 Desktop 外壳或真实模型验收。

[GitHub](https://github.com/jidekaixin2dian/dsh-toolgate) · [Releases](https://github.com/jidekaixin2dian/dsh-toolgate/releases) · MIT


## 发布校验

发布时自动核对标签版本、包内文件与标签源码，并校验 GitHub 下载摘要。手动复核使用 Actions 中的 **Release integrity**，填入已发布标签；历史标签与附件保持原样。
