# Changelog

## Unreleased

- Re-pin the host regression suite to DSH 0.2.1-rc.3 (`1f81c047`): rc.2 → rc.3
  changed no source in the packages this plugin uses, and the authenticated host
  suite passes unchanged (11 passed / 1 browser-gated skip). Shipped plugin
  code and the peer range (`>=0.2.1-rc.1 <0.3.0-0`) are unchanged.

## 0.1.3 — 2026-10-24

- Add an append-only audit log at `DSH_HOME/toolgate-audit.jsonl`: one JSON line
  per management write (op, target id, outcome, timestamp), never containing
  env/header values. It rotates past 1 MiB to `.1` and a failed append never
  blocks the operation it records.
- Tighten the management API: `mcp-add` and `mcp-edit` now accept only the
  documented `{ row }` payload; flattened probe bodies are rejected with the
  normal validation error instead of being silently interpreted.
- Add the `allowSessionOverride` plugin config (default `true`). Set it to `false`
  to make the `toolgate` model tool read-only: `action=session` and `action=reset`
  return a notice without changing tool visibility, so prompt-injected turns
  cannot hide tool groups; the authenticated settings page still owns the gate.
- Cap configuration backups at the 20 most recent copies under
  `DSH_HOME/backups/toolgate/`; pruning runs after a successful write only, so
  failed writes keep their recovery copy. Backup directories are matched by the
  exact `timestamp-uuid` naming pattern and foreign entries are never removed.

## 0.1.2 — 2026-10-23

- Align the release tag and archive, including the scoped client bundle. The
  0.1.1 archive had the fix, but its tag source did not; neither is overwritten.
- Verify published package versions and all archive files against tagged source,
  allowing only Git checkout line endings, and check the GitHub asset digest.
- Correct stale installation/version documentation and remove the stale UI
  version label.

## 0.1.1 — 2026-10-23

- Authenticate management requests using the running host Connection service;
  reject missing auth support and omit secret values from management responses.
- Edit YAML nodes precisely, retain sibling configuration and complex arguments,
  compose profile/global/overlay layers using the host, and back up atomic writes.
- Resolve the current DSH home/profile and selected workspace from host services.
  Keep Skill provider/path identities, scoped restrictions and recoverable trash.
- Own state per plugin instance, release restrictions on unload and clear disposed
  Agent overrides. Roll back Skill toggles if settings cannot be persisted; use
  unique private temporary files and clean failed writes.
- Add Windows/Linux unit, authenticated host/browser and archive-install CI.

See [root-cause evidence](docs/root-cause-fixes.md). Release 0.1.0 lacks these fixes. Its historical assets remain unchanged.

## 0.1.0

Initial Toolgate release after the Context Budget rename. Historical archive;
does not include the authentication, configuration integrity or lifecycle fixes.
