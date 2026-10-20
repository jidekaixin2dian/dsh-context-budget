// Parse nodes for identity; print only changed top-level patches. Other source
// ranges remain intact, including comments, unknown fields and !!js scalars.
import os from 'node:os'
import path from 'node:path'
import { Document, isAlias, isMap, isSeq, parseDocument, visit } from 'yaml'
import { commitFiles, readFile } from './config-files.js'

const MCP = '@deepseek-ai/dsh-mcp-client'
const yamlOptions = { keepSourceTokens: true, customTags: [{ tag: 'tag:yaml.org,2002:js', resolve: value => value }] }

export function paths(options = {}) {
  const profileDir = options.profileDir || process.env.DSH_TOOLGATE_PROFILE_DIR
  if (!profileDir || !path.isAbsolute(profileDir)) throw new Error('宿主未提供当前 profile，拒绝猜测配置目录')
  const home = options.home || process.env.DSH_TOOLGATE_HOME || process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
  return { home: path.resolve(home), profileDir, project: options.profilePatch || path.join(profileDir, 'cordis.patch.yml'), global: path.join(home, 'cordis.patch.yml') }
}

function parse(content, file = 'cordis.patch.yml') {
  const doc = parseDocument(content ?? '[]\n', yamlOptions)
  if (doc.errors.length || !isSeq(doc.contents)) throw new Error('无法安全编辑 YAML 配置：' + file)
  doc.toJS() // reject unresolved/excessive aliases without evaluating !!js
  return doc
}

function dynamic(node) {
  let result = false
  visit(node, (_key, value) => { if (isAlias(value) || value?.tag || (isMap(value) && value.has('<<'))) result = true })
  return result
}

function definitions(doc, level) {
  const refs = []
  const entries = (seq, top) => {
    if (!isSeq(seq)) return
    for (const node of seq.items) {
      if (!isMap(node)) continue
      refs.push({ node, seq, top, level, id: node.get('id') })
      if (node.get('group') === true) entries(node.get('config', true), top)
    }
  }
  for (const top of doc.contents.items) if (isMap(top)) entries(top.get('insert', true), top)
  return refs
}

// Standalone helper, oracle-tested against the public host function. The
// running plugin supplies applyEntryPatches itself as the composer.
export function composePatches(initial, patches) {
  const rows = structuredClone(initial), ids = new Map()
  const index = items => { for (const row of items) { if (row.id) ids.set(row.id, row); if (row.group && Array.isArray(row.config)) index(row.config) } }
  index(rows)
  for (const patch of structuredClone(patches)) {
    if (patch.insert) {
      const target = patch.id ? ids.get(patch.id) : undefined
      if (patch.id && !target?.group) continue
      if (target) { if (!Array.isArray(target.config)) target.config = []; target.config.push(...patch.insert) }
      else rows.push(...patch.insert)
      index(patch.insert)
    } else {
      const target = ids.get(patch.id)
      if (!target || (patch.name && patch.name !== target.name)) continue
      for (const [key, value] of Object.entries(patch)) if (!['id', 'name'].includes(key)) target[key] = value
    }
  }
  return rows
}

const flatten = rows => rows.flatMap(row => [row, ...(row.group && Array.isArray(row.config) ? flatten(row.config) : [])])

export function parseServers(content, level) {
  const doc = parse(content)
  return flatten(composePatches([], doc.toJS())).filter(row => row.name === MCP).map(row => ({
    ...row, level, disabled: !!row.disabled,
    managed: content.split(/\r?\n/).some(line => line === '# dsh-toolgate:server:' + row.id || line === '# dsh-context-budget:server:' + row.id),
  }))
}

function renderChanged(before, changed, doc) {
  if (!changed.size) return before
  if (doc.contents.flow) {
    doc.contents.items = doc.contents.items.filter(node => !changed.has(node) || changed.get(node) !== null)
    const result = doc.toString({ lineWidth: 0 })
    parse(result)
    return result
  }
  const text = before ?? '[]\n', edits = []
  for (const [original, replacement] of changed) {
    const start = text.lastIndexOf('\n', original.range[0]) + 1, end = original.range[2]
    let value = ''
    if (replacement) {
      const copy = replacement.clone()
      copy.commentBefore = undefined // preceding comments are outside this range
      value = new Document([copy]).toString({ lineWidth: 0 })
      if (text.includes('\r\n')) value = value.replaceAll('\n', '\r\n')
    }
    edits.push({ start, end, value })
  }
  let result = text
  for (const edit of edits.sort((a, b) => b.start - a.start)) result = result.slice(0, edit.start) + edit.value + result.slice(edit.end)
  if (parseDocument(result, yamlOptions).contents === null) result += '[]\n'
  parse(result)
  return result
}

