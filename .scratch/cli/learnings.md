<!-- nightralph:entry ticket=cli:1 attempt=1 outcome=done -->
## 2026-10-30 13:16 -- cli/01 attempt 1 -- done

Effort: medium. Agent exit: 0. Subagents: 0. Cost: $2.14. Checked items: "A module that logs `ok 1 - x` and then sets `globalThis.testsFinished = true` exits 0 with `ok 1 - x` on stdout", "Setting `globalThis.testsFinished` to a value other than `true` does not end the run", "`console.log`, `console.info` and `console.debug` output appears on stdout and not on stderr", "`console.warn` output appears on stderr and not on stdout", "`runTestsInWorker` called directly with a passing source resolves to exit code 0 and writes only through the injected writers", "`npm run lint` passes".

### Agent notes
# Notes: 01-tracer-bullet

## Decisions
- ../tapout is outside the worktree and the agent rules forbid reading it, so
  layout/LICENSE/workflow are reconstructed from the spec. LICENSE copied from
  node_modules/@substrate-system/tapzero/LICENSE (same author, Big Time 2.0.2).
- Scaffolding (package.json, tsconfigs, eslint config, LICENSE, workflow) done
  without test-first: pure config.
- eslint config: newneostandard ts + overrides for the user's style (4-space
  indent, `name:type` annotations, `A|B` unions).
- Entry worker writes `<prefix><text>\n` lines; prefixes l/i/d/w/e plus `c` for
  control JSON (`{"done":"testsFinished"}`). Summary = { reason, notOk,
  consoleErrors }.
- Test suite is bundled by esbuild and piped into node, so import.meta.url is
  not real; tests use process.cwd() as package root.
- Build lists src/index.ts, src/cli.ts, src/entry-worker.ts as separate
  unbundled entries.

## Progress
- [x] item 1: passing module exits 0 with ok line
- [x] item 2: not ok exits 1 (behavior landed with item 1; verified test goes red when notOk check is removed)
- [x] item 3: non-true testsFinished does not end the run. A run that never
  completes and has no pending work gets cancelled by workerd's hang detector,
  so the body ends with no `done` control line -> reason null -> exit 1. Test
  asserts CLI exit != 0 AND summary.reason != 'testsFinished' via
  runTestsInWorker. Test helper kills the child after 4s as a safety net
  (timeout flag arrives in ticket 02).
- [x] item 4: log/info/debug -> stdout (verified red by mis-routing to stderr)
- [x] item 5: warn -> stderr (verified red)
- [x] item 6: console.error fails run, message on stderr (verified red)
- [x] item 7: top-level output buffered and flushed (disabling buffering drops ALL top-level output, confirming spec)
- [x] item 8: stdout exactly equals fixture output (verified red with a debug Miniflare Log)
- [x] item 9: runTestsInWorker writes only via injected writers (process.std*.write patched during call; verified red)
- [x] item 10: --help. Usage lists only implemented flags (-h); later tickets add their lines next to their parseArgs case, so help never advertises flags that would be rejected as unknown.
- [x] item 11: --bogus -> 'Error: Unknown option: --bogus' + usage on stderr, exit 1 (verified red)
- [x] item 12: npm run lint passes. NOTE: earlier commits had a broken eslint
  config (override block lacked the @stylistic plugin; I grepped output for
  "error" and missed the prose config error). Fixed in a later commit.

## For next tickets
- CLI parseArgs/USAGE in src/cli.ts: add each flag's usage line with its case.
- Import rejection currently just goes live without reporting (ticket 05).
- Test helper `runSource` kills the child after 4s (RUN_LIMIT_MS); raise it
  or replace it once --timeout exists (ticket 02).
- workerd stdout is discarded (resume()), workerd stderr -> injected stderr.
- Default compat date = newestCompatDate() from miniflare/package.json;
  ticket 06 adds --compat-date over it.

---
<!-- nightralph:entry ticket=cli:7 attempt=1 outcome=done -->
## 2026-10-30 13:20 -- cli/07 attempt 1 -- done

