# Changelog

## 0.1.1 — unreleased

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

See [root-cause evidence](docs/root-cause-fixes.md). Source is newer than the
published v0.1.0 archive; no existing release asset is replaced by these changes.

## 0.1.0

Initial Toolgate release after the Context Budget rename. Historical archive;
does not include the authentication, configuration integrity or lifecycle fixes.