function append(content, row) {
  const doc = parse(content)
  if (doc.contents.items.length === 0) { doc.contents.flow = false; doc.contents.items.push(doc.createNode(row)); return doc.toString({ lineWidth: 0 }) }
  return content.replace(/\s*$/, '\n') + new Document([row]).toString({ lineWidth: 0 })
}

function normalizeRow(input) {
  const serverName = String(input.serverName || '').trim(), id = String(input.id || serverName).trim()
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(serverName)) throw new Error('serverName 必须是 1–32 位字母、数字、_ 或 -')
  if (!/^[A-Za-z0-9_.:@%+=/-]{1,80}$/.test(id)) throw new Error('id 含非法字符')
  const transport = input.transport || 'stdio'
  if (!['stdio', 'streamable-http'].includes(transport)) throw new Error('transport 必须是 stdio 或 streamable-http')
  const config = { serverName, transport }
  const map = value => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      if (Object.values(value).some(item => typeof item !== 'string')) throw new Error('env/headers 的值必须是字符串')
      return { ...value }
    }
    return Object.fromEntries(String(value || '').split('\n').filter(Boolean).map(line => {
      const at = line.indexOf('=')
      if (at <= 0) throw new Error('env/headers 每行必须为 KEY=VALUE')
      return [line.slice(0, at).trim(), line.slice(at + 1)]
    }))
  }
  if (transport === 'stdio') {
    config.command = String(input.command || '').trim()
    if (!config.command) throw new Error('command 不能为空')
    config.args = Array.isArray(input.args) ? input.args.map(String) : String(input.args || '').split('\n').filter(Boolean)
    if (Object.hasOwn(input, 'env')) config.env = map(input.env)
  } else {
    config.url = String(input.url || '').trim()
    if (!/^https?:$/.test(new URL(config.url).protocol)) throw new Error('url 必须为 HTTP(S) 地址')
    if (Object.hasOwn(input, 'headers')) config.headers = map(input.headers)
  }
  if (input.toolCallTimeoutMs !== undefined && input.toolCallTimeoutMs !== '') {
    const timeout = Number(input.toolCallTimeoutMs)
    if (!Number.isSafeInteger(timeout) || timeout < 0) throw new Error('toolCallTimeoutMs 必须为非负整数')
    if (timeout) config.toolCallTimeoutMs = timeout
  }
  return { id, config, level: input.level === 'global' ? 'global' : 'project' }
}

