import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { canDeleteSkill, createSkill, deleteSkill } from '../lib/skills-config.js'

test('create and trash a project skill', () => {
  const cwd = process.cwd()
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-skill-'))
  process.chdir(root)
  try {
    const created = createSkill({
      name: 'demo-skill',
      description: 'demo description',
      body: '# Demo\n\nDo the thing.',
      scope: 'project',
    })
    assert.equal(created.scope, 'project')
    const file = path.join(root, '.dsh', 'skills', 'demo-skill', 'SKILL.md')
    assert.equal(fs.existsSync(file), true)
    const text = fs.readFileSync(file, 'utf8')
    assert.match(text, /^---\nname: demo-skill\n/m)
    assert.match(text, /Do the thing\./)

    const removed = deleteSkill({ name: 'demo-skill', scope: 'project' })
    assert.equal(fs.existsSync(path.dirname(created.path)), false)
    assert.equal(fs.existsSync(removed.movedTo), true)
  } finally {
    process.chdir(cwd)
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('reject invalid skill names and duplicate create', () => {
  const cwd = process.cwd()
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-skill-'))
  process.chdir(root)
  try {
    assert.throws(() => createSkill({ name: 'Bad Name', description: 'x', body: '', scope: 'project' }))
    createSkill({ name: 'ok-name', description: 'x', body: '', scope: 'project' })
    assert.throws(() => createSkill({ name: 'ok-name', description: 'x', body: '', scope: 'project' }))
  } finally {
    process.chdir(cwd)
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('custom DSH_HOME and explicit selected workspace are used without changing process cwd', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'toolgate-skill-home-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const old = process.env.DSH_HOME
  process.env.DSH_HOME = path.join(root, 'custom-home')
  t.after(() => { if (old === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = old })
  const user = createSkill({ name: 'user-skill', description: 'test', scope: 'user' })
  assert.equal(user.path, path.join(root, 'custom-home', 'skills', 'user-skill', 'SKILL.md'))
  const cwd = path.join(root, 'selected-project'), location = { home: process.env.DSH_HOME, cwd }
  const project = createSkill({ name: 'project-skill', description: 'test', scope: 'project' }, location)
  assert.equal(project.path, path.join(cwd, '.dsh', 'skills', 'project-skill', 'SKILL.md'))
  assert.throws(() => createSkill({ name: 'no-view', description: 'test', scope: 'project' }, { home: root, cwd: undefined }), /选择/)
  const summary = { name: 'project-skill', source: 'project-dsh', path: project.path }
  assert.equal(canDeleteSkill(summary, location), true)
  assert.equal(canDeleteSkill({ ...summary, source: 'project-agents' }, location), false)
  assert.equal(canDeleteSkill({ ...summary, path: user.path }, location), false)
})

test('Skill directory links and trash links cannot redirect a write or move outside the selected root', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'toolgate-skill-link-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const outside = path.join(root, 'outside'), home = path.join(root, 'home'), skills = path.join(home, 'skills')
  fs.mkdirSync(outside); fs.mkdirSync(skills, { recursive: true })
  fs.writeFileSync(path.join(outside, 'SKILL.md'), 'preserve')
  fs.symlinkSync(outside, path.join(skills, 'linked'), process.platform === 'win32' ? 'junction' : 'dir')
  assert.throws(() => deleteSkill({ name: 'linked', scope: 'user' }, { home }), /链接/)
  createSkill({ name: 'normal', description: 'test', scope: 'user' }, { home })
  fs.symlinkSync(outside, path.join(skills, '.trash'), process.platform === 'win32' ? 'junction' : 'dir')
  assert.throws(() => deleteSkill({ name: 'normal', scope: 'user' }, { home }), /链接/)
  assert.equal(fs.readFileSync(path.join(outside, 'SKILL.md'), 'utf8'), 'preserve')
})

