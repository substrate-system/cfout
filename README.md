# cfout
[![tests](https://img.shields.io/github/actions/workflow/status/substrate-system/cfout/nodejs.yml?style=flat-square)](https://github.com/substrate-system/cfout/actions/workflows/nodejs.yml)
[![types](https://img.shields.io/npm/types/@substrate-system/cfout?style=flat-square)](README.md)
[![module](https://img.shields.io/badge/module-ESM-blue?style=flat-square)](README.md)
[![semantic versioning](https://img.shields.io/badge/semver-2.0.0-blue?logo=semver&style=flat-square)](https://semver.org/)
[![license](https://img.shields.io/badge/license-Big_Time-blue?style=flat-square)](LICENSE)

Run tests in the Cloudflare Workers runtime. Pipe in a bundled test
script, get TAP out, exit non-zero on failure.

Libraries that target Cloudflare Workers are usually tested in Node, so
Node-only assumptions (missing globals, timers at module scope, Node
built-ins) show up only after deploying. The usual way to test inside
the real runtime (workerd) is vitest with
`@cloudflare/vitest-pool-workers`, which means adopting vitest, a vite
config, a wrangler config and a pool plugin.

`cfout` reads one bundled JavaScript module from stdin, runs it in
workerd locally via [Miniflare](https://www.npmjs.com/package/miniflare),
streams its console output to the terminal, and exits with a code that
reflects the result. There is no config file. Flags mirror
[tapout](https://github.com/substrate-system/tapout), which does the
same thing for browsers.

<details><summary><h2>Contents</h2></summary>
<!-- toc -->
</details>

## Install

```sh
npm i -D @substrate-system/cfout
```

Requires Node 22 or newer. The only runtime dependency is `miniflare`,
which brings the workerd binary. wrangler is not needed.

## Example

```sh
npx esbuild --bundle test/index.ts --format=esm | npx cfout | npx tap-spec
```

With a test file written with
[tapzero](https://github.com/substrate-system/tapzero):

```ts
// test/index.ts
import { test } from '@substrate-system/tapzero'

test('example', async t => {
    await new Promise(resolve => setTimeout(resolve, 10))
    t.ok(true, 'timers work')
})
```

In `package.json`:

```json
{
  "scripts": {
    "test": "esbuild --bundle test/index.ts --format=esm | cfout | tap-spec"
  }
}
```

## Input

stdin must be **one fully bundled ES module**.

* No unresolved bare imports (`import x from 'some-package'`). Bundle
  them in.
* Static imports of Node built-ins (`node:*`) are allowed, but only
  work with `--compat-flag nodejs_compat`. Mark them external when
  bundling:

  ```sh
  npx esbuild --bundle test/index.ts --format=esm --external:'node:*' |
      npx cfout --compat-flag nodejs_compat
  ```

* Top-level code runs the tests. tapzero style `test(...)` calls are the
  main case.

`cfout` does not bundle, transpile, or accept a file path. Bundling is
the shell pipeline's job.

## CLI

```
Usage: cfout [options]

Reads a bundled ES module from stdin, runs it in the Cloudflare Workers
runtime, and prints its output as TAP.

Options:
  -t, --timeout <ms>         Timeout in milliseconds (default: 5000)
  --compat-date <date>       Workers compatibility date (default: newest
                             the installed runtime supports)
  --compat-flag <name>       Compatibility flag, repeatable
  --var <KEY=VALUE>          Variable exposed as globalThis.env.KEY,
                             repeatable
  -h, --help                 Show this help message
```

### `-t, --timeout <ms>`

How long to wait for the run to complete, in milliseconds. Must be a
positive integer. Default 5000. The clock starts when the test request
is dispatched, so workerd startup does not count. See
[completion](#completion).

### `--compat-date <date>`

The Workers
[compatibility date](https://developers.cloudflare.com/workers/configuration/compatibility-dates/),
as `YYYY-MM-DD`. Defaults to the newest date the installed workerd
supports, derived from miniflare's version (`4.20260702.0` means
`2026-07-02`). "Today" is not used because workerd refuses to start
with a date newer than it supports.

### `--compat-flag <name>`

A
[compatibility flag](https://developers.cloudflare.com/workers/configuration/compatibility-flags/).
Repeat it for more than one flag. `nodejs_compat` is off by default, so
Node-only usage is caught unless you opt in.

```sh
npx cfout --compat-flag nodejs_compat --compat-flag no_global_navigator
```

### `--var <KEY=VALUE>`

A string variable, exposed to the test as `globalThis.env.KEY`. Repeat
it for more than one variable. The value is everything after the first
`=`, so `--var A=b=c` sets `A` to `b=c`. See [variables](#variables).

### `-h, --help`

Print the usage message.

A bad or unknown argument prints `Error: <message>` and the usage to
stderr, and exits 1.

## Output

`console.log`, `console.info` and `console.debug` go to stdout.
`console.warn` and `console.error` go to stderr. Only test output is
written to stdout, so it can be piped straight into a TAP reporter.
workerd's own stderr is passed through to stderr.

## Completion

A run ends at the first of these:

1. **`testsFinished`.** The test code sets
   `globalThis.testsFinished = true`. Any other value is ignored.
2. **A TAP plan.** A top-level plan line, `1..N`, optionally with a
   directive (`1..0 # skip`). A plan after the test points ends the run
   at once. A plan before them ends the run once N test points have been
   seen. Indented (subtest) plans are ignored. When the run ends, if the
   number of test points differs from the plan, cfout prints
   `not ok - planned N tests but ran M`.
3. **An uncaught error.** A throw during module evaluation, an
   `unhandledrejection` event, or a throw from a timer callback queued
   at module top level (see [shims](#what-is-shimmed)). cfout prints one
   `not ok - <message>` line on stdout and the message and stack on
   stderr.
4. **Timeout.** After `--timeout` milliseconds cfout stops reading,
   shuts down workerd, prints `cfout: timed out after <ms>ms` to stderr
   and exits 1. Output printed before the timeout is already on stdout.

tapzero prints a plan after its last test, so a tapzero suite ends by
rule 2 with no extra code. Other test code can log a plan or set
`testsFinished`:

```js
console.log('ok 1 - it works')
globalThis.testsFinished = true
```

There is no idle-based "auto finish" mode.

### Exit code

`0` when the run completed by rule 1 or 2 and there was

* no `not ok` line,
* no plan mismatch,
* no uncaught error, and
* no `console.error` call.

`1` otherwise. **Any `console.error` call fails the run**, even if every
test passed. Use `console.warn` for diagnostics that should not fail.

## Variables

Pass string variables with `--var`:

```sh
npx esbuild --bundle test/index.ts --format=esm |
    npx cfout --var API_URL=http://localhost:8787 --var MODE=test
```

They arrive as the worker's `env` and are assigned to `globalThis.env`
before your module is imported, so they can be read at module top level
or inside tests:

```js
const { API_URL, MODE } = globalThis.env
```

The name matches what the same code would call it inside a real worker.
Only string values are supported. KV, D1, R2, Durable Objects and other
bindings are not.

## What is shimmed

workerd evaluates a module's top level in "global scope", where timers,
random values and I/O are not allowed. tapzero's first `test()` call
schedules a `setTimeout`, so without help every tapzero bundle would
throw at once. cfout shims two things while your module is evaluated:

* **Timers.** `setTimeout` and `setInterval` calls made at module top
  level are queued, then replayed with the real timers once the module
  has finished evaluating. `clearTimeout` and `clearInterval` work with
  the ids returned by queued calls. A throw from a replayed callback is
  reported as an uncaught error.
* **Console.** Output written during module evaluation is buffered and
  printed right after the module finishes evaluating.

These are deliberately **not** shimmed, because they are real Workers
constraints that this tool exists to catch:

* `crypto.getRandomValues`
* `crypto.randomUUID`
* `fetch`

Calling one of them at module top level fails the run with workerd's
own error message, which explains the fix: call it inside a function
that runs later, such as a test body.

## Known limitations

* **Throws in late timers are not caught.** If a timer that was
  scheduled *after* the initial replay (for example, from inside a
  test) throws, workerd reports no error event to cfout and cancels the
  request. The run ends without a completion rule and exits 1, without a
  `not ok - <message>` line. tapzero catches throws inside test bodies
  itself, so this only affects test code that schedules its own
  fire-and-forget timers.
* **Rejections during module evaluation are not reported.** workerd
  does not dispatch `unhandledrejection` for a promise rejected while
  the module evaluates, for example a bare top-level
  `Promise.reject(...)`. The run still exits 1, but without a message.
  Rejections that happen later, such as in an async test, are reported.
* **Top-level `await` is not supported.** A module that uses top-level
  `await` gets its request cancelled with no output.

## API

The CLI is a thin wrapper around `runTestsInWorker`.

```ts
import { runTestsInWorker } from '@substrate-system/cfout'

const { exitCode, summary } = await runTestsInWorker(source, {
    stdout: text => process.stdout.write(text),
    stderr: text => process.stderr.write(text),
    timeout: 5000,
    compatDate: '2026-07-01',
    compatFlags: ['nodejs_compat'],
    vars: { FOO: 'bar' },
})
```

```ts
function runTestsInWorker (
    source:string,
    options?:RunOptions
):Promise<RunResult>

type Writer = (text:string) => void

interface RunOptions {
    stdout?:Writer;  // default: discard
    stderr?:Writer;  // default: discard
    vars?:Record<string, string>;
    compatDate?:string;  // YYYY-MM-DD
    compatFlags?:string[];
    timeout?:number;  // ms, default 5000
}

interface RunResult {
    exitCode:0|1;
    summary:CompletionSummary;
}

interface CompletionSummary {
    // 'testsFinished', 'plan', 'uncaught', 'timeout', or null if the
    // run ended without completing
    reason:string|null;
    notOk:number;  // number of `not ok` lines on stdout
    consoleErrors:number;  // number of `console.error` calls
}
```

`source` is the bundled module as a string. `runTestsInWorker` writes
nothing to the process streams itself, only through the writers you
pass. Unlike the CLI, it does not validate `compatDate` or `timeout`.

Also exported:

* `DEFAULT_TIMEOUT`, `5000`.
* `newestCompatDate()`, the default compatibility date as `YYYY-MM-DD`.

## License

[Big Time](LICENSE)
