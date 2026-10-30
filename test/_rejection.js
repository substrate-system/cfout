// An async function rejects after awaiting a timer and nothing handles
// it. workerd does not report a rejection made while the module is still
// evaluating, so this one happens after the import resolves.
console.log('# before the rejection')

async function later () {
    await new Promise(resolve => setTimeout(resolve, 10))
    throw new Error('nobody caught this')
}

later()
