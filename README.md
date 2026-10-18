# dsh-context-budget

Live per-session MCP/Skill context budget for DeepSeek Harness.

Unlike configuration editors, this plugin never rewrites `cordis.patch.yml`.
It uses `ctx.tools.restrict()` on the agent scope, so heavy tool schemas
(REA, MCP, Skill, memory, schedules) leave the very next request's prompt and
can be restored instantly. The MCP processes stay alive; only their schemas
are hidden.

- Settings → Context budget: cost table and group toggles for every session.
- Model tool `context_budget`: inspect / override / reset the current session.
- Approximate token cost is derived from the exact serialized tool schemas
  and skill catalog descriptions.
