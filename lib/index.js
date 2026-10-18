import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'dsh-context-budget'
export const inject = ['tools', 'skills', 'webServer']

import { groupOf, isDisabled, labelOf, matchesDisabled, normalizeDisabled } from './groups.js'
import { addServer, editServer, listServers, removeServer, setServerEnabled } from './mcp-config.js'

// Conservative, serialized-schema based estimate. It is deliberately labelled
// approximate in the UI; the real number comes from the provider tokenizer.
const BYTES_PER_TOKEN = 3.4

const state = {
  disabled: [],
  disabledSkills: [],
  overrides: new Map(),
  applied: new Map(),
  errors: new Map(),
  applying: false,
  stale: false,
  skillDefs: new Map(),
  skillControl: null,
  skillsBusy: false,
  // Counts/tokens for the full agent-visible tool set. The root tools view
  // only contains global registrations; preset-scoped core tools are only
  // visible through an agent, so the first real request records the full set.
  bestSchemas: null,
}
let stateFile = ''
let rootCtx = null

function resolveStateFile(ctx) {
  try {
    const home = ctx.get?.('dshHomePath')
    if (typeof home === 'function') {
      const p = home('context-budget.json')
      if (typeof p === 'string' && p) return p
    }
  } catch { /* fall through */ }
  return path.join(os.homedir(), '.dsh', 'context-budget.json')
}

function loadState() {
  try {
    const parsed = JSON.parse(fs.readFileSync(stateFile, 'utf8'))
    state.disabled = normalizeDisabled(parsed?.disabled)
    state.disabledSkills = Array.isArray(parsed?.disabledSkills)
      ? parsed.disabledSkills.filter(name => typeof name === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name))
      : []
  } catch {
    state.disabled = []
    state.disabledSkills = []
  }
}

function saveState() {
  try {
    fs.mkdirSync(path.dirname(stateFile), { recursive: true })
    const tmp = stateFile + '.tmp'
    fs.writeFileSync(tmp, JSON.stringify({
      disabled: state.disabled,
      disabledSkills: state.disabledSkills,
    }, null, 2), 'utf8')
    fs.renameSync(tmp, stateFile)
  } catch (err) {
    console.warn('[dsh-context-budget] failed to persist settings:', err?.message || err)
  }
}

function tokensOf(value) {
  try {
    return Math.max(1, Math.ceil(JSON.stringify(value).length / BYTES_PER_TOKEN))
  } catch {
    return 0
  }
}

function fmt(n) {
  const v = Number(n) || 0
  if (v >= 10000) return (v / 10000).toFixed(1) + '万'
  return String(Math.round(v))
}

