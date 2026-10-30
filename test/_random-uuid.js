// Generating random values is not allowed in global scope. cfout does
// not shim it, so the runtime's own error should fail the run.
console.log('# before randomUUID')
console.log('# ' + crypto.randomUUID())
