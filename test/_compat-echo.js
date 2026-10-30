// Reports the effect of two compatibility flags: nodejs_compat (process
// is defined) and no_global_navigator (navigator is not)
const compat = {
    process: typeof globalThis.process !== 'undefined',
    navigator: typeof globalThis.navigator !== 'undefined',
}
console.log('# compat ' + JSON.stringify(compat))
globalThis.testsFinished = true
