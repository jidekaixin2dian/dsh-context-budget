# dsh-context-budget

**Per-session context budget for DeepSeek Harness.** Hide MCP server, Skill, memory and schedule tool groups from the next prompt, see the approximate token cost, and restore them instantly — without editing `cordis.patch.yml` or restarting the MCP processes.

![Context budget](assets/context-budget.svg)

## Why

Every MCP tool is sent as a full JSON Schema on every request. A server with dozens of tools can quietly consume more context than the conversation itself. Configuration managers can add, remove or toggle servers, but the prompt is still paid on the next turn.

This plugin groups the effective tool set by MCP server and lets you hide a whole group in place:

- the next request uses the reduced schema set;
- the MCP process keeps running, so restoring needs no reconnect;
- global defaults live in Settings; `context_budget` can override or reset one session;
- the cost table shows full / current / saved tokens.

## Install

From GitHub (no build step; `lib/` is included):

```sh
dsh plugin --profile <your-profile> add github:jidekaixin2dian/dsh-context-budget
```

For the official desktop app, install through its plugin manager if it manages the profile for you. Restart DSH once after installing the host half, then hard-refresh the web UI.

## Use

Open **Settings → Context budget**:

- **All visible** — clear every override;
- **Hide all MCP** — one switch for every `mcp__<server>__*` group;
- **Hide largest group** — the group with the biggest schema cost;
- **Lean** — MCP + Skill + memory + schedule off;
- per-server MCP rows, Skill catalog, memory tools, schedule tools.

A read-only **Core tools** row is always kept.

Model tool:

```text
context_budget action=status
context_budget action=session disabled=["mcp:github", "skills"]
context_budget action=reset
```

`mcp` is a wildcard for all MCP servers; `mcp:<server>` targets one. The global setting applies to every session and subagent; `action=session` only overrides the current session.

## How it works

The host half applies `ctx.tools.restrict({ deny })` on the agent scope during `agent/pre-step`. The tool schemas are removed from prompt assembly before the request is sent. It listens to `tools/change`, `agent/created` and `agent/status` so dynamic MCP additions and subagents get the restriction too. It never writes `cordis.patch.yml`.

Token numbers are estimates from the serialized JSON schemas plus Skill catalog descriptions, not a provider tokenizer.

## Compatibility

- **Dynamic MCP managers** that register tools in the agent scope (for example lazy MCP loading) are respected: their tools are shown in the `scoped` count, but `ctx.tools.restrict` cannot hide scoped registrations. Use that manager's own unload.
- **MCP/Skills configuration managers** keep owning their files and credentials; this plugin does not write them. `tools/change` picks up their changes.
- **Skills managers** can still disable individual skills; this plugin's Skill group is an all-or-nothing context budget.
- **dsh-context** reads request headers; hiding tools here reduces its tool-schema row and the actual prompt together.

## Limits

- MCP processes stay alive; this saves prompt tokens, not RAM.
- Skill control is group-level; individual skill toggles belong to a skills manager.
- Tool descriptions/schemas must be known before a restriction can be computed; a first request may calibrate the full baseline.
- Host-half updates need a DSH restart; client-half updates need a hard refresh.

## Development

```sh
npm test
```

Pure grouping rules are in `lib/groups.js`; the host and browser halves are hand-written ESM/CJS to keep the package dependency-free.

MIT.