async function skillCatalog(ctx) {
  try {
    const skills = ctx.get?.('skills') ?? ctx.skills
    if (!skills || typeof skills.list !== 'function') return []
    const list = await Promise.resolve(skills.list({ cwd: process.cwd() }))
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

async function groupReport(ctx) {
  const schemas = state.bestSchemas || ctx.tools.schemas()
  const groups = new Map()
  const ensure = (id, toggle = true) => {
    if (!groups.has(id)) groups.set(id, { id, label: labelOf(id), count: 0, tokens: 0, toggle })
    return groups.get(id)
  }
  for (const schema of schemas) {
    const group = groupOf(schema.name)
    const entry = ensure(group, group !== 'core')
    entry.count += 1
    entry.tokens += tokensOf(schema)
  }
  const catalog = await skillCatalog(ctx)
  let catalogTokens = 0
  if (catalog.length > 0) {
    const entry = ensure('skills')
    entry.count = catalog.length
    const catalogBytes = catalog.reduce((sum, item) => {
      return sum + String(item?.name || '').length + String(item?.description || '').length
    }, 0)
    catalogTokens = Math.ceil(catalogBytes / BYTES_PER_TOKEN)
    // `skill` schema itself is already counted above; add catalog text.
    entry.tokens += catalogTokens
  }
  const list = [...groups.values()].sort((a, b) => {
    if (a.id === 'core') return 1
    if (b.id === 'core') return -1
    if (a.id.startsWith('mcp:') !== b.id.startsWith('mcp:')) return a.id.startsWith('mcp:') ? -1 : 1
    return b.tokens - a.tokens
  })
  const full = list.reduce((sum, item) => sum + item.tokens, 0)
  const saved = list.filter(item => isDisabled(item.id, state.disabled))
    .reduce((sum, item) => sum + item.tokens, 0)
  const globalNames = new Set(ctx.tools.schemas().map(schema => schema.name))
  const scoped = schemas.filter(schema => !globalNames.has(schema.name)
    && schema.name.startsWith('mcp__')).length
  return {
    groups: list,
    totals: { full, current: Math.max(0, full - saved), saved },
    disabled: [...state.disabled],
    catalogTokens,
    scoped,
    skills: { count: catalog.length },
  }
}

function sessionIdOf(agent) {
  return String(agent?.session?.id || agent?.sessionId || agent?.id || 'anonymous')
}

function serviceOn(agentCtx, service) {
  try {
    if (agentCtx && typeof agentCtx.get === 'function') return agentCtx.get(service)
    return agentCtx?.[service]
  } catch {
    return undefined
  }
}

function effectiveDisabled(agent) {
  const sid = sessionIdOf(agent)
  return state.overrides.has(sid) ? state.overrides.get(sid) : state.disabled
}

function applyToAgent(agent) {
  const ag = agent?.agent ?? agent
  if (!ag || !ag.ctx) return
  const sid = sessionIdOf(ag)
  if (state.stale) {
    clearApplied()
    state.stale = false
  }
  if (!state.bestSchemas) {
    try {
      const visible = rootCtx.tools.schemas(ag)
      if (Array.isArray(visible) && visible.length > 0) state.bestSchemas = visible
    } catch { /* tool view not ready yet */ }
  } else {
    try {
      const visible = rootCtx.tools.schemas(ag)
      if (Array.isArray(visible) && visible.length > state.bestSchemas.length) state.bestSchemas = visible
    } catch { /* tool view not ready yet */ }
  }
  const disabled = effectiveDisabled(ag)
  const key = disabled.slice().sort().join(',')
  const previous = state.applied.get(sid)
  if (previous && previous.key === key) return
  if (previous) {
    state.applying = true
    try { previous.dispose() } catch { /* stale agent scope */ } finally { state.applying = false }
    state.applied.delete(sid)
  }
  if (disabled.length === 0) {
    state.errors.delete(sid)
    return
  }
  const agentTools = serviceOn(ag.ctx, 'tools')
  if (!agentTools || typeof agentTools.restrict !== 'function') {
    state.errors.set(sid, 'agent ctx has no restrictable tools service')
    return
  }
  const full = rootCtx.tools.schemas()
  const deny = full.map(schema => schema.name).filter(n => matchesDisabled(n, disabled))
  if (deny.length === 0) return
  state.applying = true
  try {
    const dispose = agentTools.restrict({ deny })
    state.applied.set(sid, { key, dispose })
    state.errors.delete(sid)
  } catch (err) {
    state.errors.set(sid, String(err?.message || err))
  } finally {
    state.applying = false
  }
}

function clearApplied() {
  state.applying = true
  try {
    for (const entry of state.applied.values()) {
      try { entry.dispose() } catch { /* agent may already be gone */ }
    }
    state.applied.clear()
    state.errors.clear()
  } finally {
    state.applying = false
  }
}

async function reportFor(agent) {
  const full = await groupReport(rootCtx)
  let current = full.totals.full
  let currentCount = rootCtx.tools.schemas().length
  if (agent?.ctx) {
    try {
      const visible = rootCtx.tools.schemas(agent)
      currentCount = visible.length
      current = 0
      for (const schema of visible) current += tokensOf(schema)
      // Preserve the full skill-catalog estimate when `skill` is still visible.
      if (visible.some(schema => schema.name === 'skill')) current += full.catalogTokens
    } catch { /* fall back to global estimate */ }
  }
  const overridden = state.overrides.has(sessionIdOf(agent))
  const disabled = effectiveDisabled(agent)
  const lines = []
  lines.push('Context budget' + (overridden ? '（本会话覆盖）' : ''))
  lines.push('完整: ' + fmt(full.totals.full) + ' tokens / ' + fullCount(full) + ' 个工具')
  lines.push('当前: ' + fmt(current) + ' tokens / ' + currentCount + ' 个工具')
  lines.push('节省: ' + fmt(Math.max(0, full.totals.full - current)) + ' tokens')
  lines.push('隐藏: ' + (disabled.length ? disabled.join(', ') : '无'))
  lines.push('')
  for (const g of full.groups) {
    lines.push('- ' + g.id + ' (' + g.label + '): ' + g.count + ' 个，约 ' + fmt(g.tokens) + ' tokens' + (isDisabled(g.id, disabled) ? ' [已隐藏]' : ''))
  }
  lines.push('')
  lines.push('用 action=session + disabled=[...] 只改本会话；action=reset 恢复默认。')
  return lines.join('\n')
}

function fullCount(report) {
  return report.groups.reduce((sum, g) => sum + g.count, 0)
}

function readBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', chunk => {
      const text = String(chunk)
      size += text.length
      if (size > limit) {
        reject(new Error('request body too large'))
        return
      }
      chunks.push(text)
    })
    req.on('end', () => resolve(chunks.join('')))
    req.on('error', reject)
  })
}

