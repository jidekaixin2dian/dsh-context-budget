// Append-only operation log next to the plugin state file: one JSON line per
// management write with what changed, when, and whether it succeeded. Values
// of env/headers are never recorded; a failed append must not break the
// operation it describes.
import fs from 'node:fs'
import path from 'node:path'

const MAX_BYTES = 1024 * 1024

export function appendAudit(home, entry) {
  const file = path.join(home, 'toolgate-audit.jsonl')
  try {
    try {
      if (fs.statSync(file).size > MAX_BYTES) {
        try { fs.unlinkSync(file + '.1') } catch { /* first rotation */ }
        fs.renameSync(file, file + '.1')
      }
    } catch { /* size check on a missing file */ }
    fs.appendFileSync(file, JSON.stringify({ at: new Date().toISOString(), ...entry }) + '\n',
      { encoding: 'utf8', mode: 0o600 })
    return true
  } catch {
    return false
  }
}