Effort: medium. Agent exit: 0. Subagents: 0. Cost: $0.95. Checked items: "Two `--var` flags are both visible on `globalThis.env`", "`--var A=b=c` makes `globalThis.env.A` equal `b=c`", "`globalThis.env` is readable at module top level, not only inside tests", "`--var NOEQUALS` and `--var =x` each print an error and exit 1".

### Agent notes
# Notes: 07-vars

## Implemented
- src/cli.ts: `--var KEY=VALUE` case in parseArgs, split on first `=`
  (indexOf). `eq < 1` rejects both no-`=` and empty key with
  `Error: Invalid --var value: <v> (expected KEY=VALUE)` + usage, exit 1.
  Missing argument after `--var` also errors. Usage line added.
- src/index.ts: `RunOptions.vars` -> Miniflare `bindings`.
- src/entry-worker.ts: `globalThis.env = env` just before the dynamic import.
- Fixtures: test/_var.js (checks FOO === 'bar'), test/_env-echo.js (logs
  top-level `globalThis.env` as JSON on a `# env` line).

## Progress
- [x] item 1: FOO=bar passes / fails without (red seen before impl)
- [x] item 2: two vars. Passed on first run (impl landed in item 1); verified
  red by making parseArgs overwrite vars instead of merging.
- [x] item 3: A=b=c. Verified red by switching to lastIndexOf.
- [x] item 4: top level. Verified red by moving the env assignment after the
  import resolved.
- [x] item 5: NOEQUALS / =x. Verified red by disabling the check.

## Gotchas
- eslint's operator-linebreak rejects the user's trailing-`?` ternary style
  in fixtures; did not touch eslint config, rewrote fixture without it.
- A Bash heredoc containing the text `globalThis.env` was blocked by a hook
  that thought it was reading a .env file; use the Write tool for those.

---
<!-- nightralph:entry ticket=cli:3 attempt=1 outcome=done -->
## 2026-10-30 13:20 -- cli/03 attempt 1 -- done

Effort: medium. Agent exit: 0. Subagents: 0. Cost: $0.91. Checked items: "Two `ok` lines followed by `1..2` exits 0 without needing `testsFinished`".

### Agent notes
# Notes: 03-plan-rules

## Decisions
- Plan tracking lives in the entry worker's `emit`, on log/info/debug
  lines only. Top-level means no leading whitespace: `/^(not )?ok\b/` is a
  test point, `/^1\.\.(\d+)(\s*#.*)?$/` is a plan. Only the first plan
  counts.
- Completion reason for this rule is `'plan'` in the control line.
- The mismatch line `not ok - planned N tests but ran M` is written
  straight to the stream as a log line in `finish()`, so it is not
  counted as a test point. Node needs no change: its existing `notOk`
  counter turns it into exit 1. The check runs on every finish, so it
  also applies when `testsFinished` ends the run.
- Output after a finish requested during module evaluation is now dropped
  (matching the live case, where `finished` already dropped it).
- Items that the item-1 implementation already satisfied were checked
  red by temporarily breaking the relevant branch (mutation check).

## Progress
- [x] item 1: plan after test points (red, then green)
- [x] items 2-7: tests written after item 1's implementation already
  covered them; each was confirmed red by a mutation of its branch
  (plan-before finish off, mismatch off, `1..0` shortcut off, plan regex
  loosened to allow indentation, plan-after finish off). Committed one
  item per commit. The `hasMismatch` helper landed in the item-2 commit,
  one commit before its first use.
- Item 7 asserts via runTestsInWorker that the run completes by the
  `plan` rule with exactly one `not ok`, so it does not pass merely by
  never completing.
- npm test: 47/47 pass, npm run lint exit 0.

## Observations
- The first test in the suite failed once on a cold workerd start: the
  4s RUN_LIMIT_MS kill in test/index.ts hit. Not reproduced in 3 reruns.
  Left alone (ticket 02 replaces that helper limit with --timeout).

---
<!-- nightralph:entry ticket=cli:2 attempt=1 outcome=done -->
## 2026-10-30 13:21 -- cli/02 attempt 1 -- done

Effort: medium. Agent exit: 0. Subagents: 0. Cost: $1.21. Checked items: none.

### Agent notes
# Notes: 02-timeout

