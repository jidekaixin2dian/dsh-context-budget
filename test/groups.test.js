import test from 'node:test'
import assert from 'node:assert/strict'
import {
  FIXED_LABELS, groupOf, isDisabled, labelOf, matchesDisabled, normalizeDisabled,
} from '../lib/groups.js'
import { parseServers } from '../lib/mcp-config.js'

test('MCP tool names group by server, not by a hardcoded REA id', () => {
  assert.equal(groupOf('mcp__rea__decompile'), 'mcp:rea')
  assert.equal(groupOf('mcp__github__create_issue'), 'mcp:github')
  assert.equal(groupOf('mcp__my-server__x'), 'mcp:my-server')
  assert.equal(groupOf('mcp__odd.name__x'), 'mcp:odd_name')
  assert.equal(groupOf('mcp__x'), 'mcp:other')
  assert.equal(labelOf('mcp:github'), 'MCP · github')
})

test('built-in groups and core are stable', () => {
  assert.equal(groupOf('skill'), 'skills')
  assert.equal(groupOf('mnemon_recall'), 'memory')
  assert.equal(groupOf('schedule_create'), 'schedule')
  assert.equal(groupOf('read'), 'core')
  assert.equal(labelOf('skills'), FIXED_LABELS.skills)
  assert.equal(isDisabled('core', ['core']), false)
})

test('legacy REA settings migrate to the generic server id', () => {
  assert.deepEqual(normalizeDisabled(['rea', 'mcp_other']), ['mcp:rea', 'mcp:other'])
  assert.deepEqual(normalizeDisabled(['mcp', 'skills', 'nope']), ['mcp', 'skills'])
  assert.deepEqual(normalizeDisabled(['MCP:GitHub']), ['mcp:github'])
})

test('wildcard mcp disables every MCP server, not other groups', () => {
  assert.equal(matchesDisabled('mcp__rea__x', ['mcp']), true)
  assert.equal(matchesDisabled('mcp__github__x', ['mcp']), true)
  assert.equal(matchesDisabled('skill', ['mcp']), false)
  assert.equal(isDisabled('mcp:rea', ['mcp:rea']), true)
  assert.equal(isDisabled('mcp:github', ['mcp:rea']), false)
})

test('profile patch rows parse MCP config and disabled overrides', () => {
  const sample = [
    '# dsh-toolgate:server:demo',
    '- insert:',
    '    - id: demo',
    "      name: '@deepseek-ai/dsh-mcp-client'",
    '      config:',
    '        serverName: demo',
    '        transport: stdio',
    '        command: npx',
    '        args:',
    '          - -y',
    '          - pkg',
    '        env:',
    '          TOKEN: "x"',
    '- id: demo',
    "  name: '@deepseek-ai/dsh-mcp-client'",
    '  disabled: true',
  ].join('\n')
  const rows = parseServers(sample, 'project')
  assert.equal(rows.length, 1)
  assert.equal(rows[0].id, 'demo')
  assert.equal(rows[0].config.serverName, 'demo')
  assert.equal(rows[0].config.command, 'npx')
  assert.deepEqual(rows[0].config.args, ['-y', 'pkg'])
  assert.equal(rows[0].disabled, true)
})

test('legacy context-budget markers still count as managed rows', () => {
  const sample = [
    '# dsh-context-budget:server:legacy',
    '- insert:',
    '    - id: legacy',
    "      name: '@deepseek-ai/dsh-mcp-client'",
    '      config:',
    '        serverName: legacy',
    '        transport: stdio',
  ].join('\n')
  const rows = parseServers(sample, 'project')
  assert.equal(rows.length, 1)
  assert.equal(rows[0].id, 'legacy')
  assert.equal(rows[0].managed, true)
})


