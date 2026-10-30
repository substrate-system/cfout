<!-- nightralph:start -->
## Agent skills

### Issue tracker

Issues are tracked as local markdown files under `.scratch/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default label vocabulary. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout. See `docs/agents/domain.md`.
<!-- nightralph:end -->

## Codebase notes

- `src/entry-worker.ts` generates the worker source as a string; it is
  not type-checked or linted as worker code. `PREFIX` there is the line
  protocol shared with `src/index.ts` (`<char><text>\n`, `c` = control
  JSON such as `{"done":"testsFinished"}`). Change both together.
- Any new file in `src/` must be added to the `build-esm` entry list in
  `package.json`; the build is unbundled.
- Writes to the response stream during module evaluation are silently
  dropped by workerd (global scope). The entry worker buffers them until
  the import resolves; anything new that writes during evaluation must
  go through that buffer.
- Completion rules that the worker decides (`testsFinished`, TAP plan)
  go through `requestFinish(reason)` in `src/entry-worker.ts`, which
  defers until the import resolves. Output after a requested finish is
  dropped. Lines the wrapper itself writes to stdout must use `write()`,
  not `emit()`, or plan tracking counts them as test points.
- A `not ok` line written by the worker on the log channel is enough to
  fail the run; Node counts it like any other.
- workerd cancels a request that has no pending I/O. A run that never
  completes and has nothing scheduled ends with no `done` control line,
  not a hang.
- Miniflare gzips a `text/plain` response unless the fetch sends
  `accept-encoding: identity`, and the compressor holds everything until
  the stream closes. Keep that header on the dispatch or nothing streams
  before completion (a timed-out run would print nothing).
- The entry worker queues `setTimeout`/`setInterval` calls made during
  module evaluation and replays them after the import resolves. Queued
  calls return negative fake ids; `clearTimeout`/`clearInterval` stay
  wrapped for the whole run to translate them. workerd builtins called
  with a different `this` throw, so keep saved timer functions bound to
  `globalThis` (a call like `real.setTimeout(...)` breaks every run).
- Top-level `await` in the user module currently gets the request
  cancelled with no output.
- Uncaught errors go through `reportUncaught(err)` in
  `src/entry-worker.ts` (ends the run with reason `uncaught`). Its
  stack goes out on the warn channel so it reaches stderr without
  counting as a `console.error` call.
- workerd never dispatches `unhandledrejection` for a promise rejected
  while the user module evaluates (global scope), whatever scope the
  listener was added in. Only rejections in request context (after the
  import resolves) are reported.
- A run that breaks usually still exits promptly, because workerd
  cancels the request, so "exit 1, not killed" does not prove a
  completion rule fired. Assert `summary.reason` via
  `runTestsInWorker` to check that.

## Testing

- `npm test` builds, bundles `test/index.ts` with esbuild and pipes it
  into `node`, so `import.meta.url` is not a real path in tests. Use
  `process.cwd()` (npm runs from the package root).
- Fixtures are `test/_*.js`, bundled with esbuild and piped into
  `dist/cli.js` by the `run()` helper. Use `runTestsInWorker` directly
  only when a test needs the completion summary.
- A fixture that needs request context without the timer shim can
  export `then`: `import()` treats the namespace as a thenable and calls
  it inside the request (see `test/_hang.js`).
- Each run starts a real workerd, roughly 100-300ms per test.
- Check `npm run lint` by exit code, not by grepping for "error": eslint
  config errors are printed in prose.
- Lint also covers the `test/_*.js` fixtures, and its
  `operator-linebreak` rule rejects the trailing-`?` multi-line ternary.
  Keep ternaries in fixtures on one line.
- To read worker-side state in a test, have a fixture log it as JSON
  on a `# ...` comment line and parse that line from stdout (see
  `_env-echo.js`).
- When mutating source to prove a test can fail, back the file up
  (`cp`) and restore from the backup. `git checkout <file>` also throws
  away any uncommitted implementation in it.
- A fixture that imports `node:*` must be bundled with those imports
  external: `run(fixture, args, { nodeExternal: true })`. Without
  `--compat-flag nodejs_compat` the import rejects and the run is
  reported as an uncaught error.
- To observe a compatibility flag from a test, pick one with a
  global-visible effect (`nodejs_compat` defines `process`,
  `no_global_navigator` removes `navigator`); see `_compat-echo.js`.
- A well-formed compat date newer than the installed workerd makes
  Miniflare fail to start ("is in the future and unsupported"), which
  is a cheap way to prove a date reaches the runtime.
- Error assertions on argument errors should check
  `stderr.startsWith('Error:')`. A crash prints `cfout: <Name>Error:`,
  which also contains `Error:`.
- To prove a test that passes on first run can fail, break the source
  temporarily, then run the raw TAP:
  `npm run build && npx esbuild test/index.ts --bundle --format=esm
  --platform=node --packages=external | node --input-type=module`.
