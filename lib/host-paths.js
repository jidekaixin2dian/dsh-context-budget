import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'

export function projectRoot(cwd) {
  if (!cwd) return undefined
  const original = path.resolve(cwd)
  for (let current = original; ; current = path.dirname(current)) {
    if (fs.existsSync(path.join(current, '.git'))) return current
    if (path.dirname(current) === current) return original
  }
}

export function serviceOn(ctx, name) {
  try { return ctx?.get?.(name) ?? ctx?.[name] } catch { return undefined }
}

export function hostPaths(ctx) {
  const profile = serviceOn(ctx, 'profileContext')
  const homePath = serviceOn(ctx, 'dshHomePath')
  const home = profile?.home || (typeof homePath === 'function' ? homePath() : undefined)
    || process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
  return { home: path.resolve(home), profileDir: profile?.dir || process.env.DSH_TOOLGATE_PROFILE_DIR,
    profilePatch: profile?.patchPath, workspace: profile?.cwd || serviceOn(ctx, 'workingDirectory')?.defaultDirectory || null }
}

export function skillView(ctx, args = {}) {
  const agents = serviceOn(ctx, 'agents')?.list?.() || []
  const directory = serviceOn(ctx, 'workingDirectory')
  const sessions = agents.filter(agent => agent?.session).map(agent => ({
    id: String(agent.session.id), label: String(agent.session.id),
    cwd: directory?.get?.(agent.session) || agent.session.header?.cwd || null, agent,
  }))
  const selected = args.sessionId ? sessions.find(row => row.id === args.sessionId) : undefined
  if (args.sessionId && !selected) throw new Error('所选会话已不存在，请刷新后重选')
  const cwd = selected?.cwd || (!args.sessionId ? hostPaths(ctx).workspace : null)
  return { cwd: cwd ? path.resolve(cwd) : undefined, projectRoot: projectRoot(cwd), scope: selected?.agent, sessionId: selected?.id || null,
    sessions: sessions.map(({ agent: _agent, ...row }) => row) }
}
