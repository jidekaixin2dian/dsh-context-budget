import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { appendAudit } from '../lib/audit.js'

const lines = file => fs.readFileSync(file, 'utf8').trim().split('\n').map(JSON.parse)

test('audit entries append as JSON lines with timestamps and rotate past 1 MiB', t => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'toolgate-audit-'))
  t.after(() => fs.rmSync(home, { recursive: true, force: true }))
  assert.equal(appendAudit(home, { op: 'mcp-add', id: 'demo' }), true)
  assert.equal(appendAudit(home, { op: 'mcp-edit', id: 'demo', error: 'serverName 已存在' }), true)
  const file = path.join(home, 'toolgate-audit.jsonl')
  const first = lines(file)
  assert.equal(first.length, 2)
  assert.equal(first[0].op, 'mcp-add')
  assert.equal(first[0].id, 'demo')
  assert.ok(!Number.isNaN(Date.parse(first[0].at)))
  assert.equal(first[1].error, 'serverName 已存在')
  fs.writeFileSync(file, 'x'.repeat(1024 * 1024 + 1))
  assert.equal(appendAudit(home, { op: 'mcp-remove', id: 'demo' }), true)
  assert.ok(fs.existsSync(file + '.1')) // the oversized history rotated away
  assert.equal(lines(file).length, 1)
  assert.equal(lines(file)[0].op, 'mcp-remove')
})

test('an unwritable audit home reports failure without throwing', t => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'toolgate-audit-'))
  t.after(() => fs.rmSync(home, { recursive: true, force: true }))
  const file = path.join(home, 'toolgate-audit.jsonl')
  fs.mkdirSync(file) // a directory where the log file belongs
  assert.equal(appendAudit(home, { op: 'set', disabled: [] }), false)
})
