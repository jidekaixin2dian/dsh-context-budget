import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createSkill, deleteSkill } from '../lib/skills-config.js'

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

