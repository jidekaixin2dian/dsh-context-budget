// MCP server CRUD for the profile/global cordis.patch.yml files.
// Line-based editing (not a full YAML round-trip) so unrelated rows and
// comments survive. The parser mirrors the shape emitted by buildInsertBlock;
// hand-edited blocks with the same standard indentation work too.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const MCP = '@deepseek-ai/dsh-mcp-client'
const MARK = '# dsh-context-budget:'

function hereProfileDir() {
  try {
    const here = fileURLToPath(import.meta.url)
    const dir = path.resolve(path.dirname(here), '../../../..')
    return fs.existsSync(path.join(dir, 'cordis.patch.yml')) ? dir : null
  } catch {
    return null
  }
}

export function paths() {
  let profileDir = process.env.DSH_CONTEXT_BUDGET_PROFILE_DIR || hereProfileDir()
  if (!profileDir) {
    const home = path.join(os.homedir(), '.dsh')
    const profiles = path.join(home, 'profiles')
    try {
      const names = fs.readdirSync(profiles)
      const found = names.find(name => fs.existsSync(path.join(profiles, name, 'cordis.patch.yml')))
      if (found) profileDir = path.join(profiles, found)
    } catch { /* fall through */ }
    if (!profileDir) profileDir = path.join(profiles, 'desktop')
  }
  const home = process.env.DSH_CONTEXT_BUDGET_HOME || path.dirname(path.dirname(profileDir))
  return {
    home,
    profileDir,
    project: path.join(profileDir, 'cordis.patch.yml'),
    global: path.join(home, 'cordis.patch.yml'),
  }
}

function readPatch(abs) {
  try { return fs.readFileSync(abs, 'utf8') } catch (err) {
    if (err.code === 'ENOENT') return ''
    throw err
  }
}

function writePatch(abs, content) {
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  const tmp = abs + '.tmp-context-budget'
  fs.writeFileSync(tmp, content, 'utf8')
  fs.renameSync(tmp, abs)
}

function yq(v) { return typeof v === 'string' ? JSON.stringify(v) : String(v) }
function yplain(v) { return /^[A-Za-z0-9_.:@%+=/-]+$/.test(v) ? v : yq(v) }

function buildInsertBlock(row) {
  const lines = [
    MARK + 'server:' + row.id,
    '- insert:',
    '    - id: ' + yplain(row.id),
    '      name: ' + yq(MCP),
    '      config:',
    '        serverName: ' + yq(row.serverName),
    '        transport: ' + yq(row.transport),
  ]
  if (row.transport === 'streamable-http') {
    lines.push('        url: ' + yq(row.url || ''))
    const headers = row.headers || {}
    for (const k of Object.keys(headers)) {
      if (!lines.includes('        headers:')) lines.push('        headers:')
      lines.push('          ' + yq(k) + ': ' + yq(headers[k]))
    }
  } else {
    lines.push('        command: ' + yq(row.command || ''))
    const args = row.args || []
    if (args.length) {
      lines.push('        args:')
      for (const a of args) lines.push('          - ' + yq(a))
    }
    const env = row.env || {}
    for (const k of Object.keys(env)) {
      if (!lines.includes('        env:')) lines.push('        env:')
      lines.push('          ' + yq(k) + ': ' + yq(env[k]))
    }
  }
  if (row.toolCallTimeoutMs) lines.push('        toolCallTimeoutMs: ' + Number(row.toolCallTimeoutMs))
  return lines.join('\n')
}

function buildDisabledBlock(id, disabled) {
  return [
    MARK + (disabled ? 'disable:' : 'enable:') + id,
    '- id: ' + yplain(id),
    '  name: ' + yq(MCP),
    '  disabled: ' + (disabled ? 'true' : 'false'),
  ].join('\n')
}

function splitKV(text) {
  const m = text.match(/^("(?:\\.|[^"])*"|'[^']*'|[^:]+?)\s*:\s*(.*)$/)
  if (!m) return null
  return { key: unquote(m[1]), value: m[2] }
}

function unquote(v) {
  if (v === undefined || v === null) return v
  const s = String(v).trim()
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
    try { return JSON.parse(s) } catch { return s.slice(1, -1) }
  }
  if (s.length >= 2 && s.startsWith("'") && s.endsWith("'")) return s.slice(1, -1).replace(/''/g, "'")
  if (/^\[.*\]$/.test(s)) return s.slice(1, -1).split(',').map(x => unquote(x.trim())).filter(x => x !== '')
  if (s === 'true') return true
  if (s === 'false') return false
  if (/^-?\d+$/.test(s)) return Number(s)
  return s
}

