# 01: Scaffold and tracer bullet: one module through workerd to TAP

**What to build:** `cat bundle.js | cfout` runs an already-bundled ES
module inside workerd via Miniflare and streams its console output back
as TAP, exiting 0 or 1. This ticket sets up the package and cuts the
first complete path: stdin, CLI, `runTestsInWorker`, generated entry
worker, output channel, the `testsFinished` completion rule, and exit
code. Later tickets add the other completion rules and flags on top of
it.

Package: `@substrate-system/cfout`, ESM, TypeScript built with esbuild,
`cfout` bin, Node 22+, runtime dependency `miniflare` only. Mirror
tapout's layout (`../tapout`): a CLI module that parses arguments and a
core module exporting `runTestsInWorker(source, options)`, which returns
the exit code and a completion summary and writes only through injected
stdout/stderr writers. Lint with eslint 10 and `newneostandard`. Copy
tapout's Big Time LICENSE. Add a GitHub Actions workflow on ubuntu,
Node 22, mirroring tapout's `nodejs.yml` (install, lint, build, test).

Runtime assembly, per the spec's "Runtime assembly" and "Output
channel" sections:

- Two in-memory ES modules under a non-root modules directory (a
  root-level module path makes workerd fail to start): the generated
  entry worker and the stdin module.
- The entry worker's fetch handler patches `console.log`, `info`,
  `debug`, `warn`, `error` to write prefixed lines into an
  `IdentityTransformStream` body (a plain `TransformStream` gets the
  request cancelled by workerd's hang detector), keeps the writer alive
  with `waitUntil`, then dynamically imports the user module.
- Console output during module evaluation is buffered and flushed right
  after the import resolves (stream writes are dropped in global scope).
- `globalThis.testsFinished` is an accessor installed before the
  import; setting it to `true` (any other value is ignored) ends the
  run and closes the stream. Port the accessor logic from tapout's
  `src/test-harness.js`.
- Node side: dispatch one fetch, read the body, strip the one-char
  prefix, route `log`/`info`/`debug` to stdout and `warn`/`error` to
  stderr. Miniflare's logger is silenced; workerd's own stderr passes
  through unchanged. Dispose Miniflare when done.
- Exit 0 only when the run completed with no `not ok` line and no
  `console.error` call; 1 otherwise.

CLI: hand-rolled argument parsing as in tapout's `src/cli.ts`, with
`-h, --help` printing the usage block from the spec and an unknown
option printing an error and exiting 1. Later tickets add flags to this
parser.

Tests: `test/index.ts` with a helper that bundles a fixture with
esbuild, pipes it into the built CLI, and resolves to
`{ exitCode, stdout, stderr }`, as in tapout's `test/index.ts`. Fixtures
here print raw TAP with `console.log` and set
`globalThis.testsFinished = true` (no timers; those arrive in 04).
`npm test` builds, runs the suite in Node through tapzero, and pipes to
`tap-spec`.

**Blocked by:** None (can start immediately)

**Touches:** `package.json`, `tsconfig.json`, `tsconfig.build.json`,
`eslint.config.js`, `LICENSE`, `.github/workflows/nodejs.yml`,
`src/cli.ts`, `src/index.ts` (`runTestsInWorker`),
`src/entry-worker.ts` (generated entry worker source), `test/index.ts`,
`test/_*.js` fixtures

**Status:** ready-for-agent

- [ ] A module that logs `ok 1 - x` and then sets
      `globalThis.testsFinished = true` exits 0 with `ok 1 - x` on
      stdout
- [ ] A module that logs a `not ok` line and then sets the flag exits 1
- [ ] Setting `globalThis.testsFinished` to a value other than `true`
      does not end the run
- [ ] `console.log`, `console.info` and `console.debug` output appears
      on stdout and not on stderr
- [ ] `console.warn` output appears on stderr and not on stdout
- [ ] A module that calls `console.error` and otherwise passes exits 1,
      with the message on stderr
- [ ] Console output produced at module top level (during evaluation)
      appears on stdout
- [ ] stdout contains no Miniflare log lines
- [ ] `runTestsInWorker` called directly with a passing source resolves
      to exit code 0 and writes only through the injected writers
- [ ] `cfout --help` prints usage and exits 0
- [ ] `cfout --bogus` prints an error to stderr and exits 1
- [ ] `npm run lint` passes
