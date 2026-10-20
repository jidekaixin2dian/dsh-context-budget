import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parse } from 'yaml'
import { createMcpConfig, publicServers, paths } from '../lib/mcp-config.js'
import { commitFiles } from '../lib/config-files.js'
import { hostPaths, skillView } from '../lib/host-paths.js'

const MCP = '@deepseek-ai/dsh-mcp-client'
function fixture(t, project = '[]\n', global = '[]\n') {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'toolgate-integrity-')), profileDir = path.join(home, 'profiles', 'selected')
  fs.mkdirSync(profileDir, { recursive: true })
  const p = path.join(profileDir, 'cordis.patch.yml'), g = path.join(home, 'cordis.patch.yml')
  fs.writeFileSync(p, project); fs.writeFileSync(g, global)
  t.after(() => fs.rmSync(home, { recursive: true, force: true }))
  return { home, p, g, manager: createMcpConfig({ home, profileDir }) }
}
const multi = `# keep header\n- insert:\n    # target\n    - id: demo\n      name: '${MCP}'\n      custom: keep-entry\n      config:\n        serverName: demo\n        command: node\n        transport: stdio\n        extra: keep-config\n    # sibling comment\n    - id: unrelated\n      name: unrelated-plugin\n      config: { keep: true }\n# untouched next block\n- id: another\n  config: { keep: yes }\n`

test('editing and deleting one nested entry preserve siblings, comments, unknown fields and untouched blocks', t => {
  const { p, manager } = fixture(t, multi)
  manager.editServer({ id: 'demo', serverName: 'demo', transport: 'stdio', command: 'npx', args: ['-y', 'pkg'] })
  let text = fs.readFileSync(p, 'utf8'), data = parse(text)
  assert.equal(data[0].insert[0].custom, 'keep-entry')
  assert.equal(data[0].insert[0].config.extra, 'keep-config')
  assert.deepEqual(data[0].insert[1], parse(multi)[0].insert[1])
  assert.ok(text.includes('# sibling comment'))
  assert.ok(text.endsWith('# untouched next block\n- id: another\n  config: { keep: yes }\n'))
  manager.removeServer('demo')
  text = fs.readFileSync(p, 'utf8'); data = parse(text)
  assert.equal(data[0].insert.length, 1)
  assert.equal(data[0].insert[0].id, 'unrelated')
  assert.ok(text.includes('# sibling comment'))
})

test('MCP scalar arguments round-trip URLs, Windows paths, commas, quotes, hashes and colons', t => {
  const { manager } = fixture(t)
  const args = ['https://example.test/mcp', 'C:\\tools\\demo.js', 'a,b', 'say "hello"', '#hash', 'a: b']
  manager.addServer({ serverName: 'demo', command: 'node', args })
  assert.deepEqual(manager.listServers().rows[0].config.args, args)
  manager.editServer({ id: 'demo', serverName: 'demo', command: 'node', args })
  assert.deepEqual(manager.listServers().rows[0].config.args, args)
})

test('deleting first generated block retains the next entry and its marker', t => {
  const text = `# dsh-toolgate:server:first\n- insert:\n    - {id: first, name: '${MCP}', config: {serverName: first, command: node}}\n# dsh-toolgate:server:second\n- insert:\n    - {id: second, name: '${MCP}', config: {serverName: second, command: node}}\n`
  const { p, manager } = fixture(t, text)
  manager.removeServer('first')
  assert.ok(fs.readFileSync(p, 'utf8').includes('# dsh-toolgate:server:second'))
  assert.equal(manager.listServers().rows[0].id, 'second')
})

test('effective state follows profile then global, and toggles update the effective override', t => {
  const { manager, g } = fixture(t)
  manager.addServer({ serverName: 'demo', command: 'node' })
  fs.writeFileSync(g, '- id: demo\n  disabled: true\n')
  assert.equal(manager.listServers().rows[0].disabled, true)
  manager.setServerEnabled('demo', true)
  assert.equal(manager.listServers().rows[0].disabled, false)
  for (let n = 0; n < 6; n++) manager.setServerEnabled('demo', n % 2 === 0)
  assert.equal(parse(fs.readFileSync(g, 'utf8')).length, 1)
  assert.equal(manager.listServers().rows[0].level, 'project')
})

test('an override preceding a later insertion is ignored, matching the host', t => {
  const { manager, p } = fixture(t)
  manager.addServer({ serverName: 'demo', command: 'node', level: 'global' })
  fs.writeFileSync(p, '- id: demo\n  disabled: true\n')
  assert.equal(manager.listServers().rows[0].disabled, false)
})

