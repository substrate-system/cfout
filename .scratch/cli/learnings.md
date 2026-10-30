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