export function createMcpConfig(options = {}) {
  const compose = options.compose || composePatches
  const read = () => {
    const p = paths(options)
    if (path.resolve(p.project) === path.resolve(p.global)) throw new Error('profile 和 global 配置不能是同一文件')
    const files = ['project', 'global'].map(level => {
      const before = readFile(p[level]), doc = parse(before, p[level])
      return { level, file: p[level], before, doc, changed: new Map() }
    })
    const refs = files.flatMap(file => definitions(file.doc, file.level).map(ref => ({ ...ref, file })))
    const base = options.basePatches?.() || []
    const patches = [...base, ...files.flatMap(file => file.doc.toJS()), ...(options.overlays || [])]
    return { p, files, refs, effective: flatten(compose([], patches, () => {})) }
  }
  const listing = snapshot => {
    const s = snapshot || read()
    const rows = s.effective.filter(row => row.name === MCP).map(row => {
      const refs = s.refs.filter(ref => ref.id === row.id), ref = refs.length === 1 ? refs[0] : undefined
      const editable = !!ref && s.effective.filter(entry => entry.id === row.id).length === 1 && !dynamic(ref.node)
      return { ...row, disabled: !!row.disabled, config: row.config || {}, level: ref?.level || 'bundle', managed: !!ref,
        editable, reason: editable ? '' : '配置来自 bundle/overlay、动态 YAML 或重复 id，不能安全编辑' }
    })
    return { rows, paths: { project: s.p.project, global: s.p.global } }
  }
  const locate = (s, id) => {
    const refs = s.refs.filter(ref => ref.id === id)
    if (refs.length !== 1 || s.effective.filter(entry => entry.id === id).length !== 1 || refs[0].node.get('name') !== MCP || dynamic(refs[0].node)) throw new Error('配置目标不唯一或不可安全编辑，请在原配置中处理')
    return refs[0]
  }
  const commit = s => {
    const changes = s.files.map(file => ({ file: file.file, before: file.before, after: file.after ?? renderChanged(file.before, file.changed, file.doc) }))
    for (const change of changes) parse(change.after, change.file)
    const backups = commitFiles(changes, s.p.home)
    return { ...listing(), backups }
  }
  return {
    listServers: () => listing(),
    addServer(input) {
      const row = normalizeRow(input), s = read()
      if (s.effective.some(existing => existing.id === row.id || (existing.name === MCP && existing.config?.serverName === row.config.serverName))) throw new Error('id 或 serverName 已存在')
      const file = s.files.find(file => file.level === row.level)
      file.after = append(file.before, { insert: [{ id: row.id, name: MCP, config: row.config }] })
      return commit(s)
    },
    editServer(input) {
      const row = normalizeRow(input), s = read(), ref = locate(s, row.id)
      if (row.level !== ref.level) throw new Error('编辑不能隐式移动配置层；请在原层保存')
      if (s.effective.some(existing => existing.id !== row.id && existing.name === MCP && existing.config?.serverName === row.config.serverName)) throw new Error('serverName 已存在')
      const overridden = s.files.flatMap(file => file.doc.contents.items).some(node => isMap(node) && !node.has('insert') && node.get('id') === row.id && (!node.get('name') || node.get('name') === MCP) && node.has('config'))
      if (overridden || (options.overlays || []).some(patch => patch.id === row.id && patch.config)) throw new Error('存在 config 覆盖，请在覆盖来源编辑，避免丢失原有字段')
      let config = ref.node.get('config', true)
      if (!isMap(config)) { config = ref.file.doc.createNode({}); ref.node.set('config', config) }
      for (const [key, value] of Object.entries(row.config)) config.set(key, value)
      for (const key of row.config.transport === 'stdio' ? ['url', 'headers'] : ['command', 'args', 'env']) config.delete(key)
      if (!row.config.toolCallTimeoutMs) config.delete('toolCallTimeoutMs')
      ref.file.changed.set(ref.top, ref.top)
      return commit(s)
    },
    removeServer(id) {
      if (!id) throw new Error('id 不能为空')
      const s = read(), ref = locate(s, String(id))
      ref.seq.items.splice(ref.seq.items.indexOf(ref.node), 1)
      ref.file.changed.set(ref.top, ref.seq.items.length || ref.top.items.length > 1 ? ref.top : null)
      for (const file of s.files) for (const node of file.doc.contents.items) {
        if (isMap(node) && !node.has('insert') && node.get('id') === id && (!node.get('name') || node.get('name') === MCP)) file.changed.set(node, null)
      }
      return commit(s)
    },
    setServerEnabled(id, enabled) {
      const s = read()
      locate(s, String(id))
      if ((options.overlays || []).some(patch => patch.id === id && Object.hasOwn(patch, 'disabled'))) throw new Error('启动参数覆盖了启停状态，请先移除该覆盖')
      const file = s.files.at(-1)
      const last = file.doc.contents.items.findLast(node => isMap(node) && !node.has('insert') && node.get('id') === id && (!node.get('name') || node.get('name') === MCP) && node.has('disabled'))
      if (last && !dynamic(last)) { last.set('disabled', !enabled); file.changed.set(last, last) }
      else file.after = append(file.before, { id, name: MCP, disabled: !enabled })
      return commit(s)
    },
  }
}

export const listServers = () => createMcpConfig().listServers()
export const addServer = input => createMcpConfig().addServer(input)
export const editServer = input => createMcpConfig().editServer(input)
export const removeServer = id => createMcpConfig().removeServer(id)
export const setServerEnabled = (id, enabled) => createMcpConfig().setServerEnabled(id, enabled)

export function publicServers(result) {
  return { ...result, rows: result.rows.map(row => {
    const { env, headers } = row.config
    const config = Object.fromEntries(['serverName', 'transport', 'url', 'command', 'args', 'toolCallTimeoutMs'].filter(key => Object.hasOwn(row.config, key)).map(key => [key, row.config[key]]))
    return { ...Object.fromEntries(['id', 'name', 'disabled', 'level', 'managed', 'editable', 'reason'].map(key => [key, row[key]])), config, envKeys: Object.keys(env || {}), headerKeys: Object.keys(headers || {}) }
  }) }
}