const SKILL_OVERRIDE = 'dsh-context-budget-override'
const SKILL_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

async function snapshotSkills(ctx) {
  try {
    const skills = ctx.get?.('skills') ?? ctx.skills
    if (!skills) return { skills: [], complete: false }
    if (typeof skills.snapshot === 'function') {
      const snap = await Promise.resolve(skills.snapshot({}))
      return { skills: Array.isArray(snap?.skills) ? snap.skills : [], complete: snap?.complete !== false }
    }
    const list = await Promise.resolve(skills.list({ cwd: process.cwd() }))
    return { skills: Array.isArray(list) ? list : [], complete: true }
  } catch {
    return { skills: [], complete: false }
  }
}

async function ensureSkillOverrides() {
  if (state.skillsBusy) return
  state.skillsBusy = true
  try {
    let changed = false
    for (const name of [...state.disabledSkills]) {
      if (state.skillDefs.has(name)) continue
      const def = await rootCtx.skills.get(name)
      if (!def) continue
      state.skillDefs.set(name, {
        ...def,
        provider: SKILL_OVERRIDE,
        rank: 0,
        invocation: { modelInvocable: false, userInvocable: false },
      })
      changed = true
    }
    for (const name of [...state.skillDefs.keys()]) {
      if (state.disabledSkills.includes(name)) continue
      state.skillDefs.delete(name)
      changed = true
    }
    if (changed && state.skillControl) state.skillControl.invalidate()
  } catch (err) {
    console.warn('[dsh-context-budget] skill override failed:', err?.message || err)
  } finally {
    state.skillsBusy = false
  }
}

async function setSkillEnabled(name, enabled) {
  const skillName = String(name || '').trim()
  if (!SKILL_NAME_RE.test(skillName)) throw new Error('Skill 名必须是 kebab-case')
  if (enabled) state.disabledSkills = state.disabledSkills.filter(n => n !== skillName)
  else if (!state.disabledSkills.includes(skillName)) state.disabledSkills.push(skillName)
  saveState()
  await ensureSkillOverrides()
  if (state.skillControl) state.skillControl.invalidate()
}

async function listSkillsForUi(ctx) {
  const snap = await snapshotSkills(ctx)
  const rows = snap.skills.map(s => ({
    name: s.name,
    description: s.description || '',
    provider: s.provider || '',
    source: s.source || '',
    disabled: state.disabledSkills.includes(s.name),
  }))
  const known = new Set(rows.map(r => r.name))
  for (const name of state.disabledSkills) {
    if (!known.has(name)) rows.push({ name, description: '', provider: '', source: '', disabled: true })
  }
  rows.sort((a, b) => a.name.localeCompare(b.name))
  return { skills: rows, complete: snap.complete }
}

