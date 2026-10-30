// read at module top level, before any test runs
console.log('# env ' + JSON.stringify(globalThis.env ?? null))
globalThis.testsFinished = true
