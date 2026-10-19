import test from 'node:test'
import assert from 'node:assert/strict'
import { requestArgs } from '../lib/api-payload.js'

test('requestArgs unwraps the client envelope', () => {
  const args = { id: 'rea-mcp', enabled: false }
  assert.equal(requestArgs({ op: 'mcp-enabled', args }), args)
})

test('requestArgs falls back to a flat payload', () => {
  const flat = { op: 'mcp-enabled', id: 'rea-mcp', enabled: false }
  assert.equal(requestArgs(flat), flat)
})

test('requestArgs survives missing or malformed payloads', () => {
  assert.deepEqual(requestArgs(undefined), {})
  assert.deepEqual(requestArgs(null), {})
  assert.deepEqual(requestArgs('nope'), {})
})

test('requestArgs ignores a non-object args value', () => {
  const flat = { op: 'set', disabled: ['mcp'] }
  const payload = { op: 'set', disabled: ['mcp'], args: 'not-an-object' }
  assert.equal(requestArgs(payload), payload)
  assert.equal(requestArgs(flat), flat)
  assert.deepEqual(requestArgs({ op: 'status', args: ['x'] }), { op: 'status', args: ['x'] })
})