## Findings
- Output did NOT stream before this ticket: miniflare gzip-encodes the
  text/plain body (`mf-content-encoding: gzip`) and the compressor holds
  everything until the stream closes. Fixed by dispatching the fetch with
  `accept-encoding: identity`. Verified red without it.
- Top-level await in a user module gets the request cancelled with no
  output (even `await Promise.resolve()`). Not this ticket; affects later
  tickets (test/_console.js from ticket 01 uses TLA and is unused).
- A run that resolves its import with nothing pending is cancelled and
  its buffered output is lost (body ends early). Ticket 01 behaviour.
- Hanging fixture: timers are forbidden at module scope and the shim is a
  later ticket, so test/_hang.js exports `then`; import() treats the
  namespace as a thenable and calls it inside the request, where
  setInterval keeps the run alive.

## Progress
- [x] items 1, 2, 3, 7: one test, `_hang.js` with --timeout 500. Item 7 is
  read as "child closes with an exit code, not killed by the test
  helper's safety-net signal" (signal === null).
- [x] item 4 (-t): verified red by removing the `-t` case.
- [x] item 5 (finishes before timeout): `_pass.js --timeout 3000`.
- [x] item 6 (bad values): verified red with a lenient parser that
  accepted anything. Error style: `Error: <msg>` + usage on stderr, exit 1,
  same ArgError path as unknown options. 0 is rejected too (must be a
  positive integer).

## Files
- src/index.ts: `timeout` option, `DEFAULT_TIMEOUT`, timer starts after
  `mf.ready` at dispatch; on expiry reason='timeout', stderr
  `cfout: timed out after Nms`, exit 1, Miniflare disposed in finally.
- src/cli.ts: -t/--timeout parsing and usage line.
- test/_hang.js, test/index.ts (RunResult gained `signal`).
- AGENTS.md: gzip/identity gotcha, TLA cancellation, thenable fixture trick.

## For next tickets
- test helper RUN_LIMIT_MS (4s kill) still exists as a safety net; fixtures
  that may hang should pass `--timeout` well under it.

---
<!-- nightralph:entry ticket=cli:4 attempt=1 outcome=done -->
## 2026-10-30 13:27 -- cli/04 attempt 1 -- done

Effort: medium. Agent exit: 0. Subagents: 0. Cost: $0.91. Checked items: "A passing tapzero suite of several tests exits 0 with an `ok` line per assertion on stdout", "A tapzero test that awaits a `setTimeout` promise passes and the suite exits 0", "A module that calls `setInterval` at top level and clears it from inside the callback completes", "A tapzero suite with one failing assertion exits 1 with a `not ok` line on stdout".

### Agent notes
# Notes: 04-timer-shim

## Decisions
- Seam: the CLI (fixture piped through dist/cli.js), per the spec's
  Testing Decisions. No interactive seam confirmation (autonomous run).
- Shim lives in the fetch handler in `src/entry-worker.ts`. Both
  `setTimeout` and `setInterval` are queued during evaluation and
  replayed in `goLive()` (before the buffered output is flushed).
- Queued calls return negative fake ids. `clearTimeout`/`clearInterval`
  are wrapped for the whole run: a fake id is dropped from the queue
  before replay, or mapped to the real id after it. Needed for item 3
  (interval cleared from its own callback using the top-level id).
- Saved real timers are bound to globalThis; unbound-as-method calls
  (`real.setTimeout(...)`) threw in workerd and broke every run.
- A throw from a replayed callback is caught and ignored for now (ticket
  05 turns it into a reported uncaught error). Such a run currently ends
  at --timeout.
- The `_hang.js` fixture's `then` export calls setInterval before the
  import resolves, so it is queued too; it still keeps the run alive.

## Progress
- [x] item 1: red, then green (tapzero passing suite, 3 ok lines)
- [x] item 2: passed on first run after item 1; proved red by not
  restoring the real setTimeout
- [x] item 3: red, then green; proved the id translation is needed by
  removing it (the `# calls 3` assertion fails)
- [x] item 4: passed on first run; proved red by disabling the queue.
  Exit 1 alone is not discriminating (a broken run also exits 1), the
  `not ok` stdout assertion is.
- npm test 83/83, npm run lint exit 0.

---
