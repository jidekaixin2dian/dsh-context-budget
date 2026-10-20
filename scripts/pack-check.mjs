import fs from 'node:fs'
import { resolve, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
const npm = process.env.npm_execpath
assert.ok(npm?.endsWith('npm-cli.js'), 'Use npm run pack:check')
const directory = resolve('work/packages')
fs.mkdirSync(directory, { recursive: true })
const result = spawnSync(process.execPath, [npm, 'pack', '--ignore-scripts', '--json', '--pack-destination', directory], { encoding: 'utf8' })
assert.equal(result.status, 0, result.stderr)
const parsed = JSON.parse(result.stdout)
const packed = Array.isArray(parsed) ? parsed[0] : Object.values(parsed)[0]
assert.ok(packed.files.every(file => /^(lib\/[^/]+\.js|locale\/[^/]+\.json|assets\/[^/]+\.svg|README(?:\.en|\.zh)?\.md|LICENSE|SECURITY\.md|package\.json|cordis\.patch\.yml|icon\.svg)$/.test(file.path)))
for (const entry of ['lib/index.js', 'lib/client.js', 'lib/mcp-config.js', 'lib/skills-runtime.js', 'lib/host-paths.js', 'lib/config-files.js']) assert.ok(packed.files.some(file => file.path === entry), entry)
const archive = join(directory, packed.filename)
const audit = { filename: packed.filename, bytes: packed.size, sha256: createHash('sha256').update(fs.readFileSync(archive)).digest('hex'), files: packed.files.map(file => file.path) }
fs.writeFileSync(join(directory, 'audit.json'), JSON.stringify(audit, null, 2))
// Install the archive, rather than assuming npm's file list means a loadable
// distribution. Optional host peers must not create a duplicate DSH runtime.
const profile = fs.mkdtempSync(join(directory, 'install-'))
fs.writeFileSync(join(profile, 'package.json'), JSON.stringify({ private: true }))
const installed = spawnSync(process.execPath, [npm, 'install', '--omit=dev', '--ignore-scripts', '--legacy-peer-deps', '--registry=https://registry.npmjs.org', archive], { cwd: profile, encoding: 'utf8' })
assert.equal(installed.status, 0, installed.stderr)
assert.equal(fs.existsSync(join(profile, 'node_modules/@deepseek-ai')), false)
const packageDir = join(profile, 'node_modules/@jidekaixin2dian/dsh-toolgate')
for (const file of packed.files.filter(file => file.path.startsWith('lib/'))) assert.deepEqual(fs.readFileSync(join(packageDir, file.path)), fs.readFileSync(file.path))
assert.ok(fs.existsSync(join(profile, 'node_modules/yaml/package.json')))
console.log(`Package whitelist and isolated install passed (${packed.files.length} files).`)