export function apply(ctx) {
  rootCtx = ctx
  stateFile = resolveStateFile(ctx)
  loadState()

  const skillProvider = {
    name: SKILL_OVERRIDE,
    async list() {
      return [...state.skillDefs.values()].map(def => ({
        name: def.name,
        description: def.description,
        ...(def.whenToUse !== undefined ? { whenToUse: def.whenToUse } : {}),
        invocation: def.invocation,
        source: def.source,
        provider: SKILL_OVERRIDE,
        rank: 0,
        ...(def.path !== undefined ? { path: def.path } : {}),
        locator: def.name,
      }))
    },
    async get(candidate) {
      return state.skillDefs.get(candidate?.name)
    },
  }
  try {
    ctx.skills.registerProvider(control => {
      state.skillControl = control
      const timer = setTimeout(() => { void ensureSkillOverrides() }, 0)
      if (typeof timer?.unref === 'function') timer.unref()
      return skillProvider
    })
  } catch (err) {
    console.warn('[dsh-context-budget] skill provider registration failed:', err?.message || err)
  }
  ctx.on('skills/change', () => {
    if (!state.skillsBusy) void ensureSkillOverrides()
  })

  const tool = defineTool({
    name: 'context_budget',
    description: [
      'Inspect or shrink this session context by hiding tool groups (MCP/Skill/memory/schedule).',
      'This changes the very next request, is reversible, and does not restart MCP processes.',
      'Use action=status first. Use action=session with disabled groups for a session-only override,',
      'or action=reset to fall back to the global setting. Global settings live in Settings > Context budget.',
    ].join(' '),
    parameters: {
      action: {
        type: 'string',
        required: true,
        description: 'status | session | reset',
      },
      disabled: {
        type: 'array',
        items: { type: 'string' },
        description: 'Groups to hide: mcp:<server>, mcp (all MCP), skills, memory, schedule. Empty means show all.',
      },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: String(value) }],
    },
    async execute(args, exec) {
      const agent = exec.agent
      if (!agent) return 'No active agent context; context_budget only works inside a session.'
      const action = String(args.action || 'status').trim().toLowerCase()
      const sid = sessionIdOf(agent)
      if (action === 'status') return reportFor(agent)
      if (action === 'reset') {
        state.overrides.delete(sid)
        applyToAgent(agent)
        return '已恢复全局上下文预算。\n\n' + await reportFor(agent)
      }
      if (action === 'session') {
        const disabled = normalizeDisabled(args.disabled)
        state.overrides.set(sid, disabled)
        applyToAgent(agent)
        return '已应用本会话覆盖：' + (disabled.length ? disabled.join(', ') : '全部显示') +
          '\n\n' + await reportFor(agent)
      }
      return 'Unknown action "' + action + '". Use status, session or reset.'
    },
  })
  ctx.tools.register(tool)

  // Every request passes here before prompt assembly. Applying the restriction
  // in this hook means the schemas disappear without touching any config or
  // restarting the MCP client process.
  ctx.on('agent/pre-step', (agent, next) => {
    try { applyToAgent(agent) } catch (err) {
      console.warn('[dsh-context-budget] apply failed:', err?.message || err)
    }
    return typeof next === 'function' ? next() : undefined
  })

  // Workflow/subagent creation can begin its first step before a pre-step
  // listener attached at the root has run. Apply once at creation too, then
  // re-check on the next tick when the child's tool scope is fully installed.
  ctx.on('agent/created', (agent) => {
    try { applyToAgent(agent) } catch { /* tools not installed yet */ }
    const timer = setTimeout(() => {
      try { applyToAgent(agent) } catch (err) {
        console.warn('[dsh-context-budget] child apply failed:', err?.message || err)
      }
    }, 0)
    if (typeof timer?.unref === 'function') timer.unref()
  })

  // Last-resort catch for workflow children whose first step is already in
  // flight when creation handlers run. `applyToAgent` is idempotent per key.
  ctx.on('agent/status', (agent) => {
    try { applyToAgent(agent) } catch { /* not a scoped agent event */ }
  })

  // Dynamic MCP managers (community dsh-mcp-manager, lazy-mcp) add/remove
  // agent-scoped tools at runtime. Rebuild the baseline and re-apply the
  // restriction on the next step; ignore the events caused by our own
  // restrict()/dispose() calls to avoid a churn loop.
  ctx.on('tools/change', () => {
    if (state.applying) return
    state.stale = true
    state.bestSchemas = null
  })

  const webServer = ctx.webServer ?? (() => { try { return ctx.get('webServer') } catch { return undefined } })()
  if (webServer) {
    ctx.effect(() => webServer.register({
      kind: 'exact',
      path: '/dsh-context-budget/api',
      handler: async (req, res) => {
        const send = (code, value) => {
          res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' })
          res.end(JSON.stringify(value))
        }
        const header = (name) => {
          const value = req.headers?.[name]
          return Array.isArray(value) ? value[0] ?? '' : value ?? ''
        }
        try {
          if (String(req.method || 'POST').toUpperCase() !== 'POST') return send(405, { ok: false, error: 'method not allowed' })
          if (header('x-dsh-plugin') !== 'dsh-context-budget') return send(403, { ok: false, error: 'missing plugin gate header' })
          const origin = header('origin')
          if (origin) {
            const host = header('host') || ''
            let same = false
            try {
              const u = new URL(origin)
              same = /^(localhost|127\.0\.0\.1|\[::1\])$/i.test(u.hostname) || u.host === host
            } catch { /* rejected below */ }
            if (!same) return send(403, { ok: false, error: 'cross-origin request rejected' })
          }
          let payload = {}
          try { payload = JSON.parse((await readBody(req)) || '{}') } catch { /* empty body */ }
          const op = String(payload.op || '')
          if (op === 'status') return send(200, { ok: true, ...(await groupReport(ctx)),
            applied: [...state.applied.keys()], errors: Object.fromEntries(state.errors) })
          if (op === 'set') {
            state.disabled = normalizeDisabled(payload.disabled)
            saveState()
            clearApplied()
            return send(200, { ok: true, ...(await groupReport(ctx)) })
          }
          if (op === 'mcp-list') {
            return send(200, { ok: true, ...listServers() })
          }
          if (op === 'mcp-add') {
            try {
              return send(200, { ok: true, ...addServer(payload.row || payload) })
            } catch (err) {
              return send(400, { ok: false, error: String(err?.message || err) })
            }
          }
          if (op === 'mcp-edit') {
            try {
              return send(200, { ok: true, ...editServer(payload.row || payload) })
            } catch (err) {
              return send(400, { ok: false, error: String(err?.message || err) })
            }
          }
          if (op === 'mcp-remove') {
            try {
              return send(200, { ok: true, ...removeServer(payload.id) })
            } catch (err) {
              return send(400, { ok: false, error: String(err?.message || err) })
            }
          }
          if (op === 'mcp-enabled') {
            try {
              return send(200, { ok: true, ...setServerEnabled(payload.id, payload.enabled !== false) })
            } catch (err) {
              return send(400, { ok: false, error: String(err?.message || err) })
            }
          }
          if (op === 'skills-list') {
            return send(200, { ok: true, ...(await listSkillsForUi(ctx)) })
          }
          if (op === 'skill-toggle') {
            try {
              await setSkillEnabled(payload.name, payload.enabled !== false)
              return send(200, { ok: true, ...(await listSkillsForUi(ctx)) })
            } catch (err) {
              return send(400, { ok: false, error: String(err?.message || err) })
            }
          }
          return send(200, { ok: false, error: 'unknown operation: ' + op })
        } catch (err) {
          send(500, { ok: false, error: String(err?.message || err) })
        }
      },
    }), 'dsh-context-budget: api route')
  }
}
