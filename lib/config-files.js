import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

export function readFile(file) {
  try { return fs.readFileSync(file, 'utf8') } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
}

function replace(file, content, mode = 0o600) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
  const temporary = file + '.toolgate-' + randomUUID()
  try {
    fs.writeFileSync(temporary, content, { encoding: 'utf8', flag: 'wx', mode })
    fs.renameSync(temporary, file)
  } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary) }
}

// Plan and back up every file before committing. A failed multi-file write
// restores only bytes still owned by this transaction, never an external edit.
export function commitFiles(changes, home) {
  const plan = changes.filter(change => change.before !== change.after)
  if (!plan.length) return []
  for (const change of plan) {
    if (readFile(change.file) !== change.before) throw new Error('配置已被其他程序修改，请刷新后重试')
    change.mode = change.before === null ? 0o600 : fs.statSync(change.file).mode & 0o777
  }
  const backup = path.join(home, 'backups', 'toolgate', Date.now() + '-' + randomUUID())
  fs.mkdirSync(backup, { recursive: true, mode: 0o700 })
  const records = plan.map((change, index) => {
    const file = path.join(backup, index + '.yml')
    if (change.before !== null) fs.writeFileSync(file, change.before, { mode: 0o600, flag: 'wx' })
    return { target: change.file, backup: change.before === null ? null : file }
  })
  fs.writeFileSync(path.join(backup, 'manifest.json'), JSON.stringify(records, null, 2), { mode: 0o600, flag: 'wx' })
  const committed = []
  try {
    for (const change of plan) {
      if (readFile(change.file) !== change.before) throw new Error('配置已被其他程序修改，请刷新后重试')
      replace(change.file, change.after, change.mode)
      committed.push(change)
    }
  } catch (error) {
    const failures = []
    for (const change of committed.reverse()) {
      try {
        if (readFile(change.file) !== change.after) throw new Error('配置被并发修改，未覆盖外部改动')
        if (change.before === null) fs.unlinkSync(change.file)
        else replace(change.file, change.before, change.mode)
      } catch (failure) { failures.push(failure.message) }
    }
    throw new Error(error.message + (failures.length ? '；回滚未完成：' + failures.join('；') : '') + '；原始备份：' + backup)
  }
  return records
}
