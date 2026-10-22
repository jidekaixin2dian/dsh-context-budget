import { canDeleteSkill, createSkill, deleteSkill } from './skills-config.js'
import { projectRoot, skillView } from './host-paths.js'

const OVERRIDE = 'dsh-toolgate-override'
const identity = skill => JSON.stringify([skill.name, skill.provider, skill.path || '', skill.source])

// Discovery remains the registry's job. The provider returns only previously
// resolved definitions, so it never recursively calls skills.get() from list().
export function installSkills(ctx, state, locations, save) {
  let control, disposed = false
  const definitions = new Map()
  const optionsFor = view => ({ ...(view.cwd ? { cwd: view.cwd } : {}), ...(view.scope ? { scope: view.scope } : {}) })
  const snapshot = async view => {
    const options = optionsFor(view)
    if (typeof ctx.skills.snapshot === 'function') return ctx.skills.snapshot(options)
    return { skills: await ctx.skills.list(options), complete: true }
  }
  const applies = (rule, options) => !rule.cwd || rule.cwd === projectRoot(options?.cwd)
  const provider = {
    name: OVERRIDE,
    list(options) {
      return [...definitions.values()].filter(({ rule }) => applies(rule, options)).map(({ def, rule }) => ({
        ...def, provider: OVERRIDE, rank: 0, locator: rule.key,
      }))
    },
    get(candidate) { return definitions.get(candidate.locator)?.def },
  }
  ctx.skills.registerProvider(value => { control = value; return provider })
  const resolve = async (rule, view) => {
    const def = await ctx.skills.get(rule.name, optionsFor(view))
    if (disposed || !def || identity(def) !== rule.identity) return false
    definitions.set(rule.key, { rule, def: { ...def, provider: OVERRIDE, rank: 0, invocation: { modelInvocable: false, userInvocable: false } } })
    return true
  }
  const ready = (async () => {
    for (const rule of state.skillRules) {
      try { await resolve(rule, { cwd: rule.cwd || locations.workspace }) } catch { /* unavailable provider stays unresolved */ }
    }
    // Resolve legacy global names once; persist concrete identities instead of
    // accidentally suppressing a different same-name project skill forever.
    const migrated = state.disabledSkills.length > 0
    for (const name of state.disabledSkills) {
      const def = await ctx.skills.get(name, { cwd: locations.workspace || undefined })
      if (!def || disposed) continue
      const rule = { name, identity: identity(def), cwd: def.source.startsWith('project') ? projectRoot(locations.workspace) : null }
      rule.key = JSON.stringify([rule.identity, rule.cwd])
      if (!state.skillRules.some(existing => existing.key === rule.key)) state.skillRules.push(rule)
      await resolve(rule, { cwd: rule.cwd || locations.workspace })
    }
    if (!disposed) { control.invalidate(); state.disabledSkills = []; if (migrated) save() }
  })()
  // Keep initialization failures observable through list/write requests while
  // preventing a provider failure from becoming an unhandled rejection.
  void ready.catch(error => ctx.logger?.warn?.('Toolgate skill initialization failed: %s', error.message))
  let refreshing = false
  ctx.on('skills/change', () => {
    if (disposed || refreshing) return
    refreshing = true
    void ready.then(async () => {
      let changed = false
      for (const rule of state.skillRules) {
        if (disposed || definitions.has(rule.key)) continue
        changed = await resolve(rule, { cwd: rule.cwd || locations.workspace }) || changed
      }
      if (changed && !disposed) control.invalidate()
    }).catch(error => ctx.logger?.warn?.('Toolgate skill refresh failed: %s', error.message)).finally(() => { refreshing = false })
  })
  const rowsFor = async view => {
    const snap = await snapshot(view)
    const rows = []
    for (const summary of snap.skills) {
      const cached = summary.provider === OVERRIDE ? [...definitions.values()].find(({ rule }) => rule.name === summary.name && applies(rule, view)) : undefined
      const source = cached ? JSON.parse(cached.rule.identity) : null
      const row = source ? { ...summary, provider: source[1], path: source[2], source: source[3] } : summary
      const global = await ctx.skills.get(row.name, { cwd: view.cwd })
      const rootMatches = global?.provider === OVERRIDE ? !!cached : !!global && identity(global) === identity(row)
      const rule = state.skillRules.find(rule => rule.identity === identity(row) && applies(rule, view))
      rows.push({ name: row.name, description: row.description || '', provider: row.provider, path: row.path || null, source: row.source,
        scope: row.source.startsWith('project') ? 'project' : 'user', disabled: !!rule,
        toggleable: rootMatches, deletable: canDeleteSkill(row, { home: locations.home, cwd: view.projectRoot }),
      })
    }
    return { skills: rows.sort((a, b) => a.name.localeCompare(b.name)), complete: snap.complete !== false,
      workspace: view.projectRoot || null, cwd: view.cwd || null, sessionId: view.sessionId, sessions: view.sessions, userRoot: locations.home }
  }
  const selected = async args => {
    const view = skillView(ctx, args), listing = await rowsFor(view)
    const row = listing.skills.find(row => row.name === args.name)
    if (!row || row.provider !== args.provider || row.path !== (args.path || null) || row.source !== args.source) throw new Error('Skill 来源已变化，请刷新后重试')
    return { view, row }
  }
  ctx.effect(() => async () => { disposed = true; await ready; definitions.clear() })
  return {
    async list(args = {}) { await ready; return rowsFor(skillView(ctx, args)) },
    async toggle(args) {
      await ready
      const { view, row } = await selected(args)
      if (!row.toggleable) throw new Error('该 Skill 属于独立作用域，无法用全局 provider 覆盖')
      const cwd = row.source.startsWith('project') ? view.projectRoot : null
      const rule = { name: row.name, identity: identity(row), cwd }
      rule.key = JSON.stringify([rule.identity, cwd])
      const previousRules = [...state.skillRules]
      const previousDefinition = definitions.get(rule.key)
      if (args.enabled !== false) {
        state.skillRules = state.skillRules.filter(existing => existing.key !== rule.key)
        definitions.delete(rule.key)
      } else if (!state.skillRules.some(existing => existing.key === rule.key)) {
        if (!await resolve(rule, view)) throw new Error('Skill 来源已变化，请刷新后重试')
        state.skillRules.push(rule)
      }
      try { save() } catch (error) {
        state.skillRules = previousRules
        if (previousDefinition) definitions.set(rule.key, previousDefinition)
        else definitions.delete(rule.key)
        control.invalidate()
        throw error
      }
      control.invalidate()
      return rowsFor(view)
    },
    async create(args) {
      await ready
      const view = skillView(ctx, args)
      const created = createSkill(args, { home: locations.home, cwd: view.projectRoot })
      control.invalidate()
      return { created, ...await rowsFor(view) }
    },
    async delete(args) {
      await ready
      const { view, row } = await selected(args)
      if (!row.deletable) throw new Error('仅可回收所选工作区或 DSH_HOME 下真实的 .dsh/skills 目录')
      const removed = deleteSkill(row, { home: locations.home, cwd: view.projectRoot })
      state.skillRules = state.skillRules.filter(rule => rule.identity !== identity(row))
      for (const [key, cached] of definitions) if (cached.rule.identity === identity(row)) definitions.delete(key)
      control.invalidate(); save()
      return { removed, ...await rowsFor(view) }
    },
  }
}
