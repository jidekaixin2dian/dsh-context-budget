# Security

Management HTTP requests use the running DSH Connection service's authentication and Host/Origin checks. Missing authentication support closes the endpoint. This requires a host exposing `connection.requestRejection()`; the integration suite pins DSH 0.2.1-rc.2. A public plugin header is an additional request marker, never a credential.

MCP environment and header values are not returned in management responses. Leave their replacement controls unchecked to retain existing values. Configuration edits preserve unrelated nodes and create recoverable copies under `DSH_HOME/backups/toolgate/` before writing. These backups contain original configuration, including secrets; keep them private.

Only selected local `.dsh/skills/<name>/SKILL.md` directory bundles can be moved to `.trash`. Shared `.agents`, bundled, custom and virtual provider sources remain read-only. Directory links cannot redirect deletion or trash outside the selected root.

Tool hiding controls context exposure, not a security sandbox or a process boundary. Session overrides can restore groups, scoped tools may remain visible, and MCP processes continue running.

For security reports use GitHub private vulnerability reporting when available. Do not put real credentials, cookies, launch URLs, configuration backups or private conversation contents in public issues or PRs.

Release 0.1.1's uploaded archive contains the scoped client startup fix, but its
Git tag predates that change. Use 0.1.2 or later for matching source and archive.
Release integrity checks reject version drift, missing files and differences
between archive content and tagged source (apart from checkout line endings).
