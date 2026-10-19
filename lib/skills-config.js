// Skill file create/delete for the two writable skill roots:
//   ~/.dsh/skills            (user)
//   <cwd>/.dsh/skills       (project)
// Deletion moves the directory into <root>/.trash, never hard-deletes.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function roots() {
  return {
    user: path.join(os.homedir(), '.dsh', 'skills'),
    project: path.join(process.cwd(), '.dsh', 'skills'),
  }
}

function rootFor(scope) {
  const r = roots()
  const key = scope === 'project' ? 'project' : 'user'
  return { key, dir: r[key] }
}

export function createSkill(input) {
  const name = String(input?.name || '').trim()
  const description = String(input?.description || '').trim()
  const body = String(input?.body || '').replace(/\r\n/g, '\n').trim()
  if (!NAME_RE.test(name)) throw new Error('Skill 名必须是 kebab-case（小写字母/数字/-）')
  if (!description) throw new Error('description 不能为空')
  const { key, dir } = rootFor(input?.scope)
  const target = path.join(dir, name)
  if (fs.existsSync(target)) throw new Error('Skill 已存在: ' + name)
  fs.mkdirSync(target, { recursive: true })
  const content = [
    '---',
    'name: ' + name,
    'description: ' + JSON.stringify(description),
    '---',
    '',
    body,
    '',
  ].join('\n')
  fs.writeFileSync(path.join(target, 'SKILL.md'), content, 'utf8')
  return { name, scope: key, path: path.join(target, 'SKILL.md') }
}

export function deleteSkill(input) {
  const name = String(input?.name || '').trim()
  if (!NAME_RE.test(name)) throw new Error('Skill 名非法')
  const scope = input?.scope === 'project' ? 'project' : 'user'
  const { dir } = rootFor(scope)
  const target = path.join(dir, name)
  if (!fs.existsSync(target)) throw new Error('Skill 不存在于 ' + dir + ': ' + name)
  const trash = path.join(dir, '.trash')
  fs.mkdirSync(trash, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const dest = path.join(trash, stamp + '-' + name)
  fs.renameSync(target, dest)
  return { name, scope, movedTo: dest }
}

