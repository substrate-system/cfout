// Prints a line, then never finishes. Module scope cannot start timers,
// so a `then` export is used to run code once the import resolves,
// inside the request, where an interval keeps the run alive.
console.log('ok 1 - before the hang')

export function then (resolve) {
    setInterval(() => {}, 100)
    resolve()
}
