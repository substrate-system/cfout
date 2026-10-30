# cfout: run piped tests in the Cloudflare Workers runtime

**Status:** ready-for-agent
**Date:** 2026-10-30

## Problem Statement

Libraries that target Cloudflare Workers are usually tested in Node, so
Node-only assumptions (missing globals, timers at module scope, Node
built-ins) are only discovered after deploying. The existing way to run
tests inside the real Workers runtime (workerd) locally is vitest with
`@cloudflare/vitest-pool-workers`, which means adopting vitest, a vite
config, a wrangler config and a pool plugin just to run a test file.

tapout already solves the equivalent problem for browsers: pipe a bundled
test script in, get TAP out, exit non-zero on failure. There is no such
tool for workerd.

## Solution

`cfout` is a command-line tool. It reads an already-bundled JavaScript
test module from stdin, runs it inside workerd locally via Miniflare,
streams the test output to the terminal as TAP, and exits with a code
that reflects the result. It needs no configuration file. Behaviour and
flags mirror tapout wherever the two tools share a concept, so someone
who knows one knows the other.

```sh
npx esbuild --bundle test/index.ts --format=esm | npx cfout | npx tap-spec
```

## User Stories

1. As a library author targeting Workers, I want to pipe my bundled
   tapzero tests into one command and see TAP output, so that I can
   catch Workers-only runtime failures without adopting vitest.
2. As a CI maintainer, I want the command to exit non-zero when any test
   fails, errors, or hangs, so that a red run fails the build.
3. As a tapout user, I want the same completion rules and flags I
   already know, so that I do not have to learn a second mental model.
4. As a developer testing code that reads environment variables, I want
   to pass values on the command line and read them from my test code,
   so that tests can be parameterised without a wrangler file.
5. As a developer whose worker uses `nodejs_compat` or a specific
   compatibility date, I want to set the compatibility date and flags on
   the command line, so that tests run under the same runtime semantics
   as production.
6. As a developer debugging a hang, I want the output produced before
   the timeout to have already been printed, so that I can see how far
   the tests got.

## Implementation Decisions

### Package and layout

- Published as `@substrate-system/cfout`, ESM, TypeScript, built with
  esbuild, with a `cfout` bin. Mirrors tapout's structure: a CLI module
  that parses arguments and a core module exporting a programmatic
  function (`runTestsInWorker`) that the CLI calls. The programmatic
  function takes the test source, the options below and returns the
  exit code and a completion summary; it writes nothing to the process
  streams itself except through injected writers, so it is testable.
- Runtime dependency: `miniflare` only. It brings the workerd binary.
  wrangler is not a dependency. Node 22 or newer, which is what
  Miniflare 4 requires.
- Lint with eslint 10 and `newneostandard`. License is the same Big
  Time license as tapout.

### Input contract

- stdin is one fully bundled ES module with no unresolved bare imports.
  Static imports of `node:*` built-ins are allowed and only work when
  `nodejs_compat` is enabled; esbuild users mark them external.
- cfout does not bundle, transpile, or accept a file path. Bundling is
  the shell pipeline's job, as with tapout.
- Top-level code runs the tests. tapzero style `test(...)` calls are the
  primary case.

### Runtime assembly

- cfout builds a Miniflare instance with two in-memory ES modules under
  a dedicated modules root: a generated entry worker and the user's
  stdin module. Module paths must sit under a non-root directory; a
  root-level module path makes workerd fail to start (observed in the
  prototype).
- The entry worker's fetch handler dynamically imports the user module
  and returns a streamed response. cfout dispatches one fetch and reads
  the body.
- Miniflare's own logger is silenced so stdout carries only TAP. The
  workerd process's stderr is passed through to cfout's stderr
  unchanged.

### Global-scope shim

workerd evaluates module top level in global scope even when the import
is triggered from inside a request, and global scope forbids timers,
random values and I/O. tapzero's first `test()` call schedules a
`setTimeout`, so without intervention every tapzero bundle throws
immediately. Verified in the prototype.

- Before importing the user module, the entry worker replaces
  `setTimeout` and `setInterval` with versions that queue the call.
  After the import resolves it restores the originals and replays the
  queue with the real timers, now inside request context. Replayed
  callbacks are wrapped so a throw is reported as an uncaught error
  rather than silently cancelling the request.
- Console output produced during module evaluation is buffered the same
  way, because a stream write is I/O and is dropped in global scope.
  The buffer is flushed to the stream right after the import resolves.
- `crypto.getRandomValues`, `crypto.randomUUID` and `fetch` at module
  top level are not shimmed. They are genuine Workers constraints the
  tool exists to expose, and the runtime's own error message points at
  the fix.

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

### Output channel

- The entry worker patches `console.log`, `info`, `debug`, `warn` and
  `error` to write lines into the response body. Each line carries a
  one-character prefix naming the console method. cfout strips the
  prefix and routes `log`, `info` and `debug` to stdout and `warn` and
  `error` to stderr, as tapout does.
- The body is an `IdentityTransformStream`. A plain `TransformStream`
  is pure JavaScript, so workerd's hang detector sees no pending I/O
  and cancels the request with no output. Verified in the prototype in
  every configuration tried; the identity stream worked in all of them.
- The handler keeps the writer alive with `waitUntil` and closes the
  stream when the run completes.

### Completion rules

Same four rules as tapout, split between the worker and Node.

Inside the entry worker, ported from tapout's harness:

1. The test code sets `globalThis.testsFinished = true` (an accessor
   installed by the wrapper; any other value is ignored).
