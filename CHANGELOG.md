# Changelog

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
