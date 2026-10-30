import assert from 'node:assert'

assert.strictEqual(1 + 1, 2)
console.log('ok 1 - node:assert works')
globalThis.testsFinished = true
