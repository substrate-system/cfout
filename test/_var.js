const env = globalThis.env
const passed = Boolean(env && env.FOO === 'bar')
console.log(`${passed ? 'ok' : 'not ok'} 1 - env.FOO is bar`)
globalThis.testsFinished = true
