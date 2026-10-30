import { test } from '@substrate-system/tapzero'

test('first', t => {
    t.ok(true, 'one is truthy')
    t.equal(1, 1, 'one equals one')
})

test('second', t => {
    t.deepEqual({ a: 1 }, { a: 1 }, 'objects match')
})
