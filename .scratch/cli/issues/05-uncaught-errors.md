# 05: Uncaught errors

**What to build:** completion rule 3. Any of these ends the run:

- a throw during module evaluation (the dynamic import rejects),
- an `unhandledrejection` event,
- a throw from a replayed queued timer callback (the wrapper from 04).

On each, the wrapper emits one `not ok - <message>` line on stdout,
writes the message and stack to stderr, ends the run, and cfout exits 1.

The runtime's own global-scope errors are not shimmed and must surface
through this path: `crypto.randomUUID()` at module top level should
fail the run with workerd's error message, which points at the fix.

**Blocked by:** 04

**Touches:** `src/entry-worker.ts` (import rejection,
`unhandledrejection` listener, `reportUncaught` for replayed
callbacks), `test/index.ts`, new fixtures under `test/`

**Status:** done

- [x] A module that throws at top level exits 1, with a `not ok` line
      on stdout and the error message and stack on stderr
- [x] A module with an unhandled promise rejection exits 1, with a
      `not ok` line on stdout and the message on stderr
- [x] A module whose top-level `setTimeout` callback throws exits 1,
      with a `not ok` line on stdout and the message on stderr
- [x] A module that calls `crypto.randomUUID()` at top level exits 1
      with the runtime's error message on stderr
- [x] Each of these runs exits promptly, without waiting for the
      timeout
