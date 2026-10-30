// A timer set at top level whose callback throws once it is replayed.
console.log('# before the timer')

setTimeout(() => {
    throw new Error('thrown from a timer')
}, 10)
