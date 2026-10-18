// Pure grouping rules. Kept dependency-free so node --test can exercise them
// without loading the DSH host or @deepseek-ai/dsh-tools.
export const FIXED_LABELS = {
  skills: 'Skill 目录',
  memory: '记忆工具',
  schedule: '定时任务',
}
export const CORE_LABEL = '核心工具'

export function groupOf(toolName) {
  const n = String(toolName || '')
  if (n.startsWith('mcp__')) {
    const rest = n.slice(5)
    const cut = rest.indexOf('__')
    const server = cut > 0 ? rest.slice(0, cut) : 'other'
    return 'mcp:' + (server.toLowerCase().replace(/[^a-z0-9_-]/g, '_').slice(0, 32) || 'other')
  }
  if (n === 'skill') return 'skills'
  if (n.startsWith('mnemon_')) return 'memory'
  if (n.startsWith('schedule_')) return 'schedule'
  return 'core'
}

export function labelOf(group) {
  if (group === 'core') return CORE_LABEL
  if (group.startsWith('mcp:')) return 'MCP · ' + group.slice(4)
  return FIXED_LABELS[group] || group
}

export function normalizeDisabled(value) {
  if (!Array.isArray(value)) return []
  const out = new Set()
  for (const raw of value) {
    let id = String(raw || '').trim().toLowerCase()
    // Migrate the pre-market fixed groups to generic MCP server ids.
    if (id === 'rea') id = 'mcp:rea'
    if (id === 'mcp_other') id = 'mcp:other'
    if (id === 'mcp') {
      out.add('mcp')
      continue
    }
    if (/^mcp:[a-z0-9_-]{1,32}$/.test(id)) {
      out.add(id)
      continue
    }
    if (Object.hasOwn(FIXED_LABELS, id)) out.add(id)
  }
  return [...out]
}

export function isDisabled(group, disabled) {
  if (group === 'core') return false
  return disabled.includes(group) || (group.startsWith('mcp:') && disabled.includes('mcp'))
}

export function matchesDisabled(toolName, disabled) {
  return isDisabled(groupOf(toolName), disabled)
}
