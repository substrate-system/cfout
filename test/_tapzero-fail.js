import { test } from '@substrate-system/tapzero'

test('passes', t => {
    t.ok(true, 'this one passes')
})

test('fails', t => {
    t.equal(1, 2, 'one equals two')
})
