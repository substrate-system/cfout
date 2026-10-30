# 02: --timeout

**What to build:** completion rule 4. `-t, --timeout <ms>`, default
5000, bounds how long cfout waits for a run to complete. The clock
starts when the fetch is dispatched, so workerd startup does not count.
On expiry cfout stops reading, disposes Miniflare, writes a timeout
message to stderr and exits 1. Everything streamed before the timeout
has already been printed, so a developer debugging a hang can see how
far the tests got. A bad value is rejected in the same error style as
tapout's CLI. There is no `--auto-finish` idle mode.

Landing this early keeps later tickets' fixtures from hanging the test
suite.

**Blocked by:** 01

**Touches:** `src/cli.ts` (parse `-t`/`--timeout`), `src/index.ts`
(`runTestsInWorker` timeout option), `test/index.ts`, new hanging
fixture under `test/`

**Status:** done

- [x] A module that prints a line and never finishes exits 1 when run
      with `--timeout 500`
- [x] In that run, the line printed before the hang is on stdout
- [x] In that run, stderr contains a timeout message
- [x] `-t 500` behaves the same as `--timeout 500`
- [x] A run that finishes before the timeout exits 0 without a timeout
      message
- [x] `--timeout abc`, `--timeout -1` and `--timeout` with no value each
      print an error and exit 1
- [x] The cfout process exits after a timeout (no lingering workerd
      keeping it alive)
