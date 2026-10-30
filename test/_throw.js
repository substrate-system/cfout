// Throws while the module evaluates, so the dynamic import rejects.
console.log('# before the throw')

function explode () {
    throw new Error('boom at top level')
}

explode()
