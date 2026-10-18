# Context Budget

Manage MCP servers and skills in DeepSeek Harness, and control the tool cost of the next prompt.

[中文](README.md)

Every MCP tool carries a full JSON Schema into the request. A server with dozens of tools can take up more context than the conversation itself.

![Tool schema count](assets/readme-schema-v2.svg)

The plugin separates configuration from exposure. Configuration owns servers and skills; exposure decides which schemas this turn carries.

## Install

```sh
dsh plugin --profile <profile> add github:jidekaixin2dian/dsh-context-budget
```

On the desktop app, install through its plugin manager when that manager owns the profile. After installing or updating the host half, quit and reopen DSH. The desktop app has no browser-style `Ctrl+R` hard refresh.

## Use

Open **Settings -> Context Budget**.

**Context budget** groups tools by MCP server, hides the groups this turn does not need, and restores them later. MCP processes keep running. All visible, hide all MCP, hide largest group and lean mode live here.

**MCP servers** add, edit, remove, enable or disable. The change writes the profile or global `cordis.patch.yml` and applies through HMR. stdio uses command/args/env; streamable-http uses url/headers.

**Skills** search, create, delete, toggle one skill. New skills can go to the user or project directory; deleted skills move to `.trash`.

Model tool:

```text
context_budget action=status
context_budget action=session disabled=["mcp:github", "skills"]
context_budget action=reset
```

`mcp` is the wildcard for all MCP servers; `mcp:<server>` targets one. The settings page applies globally to sessions and subagents; `action=session` overrides only the current session.

## How it works

The budget half calls `ctx.tools.restrict({ deny })` during `agent/pre-step`, so tool schemas leave prompt assembly before the request is sent. The MCP half edits `cordis.patch.yml` line by line and leaves unrelated rows and comments intact; HMR applies it. The skill half registers a rank-0 override provider and sets `modelInvocable:false` for disabled names.

Token numbers are estimates from serialized schemas and skill descriptions, not a provider tokenizer.

## Boundaries

- A dynamic MCP manager that registers tools in the agent scope cannot be hidden by `ctx.tools.restrict`; use that manager's unload.
- MCP CRUD writes `cordis.patch.yml`. Review the diff if you hand-edited the file.
- ZIP or folder import of skills is not implemented. A skill found only in a scoped provider may not be hideable.
- Host and client half updates both need an app restart.

## Development

```sh
npm test
```

Nine unit tests cover grouping rules, MCP row editing and skill file operations.

[GitHub](https://github.com/jidekaixin2dian/dsh-context-budget) · [Releases](https://github.com/jidekaixin2dian/dsh-context-budget/releases) · MIT