function parseEntry(lines) {
  const entry = { config: {} }
  let inConfig = false
  let configIndent = 0
  let nested = null
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const indent = line.match(/^\s*/)[0].length
    let t = trimmed
    if (t.startsWith('- ')) t = t.slice(2).trim()
    const kv = splitKV(t)
    if (!kv) {
      if (inConfig && nested && nested.type === 'list') nested.current.push(unquote(t))
      continue
    }
    if (!inConfig) {
      if (kv.key === 'config' && kv.value === '') { inConfig = true; configIndent = indent; continue }
      if (kv.key === 'id') entry.id = unquote(kv.value)
      else if (kv.key === 'name') entry.name = unquote(kv.value)
      else if (kv.key === 'disabled') entry.disabled = kv.value === 'true'
      continue
    }
    if (indent <= configIndent) { inConfig = false; nested = null; continue }
    if (kv.value === '' && (kv.key === 'headers' || kv.key === 'env')) {
      nested = { key: kv.key, indent, type: 'map', current: {} }
      entry.config[kv.key] = nested.current
      continue
    }
    if (kv.value === '' && kv.key === 'args') {
      nested = { key: kv.key, indent, type: 'list', current: [] }
      entry.config[kv.key] = nested.current
      continue
    }
    if (nested && indent > nested.indent) {
      if (nested.type === 'map') nested.current[kv.key] = unquote(kv.value)
      else if (nested.type === 'list') nested.current.push(unquote(kv.value))
      continue
    }
    nested = null
    entry.config[kv.key] = unquote(kv.value)
  }
  return entry
}

export function parseServers(content, level) {
  const lines = content.split(/\r?\n/)
  const managed = new Set()
  for (const line of lines) {
    const m = line.match(/^# dsh-context-budget:server:(.+)$/)
    if (m) managed.add(m[1].trim())
  }
  const rows = []
  const overrides = []
  const blocks = []
  let current = null
  for (const line of lines) {
    if (/^- /.test(line)) {
      current = { text: line }
      blocks.push(current)
    } else if (current) current.text += '\n' + line
  }
  for (const block of blocks) {
    const head = block.text.split('\n')[0]
    if (/^- insert:/.test(head)) {
      const parts = block.text.split('\n')
      let i = 0
      while (i < parts.length) {
        if (/^    - /.test(parts[i])) {
          const child = [parts[i]]
          i++
          while (i < parts.length && !/^    - /.test(parts[i])) { child.push(parts[i]); i++ }
          const entry = parseEntry(child)
          if (entry.name === MCP) {
            rows.push({
              id: entry.id,
              name: MCP,
              disabled: !!entry.disabled,
              config: entry.config,
              level,
              managed: managed.has(entry.id),
            })
          }
        } else i++
      }
    } else {
      const entry = parseEntry(block.text.split('\n'))
      if (entry.name === MCP) overrides.push({ id: entry.id, disabled: entry.disabled })
    }
  }
  for (const o of overrides) {
    const row = rows.find(r => r.id === o.id)
    if (row && o.disabled !== undefined) row.disabled = o.disabled
  }
  return rows
}

export function listServers() {
  const p = paths()
  const project = parseServers(readPatch(p.project), 'project')
  const global = parseServers(readPatch(p.global), 'global')
  const seen = new Set()
  const rows = []
  for (const row of [...project, ...global]) {
    const key = row.id
    if (seen.has(key)) continue
    seen.add(key)
    rows.push(row)
  }
  return { rows, paths: { project: p.project, global: p.global } }
}

function splitLines(content) { return content.split(/\r?\n/) }
function joinLines(lines) {
  let res = lines.join('\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '').replace(/\n*$/, '\n')
  if (!res.trim()) return '[]\n'
  if (!/^- /m.test(res) && !/^\[\]\s*$/m.test(res)) res = res.replace(/\n*$/, '\n[]\n')
  return res
}
function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }

function markerRanges(lines, id, ops) {
  const re = new RegExp('^# dsh-context-budget:(' + ops + '):' + escRe(id) + '$')
  const ranges = []
  for (let i = 0; i < lines.length; i++) {
    if (!re.test(lines[i])) continue
    let j = i + 1
    while (j < lines.length && !/^- /.test(lines[j])) j++
    let end = j
    if (j < lines.length) {
      let k = j + 1
      while (k < lines.length && !/^- /.test(lines[k])) k++
      end = k
    }
    ranges.push([i, end])
  }
  return ranges
}

function insertRange(lines, id) {
  const re = new RegExp('^\\s*- id: ' + escRe(id) + '\\s*$')
  for (let i = 0; i < lines.length; i++) {
    if (!/^- insert:/.test(lines[i])) continue
    let end = i + 1
    while (end < lines.length && !/^- /.test(lines[end])) end++
    if (lines.slice(i, end).some(l => re.test(l))) return [i, end]
  }
  return null
}

function bareRanges(lines, id) {
  const re = new RegExp('^- id: ' + escRe(id) + '\\s*$')
  const ranges = []
  for (let i = 0; i < lines.length; i++) {
    if (!re.test(lines[i])) continue
    let end = i + 1
    while (end < lines.length && !/^- /.test(lines[end])) end++
    ranges.push([i, end])
  }
  return ranges
}

function splice(lines, ranges) {
  const remove = new Set()
  for (const [a, b] of ranges) for (let i = a; i < b; i++) remove.add(i)
  return joinLines(lines.filter((_, i) => !remove.has(i)))
}

function removeAll(content, id) {
  const lines = splitLines(content)
  const ranges = markerRanges(lines, id, 'server|disable|enable')
  const ins = insertRange(lines, id)
  if (ins) ranges.push(ins)
  ranges.push(...bareRanges(lines, id))
  return splice(lines, ranges)
}

function appendBlock(content, block) {
  let c = content
  if (/^\[\]\s*$/m.test(c)) c = c.replace(/^\[\]\s*$/m, block + '\n')
  else c = c.replace(/\s*$/, '\n' + block + '\n')
  return c
}

function normalizeRow(input) {
  const serverName = String(input.serverName || '').trim()
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(serverName)) throw new Error('serverName 必须是 1–32 位字母、数字、_ 或 -')
  const transport = String(input.transport || 'stdio')
  if (!['stdio', 'streamable-http'].includes(transport)) throw new Error('transport 必须是 stdio 或 streamable-http')
  const id = String(input.id || serverName).trim()
  if (!/^[A-Za-z0-9_.:@%+=/-]{1,80}$/.test(id)) throw new Error('id 含非法字符')
  const args = Array.isArray(input.args) ? input.args.map(String) : String(input.args || '').split('\n').map(s => s.trim()).filter(Boolean)
  const parseMap = (v) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) return v
    const out = {}
    for (const line of String(v || '').split('\n')) {
      const idx = line.indexOf('=')
      if (idx <= 0) continue
      out[line.slice(0, idx).trim()] = line.slice(idx + 1)
    }
    return out
  }
  return {
    id,
    serverName,
    transport,
    level: input.level === 'global' ? 'global' : 'project',
    url: String(input.url || '').trim(),
    command: String(input.command || '').trim(),
    args,
    env: parseMap(input.env),
    headers: parseMap(input.headers),
    toolCallTimeoutMs: Number(input.toolCallTimeoutMs) || 0,
  }
}

