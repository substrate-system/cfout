# 04: Global-scope timer shim: real tapzero suites

**What to build:** a plain tapzero bundle runs under cfout. workerd
evaluates module top level in global scope, where timers are forbidden,
and tapzero's first `test()` call schedules a `setTimeout`, so without
this every tapzero bundle throws immediately.

Before importing the user module, the entry worker replaces
`setTimeout` and `setInterval` with versions that queue the call. After
the import resolves it restores the originals and replays the queue
with the real timers, now inside request context. Replayed callbacks
are wrapped so a throw is caught rather than silently cancelling the
request; turning that catch into a reported uncaught error is 05.
Shape from the prototype, trimmed to the decision:

```js
const real = globalThis.setTimeout
const queued = []
globalThis.setTimeout = (fn, ms, ...args) => {
    queued.push([fn, ms, args])
    return -1
}
await import(userModule)          // top level runs here, timers queued
globalThis.setTimeout = real
for (const [fn, ms, args] of queued) {
    real(() => { try { fn(...args) } catch (err) { reportUncaught(err) } }, ms)
}
```

`crypto.getRandomValues`, `crypto.randomUUID` and `fetch` at top level
are deliberately not shimmed.

Fixtures import `@substrate-system/tapzero` and are bundled by the test
helper. tapzero ends with a trailing `1..N` plan, so these runs
complete through the plan rule from 03.

**Blocked by:** 03

**Touches:** `src/entry-worker.ts` (timer queue and replay),
`test/index.ts`, new tapzero fixtures under `test/`

**Status:** done

- [x] A passing tapzero suite of several tests exits 0 with an `ok`
      line per assertion on stdout
- [x] A tapzero test that awaits a `setTimeout` promise passes and the
      suite exits 0
- [x] A module that calls `setInterval` at top level and clears it from
      inside the callback completes
- [x] A tapzero suite with one failing assertion exits 1 with a
      `not ok` line on stdout
