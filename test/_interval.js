// Starts an interval at top level and clears it from inside its own
// callback, using the id returned at top level. A later timer reports
// how many times the callback ran, to show the interval really stopped.
let calls = 0
const id = setInterval(() => {
    calls++
    if (calls < 3) return
    clearInterval(id)
    setTimeout(() => {
        console.log(`# calls ${calls}`)
        console.log('ok 1 - interval cleared')
        globalThis.testsFinished = true
    }, 50)
}, 10)
