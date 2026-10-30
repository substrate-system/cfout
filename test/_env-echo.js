// read at module top level, before any test runs
console.log('# env ' + JSON.stringify(globalThis.env))
globalThis.testsFinished = true