test('secrets are not returned to the client; omitted edits preserve existing maps and explicit empty maps clear them', t => {
  const { manager } = fixture(t)
  manager.addServer({ serverName: 'demo', command: 'node', env: { TOKEN: 'synthetic-secret' } })
  manager.editServer({ id: 'demo', serverName: 'demo', command: 'node' })
  const raw = manager.listServers()
  assert.equal(raw.rows[0].config.env.TOKEN, 'synthetic-secret')
  const publicResult = publicServers(raw)
  assert.equal(JSON.stringify(publicResult).includes('synthetic-secret'), false)
  assert.deepEqual(publicResult.rows[0].envKeys, ['TOKEN'])
  manager.editServer({ id: 'demo', serverName: 'demo', command: 'node', env: {} })
  assert.deepEqual(manager.listServers().rows[0].config.env, {})
})

test('malformed YAML, duplicate ids, dynamic targets and config overrides cannot be silently rewritten', t => {
  for (const source of ['[broken', multi + multi, multi.replace('command: node', 'command: !!js process.execPath'), multi + '- id: demo\n  config: {serverName: demo, command: other}\n']) {
    const { manager, p, g } = fixture(t, source)
    assert.throws(() => manager.editServer({ id: 'demo', serverName: 'demo', command: 'node' }))
    assert.equal(fs.readFileSync(p, 'utf8'), source)
    assert.equal(fs.readFileSync(g, 'utf8'), '[]\n')
  }
})

test('untouched custom tags are preserved without evaluating expressions', t => {
  const suffix = '- id: other\n  config:\n    command: !!js process.execPath\n'
  const { p, manager } = fixture(t, multi + suffix)
  manager.editServer({ id: 'demo', serverName: 'demo', command: 'node' })
  assert.ok(fs.readFileSync(p, 'utf8').endsWith(suffix))
})

test('flow-style root patches preserve their siblings when the selected entry changes', t => {
  const text = `[{insert: [{id: demo, name: '${MCP}', config: {serverName: demo, command: node}}, {id: other, name: other}]}, {id: untouched, disabled: true}]\n`
  const { p, manager } = fixture(t, text)
  manager.editServer({ id: 'demo', serverName: 'demo', command: 'updated' })
  let data = parse(fs.readFileSync(p, 'utf8'))
  assert.equal(data[0].insert[0].config.command, 'updated')
  assert.deepEqual(data[1], { id: 'untouched', disabled: true })
  manager.removeServer('demo')
  data = parse(fs.readFileSync(p, 'utf8'))
  assert.equal(data[0].insert[0].id, 'other')
})

test('a failed second-file write rolls back the first file and retains recoverable originals', t => {
  const { home, p, g } = fixture(t, 'before-p\n', 'before-g\n')
  const rename = fs.renameSync
  t.mock.method(fs, 'renameSync', (from, to) => { if (to === g) throw new Error('synthetic second-file failure'); return rename(from, to) })
  assert.throws(() => commitFiles([{ file: p, before: 'before-p\n', after: 'after-p\n' }, { file: g, before: 'before-g\n', after: 'after-g\n' }], home), /synthetic second-file failure/)
  assert.equal(fs.readFileSync(p, 'utf8'), 'before-p\n')
  assert.equal(fs.readFileSync(g, 'utf8'), 'before-g\n')
  const backup = path.join(home, 'backups', 'toolgate', fs.readdirSync(path.join(home, 'backups', 'toolgate'))[0])
  assert.equal(fs.readFileSync(path.join(backup, '0.yml'), 'utf8'), 'before-p\n')
})

test('concurrent configuration changes are rejected before writing', t => {
  const { home, p } = fixture(t, 'external edit\n')
  assert.throws(() => commitFiles([{ file: p, before: 'stale snapshot\n', after: 'ours\n' }], home), /修改/)
  assert.equal(fs.readFileSync(p, 'utf8'), 'external edit\n')
})

test('profile and workspace come from the selected host context, never another installed profile or process cwd', () => {
  const home = path.resolve('custom-home'), dir = path.join(home, 'profiles', 'selected'), cwd = path.resolve('selected-workspace')
  const agent = { session: { id: 'selected-session', header: { cwd } } }
  const ctx = { get: name => ({ profileContext: { home, dir, cwd }, agents: { list: () => [agent] } })[name] }
  assert.equal(paths(hostPaths(ctx)).project, path.join(dir, 'cordis.patch.yml'))
  assert.equal(skillView(ctx, { sessionId: 'selected-session' }).cwd, cwd)
  assert.throws(() => skillView(ctx, { sessionId: 'gone' }), /会话/)
})
