// Skill file create/delete for the two writable skill roots:
//   ~/.dsh/skills            (user)
//   <cwd>/.dsh/skills       (project)
// Deletion moves the directory into <root>/.trash, never hard-deletes.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function roots(location = {}) {
  return {
    user: path.join(location.home || process.env.DSH_HOME || path.join(os.homedir(), '.dsh'), 'skills'),
    project: Object.hasOwn(location, 'cwd') && !location.cwd ? null : path.join(location.cwd || process.cwd(), '.dsh', 'skills'),
  }
}

function rootFor(scope, location) {
  const r = roots(location)
  const key = scope === 'project' ? 'project' : 'user'
  if (!r[key]) throw new Error('请先选择有工作目录的会话，再操作项目 Skill')
  return { key, dir: r[key] }
}

function safeDirectory(root, name) {
  const target = path.join(root, name)
  const canonicalRoot = fs.realpathSync(root)
  if (fs.lstatSync(target).isSymbolicLink() || fs.realpathSync(target) !== path.join(canonicalRoot, name)) throw new Error('拒绝操作指向 Skill 根目录外的链接')
  return target
}

export function canDeleteSkill(skill, location) {
  if (!['user-dsh', 'project-dsh'].includes(skill.source) || !skill.path || !NAME_RE.test(skill.name)) return false
  try {
    const { dir } = rootFor(skill.source === 'project-dsh' ? 'project' : 'user', location)
    const expected = path.join(dir, skill.name, 'SKILL.md')
    if (path.resolve(skill.path) !== path.resolve(expected)) return false
    safeDirectory(dir, skill.name)
    return fs.lstatSync(expected).isFile() && !fs.lstatSync(expected).isSymbolicLink()
  } catch { return false }
}

export function createSkill(input, location) {
  const name = String(input?.name || '').trim()
  const description = String(input?.description || '').trim()
  const body = String(input?.body || '').replace(/\r\n/g, '\n').trim()
  if (!NAME_RE.test(name)) throw new Error('Skill 名必须是 kebab-case（小写字母/数字/-）')
  if (!description) throw new Error('description 不能为空')
  const { key, dir } = rootFor(input?.scope, location)
  const target = path.join(dir, name)
  if (fs.existsSync(target)) throw new Error('Skill 已存在: ' + name)
  fs.mkdirSync(dir, { recursive: true })
  fs.mkdirSync(target)
  safeDirectory(dir, name)
  const content = [
    '---',
    'name: ' + name,
    'description: ' + JSON.stringify(description),
    '---',
    '',
    body,
    '',
  ].join('\n')
  fs.writeFileSync(path.join(target, 'SKILL.md'), content, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
  return { name, scope: key, path: path.join(target, 'SKILL.md') }
}

export function deleteSkill(input, location) {
  const name = String(input?.name || '').trim()
  if (!NAME_RE.test(name)) throw new Error('Skill 名非法')
  const scope = input?.scope === 'project' ? 'project' : 'user'
  const { dir } = rootFor(scope, location)
  const target = path.join(dir, name)
  if (!fs.existsSync(target)) throw new Error('Skill 不存在于 ' + dir + ': ' + name)
  safeDirectory(dir, name)
  if (input.path && path.resolve(input.path) !== path.resolve(path.join(target, 'SKILL.md'))) throw new Error('Skill 来源路径已变化，请刷新')
  const trash = path.join(dir, '.trash')
  fs.mkdirSync(trash, { recursive: true })
  if (fs.lstatSync(trash).isSymbolicLink() || fs.realpathSync(trash) !== path.join(fs.realpathSync(dir), '.trash')) throw new Error('回收站不能是外部链接')
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const dest = path.join(trash, stamp + '-' + randomUUID() + '-' + name)
  fs.renameSync(target, dest)
  return { name, scope, movedTo: dest }
}

