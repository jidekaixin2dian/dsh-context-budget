import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'

const source = fs.readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')

test('classic bundle concatenation and repeated script loads do not declare global bindings', () => {
  const registrations = []
  const context = vm.createContext({ window: { __ModuleLoader__: { load(row) { registrations.push(row) } } } })
  vm.runInContext('const factory = "unrelated plugin";', context)
  vm.runInContext(source + '\n' + source, context)
  vm.runInContext(source, context)
  assert.equal(registrations.length, 3)
  for (const row of registrations) {
    assert.equal(row.id, '@jidekaixin2dian/dsh-toolgate')
    assert.equal(typeof row.factory, 'function')
  }
  assert.equal(vm.runInContext('factory', context), 'unrelated plugin')
})
