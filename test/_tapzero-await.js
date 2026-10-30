import { test } from '@substrate-system/tapzero'

test('waits for a timer', async t => {
    const value = await new Promise(resolve => {
        setTimeout(() => resolve('later'), 20)
    })
    t.equal(value, 'later', 'the timer resolved the promise')
})
