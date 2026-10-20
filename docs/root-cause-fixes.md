# Configuration and lifecycle fixes

Recorded 2026-10-20 (UTC+8). Runtime verification pins official DSH 0.2.1-rc.2, commit `687f282e8625c6b8d11ff58211a90524be2e4317`. All profiles, credentials and Skill bodies in tests are disposable/synthetic. There is no production-profile migration or new release in this change.

| Audit item | Cause and resulting behavior | Regression coverage |
|---|---|---|
| TG-01 | Text ranges identified an entire insert block. Parsed nodes now select one entry, preserve sibling/unknown data, validate the complete planned output and back up originals. Failed multi-file writes roll back owned bytes; external changes are not overwritten. | `test/config-integrity.test.js`: siblings/comments, malformed/dynamic/ambiguous targets, flow syntax, failed second write, concurrent edit |
| TG-02 | A constant header was treated as an admission gate. Every management request now goes through the host's `connection.requestRejection()`. Missing auth support closes the endpoint; env/header values are excluded from responses and retained when omitted during edits. | `host-tests/runtime.spec.ts`: real signed Cookie auth, missing/forged cookies, Host/Origin fences, missing service, JSON limits, actual browser edits |
| TG-03 | Colon-containing list scalars were parsed as key/value pairs. YAML parsing now retains URL/Windows arguments, inline collections and quoted values. | `test/config-integrity.test.js`: complex scalar round-trip |
| TG-04 | Paths were inferred from installation layout/default home/process cwd. The runtime now uses launcher-owned profile/home facts and selected Session working directories, with the same project-root convention as the host. | `test/config-integrity.test.js`, `test/skills-config.test.js`, real selected-workspace/browser cases |
| TG-05 | Restriction disposers belonged to Agent scopes while state lived at module scope. State is now per plugin instance; plugin unload releases every owned restriction and timers; Agent disposal clears session state. | Real unload/reload, replacement Agent, two simultaneous plugin instances |
| TG-06 | Each file's overrides were applied in isolation. Effective rows now come from the official host composer over bundle, profile, global and launcher overlays; toggles target the last writable layer. Source definition layers are retained. | Two patch-order cases plus an oracle comparison with `applyEntryPatches` |
| TG-07 | Listing, toggling and deletion used different cwd/source assumptions. All use one selected view and provider/path/source identity. Delete is limited to matching local `.dsh` directory bundles; unsupported sources and links are rejected; disabled identities survive reload. | Real filesystem/provider registry, same-name skills in two projects, scoped-provider refusal, browser workspace selection and trash |

## Patch-order correction

The host applies **profile before global**, after bundle layers and before launcher overlays. A profile override that refers only to an entry inserted later in global is skipped by the host. It is therefore incorrect to expect that early profile override to disable the later global insertion. The regression tests preserve this behavior and separately cover the actual defect: a global override for an existing profile entry must affect the listed effective state. This correction replaces the reverse-order assumption in the initial audit example.

## Verification

- Local Node 24.15.0 / Windows: 31 unit tests pass; 9 host tests pass with `TOOLGATE_BROWSER=1`, including the actual React client in headless Edge.
- The host suite mounts production Cordis/tools/skills, filesystem discovery, HTTP server and Connection Cookie authentication. It does not replace authentication with a permissive test stub. Only credential storage and model responses are in-memory/synthetic fixtures.
- Browser checks cover secret retention, preserved complex args, selected-project create/trash, read-only sources, page errors and a 390 px viewport. Screenshots are generated under `work/results/`.
- `npm run pack:check` checks the distribution whitelist and installs the archive into a disposable profile. Runtime files match the source; `yaml` is present and no duplicate DSH packages are installed.
- Windows and Linux CI repeat unit, host/browser and distribution checks. See the PR checks for their actual results; the dated local results above are not a claim that a remote job already passed.

Full Desktop shell input handling, real-model latency, SSH, arbitrary future host versions and third-party plugin combinations remain outside this validation. Scoped tool restrictions are a host capability boundary; projected savings exclude known unhideable tools. Tool hiding is not a permission sandbox.
