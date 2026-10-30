// Captures setTimeout at top level, as some bundled dependencies do,
// and calls it after the queued timers have been replayed. The plan
// line is only printed if the captured reference schedules a real timer.
const st = globalThis.setTimeout
console.log('ok 1 - a')
setTimeout(() => {
    st(() => console.log('1..1'), 10)
}, 5)