2. A top-level TAP plan line `1..N`, optionally with a directive. A plan
   after the test points ends the run at once; a plan before them ends
   the run when N test points have been seen. Indented subtest plans
   are ignored. On completion the wrapper compares planned against seen
   test points and emits `not ok - planned N tests but ran M` on a
   mismatch.
3. An uncaught error: a throw during module evaluation (the import
   rejects), an `unhandledrejection` event, or a throw from a replayed
   queued callback. The wrapper emits one `not ok - <message>` line on
   stdout, writes the message and stack to stderr, and ends the run.

In Node:

4. `--timeout <ms>`, default 5000, measured from when the fetch is
   dispatched so workerd startup does not count. On expiry cfout stops
   reading, disposes Miniflare, writes a timeout message to stderr and
   exits 1. Everything streamed so far has already been printed.

There is no `--auto-finish` idle mode.

### Exit code

0 when the run completed by rule 1 or 2 with no `not ok` line, no plan
mismatch, no uncaught error and no `console.error` call. 1 otherwise.
Any `console.error` call fails the run, matching tapout.

### Compatibility settings

- `--compat-date <YYYY-MM-DD>`: default is the newest date the installed
  workerd supports, derived from miniflare's version string (version
  `4.20260702.0` means `2026-07-02`). "Today" is not a valid default:
  workerd refuses to start with a date newer than the binary supports
  (observed in the prototype).
- `--compat-flag <name>`: repeatable. `nodejs_compat` is off by default
  so Node-only usage is caught unless the user opts in.

### Variables

- `--var KEY=VALUE`: repeatable, string values only. Passed to Miniflare
  as bindings, so they arrive as the handler's `env`. Before importing
  the user module the wrapper assigns that object to `globalThis.env`,
  so test code reads `globalThis.env.KEY`. The name matches what the
  same code would call it in a real worker.

### CLI

```
Usage: cfout [options]

Options:
  -t, --timeout <ms>         Timeout in milliseconds (default: 5000)
  --compat-date <date>       Workers compatibility date (default: newest
                             the installed runtime supports)
  --compat-flag <name>       Compatibility flag, repeatable
  --var <KEY=VALUE>          Variable exposed as globalThis.env.KEY,
                             repeatable
  -h, --help                 Show this help message
```

Argument parsing is hand-rolled as in tapout, with the same error
messages style and exit 1 on a bad value.

## Testing Decisions

The seam is the command itself: bundled JavaScript on stdin in, TAP on
stdout, diagnostics on stderr, exit code out. Every acceptance criterion
is phrased at that seam, so a test never reaches into the wrapper, the
shim, or Miniflare. The programmatic function is the second seam, used
where a test needs the structured completion summary rather than the
process exit code.

A good test pipes a small fixture through the real CLI into a real
workerd and asserts on the lines that come out and the exit code. Tests
do not assert on timing, on Miniflare internals, or on the exact prefix
protocol between the worker and Node.

Prior art: tapout's own test suite, which runs fixture scripts through
its CLI with esbuild and tapzero, and checks stdout, stderr and the exit
code. cfout copies that approach, including a separate fixture per
completion rule (plan, `testsFinished`, uncaught error, timeout).

Fixtures to cover, each a tiny bundled module:

- A passing tapzero suite, including an async test that awaits a timer.
  Verifies the global-scope shim.
- A tapzero suite with a failing assertion. Exit 1, `not ok` on stdout.
- A module that imports `node:assert`, run with and without
  `--compat-flag nodejs_compat`. Passes with, fails without.
- A module that reads `globalThis.env.FOO` set by `--var`.
- A top-level throw, an unhandled rejection, and a `console.error` call.
  Each exits 1 with the corresponding stderr output.
- A module that never finishes. Exits 1 at `--timeout` with the lines
  it printed before hanging present on stdout.
- Plan before test points, plan after test points, and a plan mismatch.
- `console.warn` routed to stderr, `console.log` to stdout.
- A module that calls `crypto.randomUUID()` at top level, to pin that
  the runtime's own global-scope error surfaces and fails the run.

cfout's test script bundles fixtures with esbuild and runs them through
the built CLI, then runs the result through tapzero in Node. CI is a
GitHub Actions workflow on ubuntu, Node 22, mirroring tapout's.

## Out of Scope

- Bindings other than string variables: KV, D1, R2, Durable Objects,
  queues, service bindings.
- Reading a wrangler configuration file.
- An env file flag such as `--env-file`.
- HTML reports or any reporter other than TAP.
- Bundling or TypeScript compilation inside cfout.
- An idle-based `--auto-finish` mode.
- Shimming random values or `fetch` at module top level.
- A shared package for the TAP plan logic. The logic is ported from
  tapout's harness; extracting it is a later decision for both repos.

## Further Notes

- First consumer is the mailrssat Cloudflare Worker example, whose
  tests inject fakes through function arguments and need no bindings.
  Its `vi.spyOn(console.log)` assertion has no equivalent here and will
  be restated as observable behaviour when it is ported.
- Throws inside timers scheduled after the initial replay are not
  catchable by the wrapper. workerd surfaces no `error` event for them
  and cancels the request. tapzero catches throws inside test bodies
  itself, so in practice this only affects test code that schedules its
  own fire-and-forget timers. Document it in the README.
- The prototype that produced the findings above ran against miniflare
  4.20260625.0 on Node 26 with a full tapzero bundle and reported all
  four tests passing, including the `node:assert` import under
  `nodejs_compat` and a `--var` value read through `globalThis.env`.
