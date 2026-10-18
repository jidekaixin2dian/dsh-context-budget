# Context Budget

**Manage MCP servers and skills in DeepSeek Harness, and control the tool-schema cost of the next prompt.**

[![release](https://img.shields.io/github/v/release/jidekaixin2dian/dsh-context-budget?label=release&color=c8f663)](https://github.com/jidekaixin2dian/dsh-context-budget/releases)
[![license](https://img.shields.io/github/license/jidekaixin2dian/dsh-context-budget?label=license&color=c8f663)](https://github.com/jidekaixin2dian/dsh-context-budget/blob/main/LICENSE)

[中文](README.md)

![Context budget](assets/readme-budget.svg)

> Same MCP servers, only the schemas this turn needs. The counts are one example; actual numbers depend on the installed servers and skills.

## What it solves

Every MCP tool carries a full JSON Schema on every request. A server with dozens of tools can consume more context than the conversation itself.

Configuration managers can add or remove servers, but the next prompt still pays for every schema. This plugin separates two jobs:

- **Configuration:** add, edit, remove, enable or disable MCP servers; create, delete or toggle skills.
- **Exposure:** group tools by MCP server or skill, remove a whole group from the current session's prompt, and restore it at any time.

## Three surfaces

| Page | What you can do | When it applies |
| --- | --- | --- |
| Context budget | See full, current and saved token estimates; hide or restore MCP, skill, memory and schedule groups | Next request |
| MCP servers | Add, edit, remove, enable or disable; stdio command/args/env or streamable-http url/headers | DSH HMR |
| Skills | Search, create, delete, toggle one skill | rank-0 override provider |

Core tools stay visible and have no hide switch.

## Install

Install from GitHub. `lib/` is included, so no build step is needed:

```sh
dsh plugin --profile <profile> add github:jidekaixin2dian/dsh-context-budget
```

On the desktop app, install through its plugin manager when that manager owns the profile. After installing or updating the host half, **quit and reopen DSH**. The desktop app has no browser-style `Ctrl+R` hard refresh; a client bundle change needs an app restart.

## Use

Open **Settings -> Context Budget**. There are three tabs.

### Context budget

- **All visible:** clear every override.
- **Hide all MCP:** hide every `mcp__<server>__*` group.
- **Hide largest group:** pick the group with the biggest estimated cost.
- **Lean:** turn off MCP, skill, memory and schedule groups.
- One row per MCP server, plus skill catalog, memory tools and schedule tools.

### MCP servers

- Rows show serverName, transport, target, enabled state and write location.
- Add or edit into the profile or global `cordis.patch.yml`.
- stdio uses command/args/env; streamable-http uses url/headers.
- HMR applies the change; no restart is needed for the MCP row itself.

### Skills

- Search, inspect descriptions, toggle one skill.
- Create into user `~/.dsh/skills` or project `.dsh/skills`.
- Delete moves the skill to `.trash` instead of hard-deleting it.
- Disable uses a rank-0 override provider and does not rewrite the skill file.

Model tool:

```text
context_budget action=status
context_budget action=session disabled=["mcp:github", "skills"]
context_budget action=reset
```

`mcp` is the wildcard for all MCP servers; `mcp:<server>` targets one. The settings page applies globally to sessions and subagents; `action=session` overrides only the current session.

## How it works

The budget half calls `ctx.tools.restrict({ deny })` on the agent scope during `agent/pre-step`, so tool schemas leave prompt assembly before the request is sent. It listens to `tools/change`, `agent/created` and `agent/status`, so dynamic MCP additions and subagents are covered too.

The MCP half edits the profile or global `cordis.patch.yml` line by line and leaves unrelated rows and comments intact. DSH HMR applies the change. The skill half registers a rank-0 override provider and sets `modelInvocable:false` for disabled names.

Token numbers are estimates from serialized JSON schemas plus skill descriptions, not a provider tokenizer.

## Compatibility and limits

- A dynamic MCP manager that registers tools in the agent scope is respected: the settings page reports a `scoped` count, but `ctx.tools.restrict` cannot hide those registrations. Use that manager's unload.
- Other MCP or skill managers keep their own rows and files. This plugin edits only `@deepseek-ai/dsh-mcp-client` rows and its own override.
- **dsh-context** reads request headers; hiding tools here reduces both its tool-schema row and the actual prompt.
- With the budget alone, MCP processes stay alive. This saves prompt tokens, not RAM.
- MCP CRUD writes `cordis.patch.yml`. Review the diff if you hand-edited the file.
- Skill toggles use the global registry; a skill found only in a scoped provider may not be hideable.
- ZIP or folder import of skills is not implemented; create and delete are supported.
- A first request may calibrate the full baseline before restrictions can be computed.
- Host and client half updates both need an app restart.

## Development

```sh
npm test
```

Nine unit tests cover grouping rules, MCP row editing and skill file operations.

- `lib/groups.js`: tool grouping rules.
- `lib/mcp-config.js`: MCP row editing.
- `lib/skills-config.js`: skill file create and delete.
- `lib/index.js` and `lib/client.js`: host and settings page.

## Links

- [GitHub repository](https://github.com/jidekaixin2dian/dsh-context-budget)
- [Releases](https://github.com/jidekaixin2dian/dsh-context-budget/releases)
- [中文 README](README.md)

MIT