export function addServer(input) {
  const row = normalizeRow(input)
  const p = paths()
  const target = row.level === 'global' ? p.global : p.project
  const content = readPatch(target)
  if (listServers().rows.some(r => r.id === row.id || r.config.serverName === row.serverName)) {
    throw new Error('id 或 serverName 已存在')
  }
  writePatch(target, appendBlock(content, buildInsertBlock(row)))
  return listServers()
}

export function editServer(input) {
  const row = normalizeRow(input)
  const p = paths()
  const target = row.level === 'global' ? p.global : p.project
  let project = readPatch(p.project)
  let global = readPatch(p.global)
  project = removeAll(project, row.id)
  global = removeAll(global, row.id)
  writePatch(p.project, project)
  writePatch(p.global, global)
  writePatch(target, appendBlock(readPatch(target), buildInsertBlock(row)))
  return listServers()
}

export function removeServer(id) {
  const p = paths()
  const sid = String(id || '')
  writePatch(p.project, removeAll(readPatch(p.project), sid))
  writePatch(p.global, removeAll(readPatch(p.global), sid))
  return listServers()
}

export function setServerEnabled(id, enabled) {
  const sid = String(id || '')
  const listing = listServers()
  const row = listing.rows.find(r => r.id === sid)
  if (!row) throw new Error('找不到 MCP 服务器: ' + sid)
  const p = paths()
  let file = row.level === 'global' ? readPatch(p.global) : readPatch(p.project)
  file = splice(splitLines(file), markerRanges(splitLines(file), sid, 'disable|enable'))
  file = appendBlock(file, buildDisabledBlock(sid, !enabled))
  writePatch(row.level === 'global' ? p.global : p.project, file)
  return listServers()
}
