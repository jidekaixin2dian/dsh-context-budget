// Guards the client→host HTTP contract: the settings bundle posts
// `{ op, args }`, and every handler must read the operation fields out of
// `args`. Regression cover for the 0.1.x bug where `payload.id` was read
// instead, so every write operation silently received `undefined`.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { requestArgs } from '../lib/api-payload.js'
import { normalizeDisabled } from '../lib/groups.js'
import { addServer, listServers, setServerEnabled } from '../lib/mcp-config.js'

function withTempProfile() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-http-'))
  const profile = path.join(root, 'profiles', 'desktop')
  fs.mkdirSync(profile, { recursive: true })
  fs.writeFileSync(path.join(profile, 'cordis.patch.yml'), '[]\n')
  fs.writeFileSync(path.join(root, 'cordis.patch.yml'), '[]\n')
  const oldProfile = process.env.DSH_TOOLGATE_PROFILE_DIR
  const oldHome = process.env.DSH_TOOLGATE_HOME
  process.env.DSH_TOOLGATE_PROFILE_DIR = profile
  process.env.DSH_TOOLGATE_HOME = root
  return {
    restore() {
      if (oldProfile === undefined) delete process.env.DSH_TOOLGATE_PROFILE_DIR
      else process.env.DSH_TOOLGATE_PROFILE_DIR = oldProfile
      if (oldHome === undefined) delete process.env.DSH_TOOLGATE_HOME
      else process.env.DSH_TOOLGATE_HOME = oldHome
      fs.rmSync(root, { recursive: true, force: true })
    },
  }
}

// Mirrors the route handler: payload -> requestArgs -> operation call.
function dispatch(payload) {
  const args = requestArgs(payload)
  if (payload.op === 'mcp-add') return addServer(args.row)
  if (payload.op === 'mcp-enabled') return setServerEnabled(args.id, args.enabled !== false)
  if (payload.op === 'set') return normalizeDisabled(args.disabled)
  throw new Error('unexpected op ' + payload.op)
}

test('wrapped mcp-add payload actually creates the server', () => {
  const temp = withTempProfile()
  try {
    dispatch({
      op: 'mcp-add',
      args: { row: { serverName: 'demo', transport: 'stdio', command: 'npx' } },
    })
    assert.equal(listServers().rows.length, 1)
    assert.equal(listServers().rows[0].config.serverName, 'demo')
  } finally {
    temp.restore()
  }
})

test('flat mcp-add payloads are rejected instead of silently interpreted', () => {
  const temp = withTempProfile()
  try {
    assert.throws(() => dispatch({ op: 'mcp-add', args: { serverName: 'flat', transport: 'stdio', command: 'npx' } }), /serverName/)
    assert.equal(listServers().rows.length, 0)
  } finally {
    temp.restore()
  }
})

test('wrapped mcp-enabled payload actually toggles the server', () => {
  const temp = withTempProfile()
  try {
    addServer({ serverName: 'demo', transport: 'stdio', command: 'npx' })
    dispatch({ op: 'mcp-enabled', args: { id: 'demo', enabled: false } })
    assert.equal(listServers().rows[0].disabled, true)
    dispatch({ op: 'mcp-enabled', args: { id: 'demo', enabled: true } })
    assert.equal(listServers().rows[0].disabled, false)
  } finally {
    temp.restore()
  }
})

test('wrapped set payload applies the disabled groups instead of clearing them', () => {
  const temp = withTempProfile()
  try {
    assert.deepEqual(dispatch({ op: 'set', args: { disabled: ['mcp:demo', 'skills'] } }), ['mcp:demo', 'skills'])
  } finally {
    temp.restore()
  }
})


