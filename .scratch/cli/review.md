<!-- nightralph:review from=9050fbcbc319d2c464007a9a99f4463746d825e2 to=4485b7b5b0e0236109aa6ba3074b29de01485958 status=fixed -->
## 2026-10-30 13:48 -- review 9050fbc..4485b7b -- 1 of 3 fixed
- [ ] A setTimeout/setInterval reference captured at module top level keeps queueing forever after the replay, so the run is silently cancelled
    src/entry-worker.ts:129-160. The queueing shims are what top-level code sees, and `replayTimers()` runs only once. Any later call through a captured reference (`const st = globalThis.setTimeout` or `const { setTimeout } = globalThis`, which some bundled deps do) lands in `queued` and is never replayed. Repro: `const st = globalThis.setTimeout; console.log('ok 1 - a'); setTimeout(() => { st(() => console.log('1..1'), 10) }, 5)` piped into `dist/cli.js -t 1500` exits 1 with no plan line and no timeout message. Fix: once `live` is true, have the shims forward straight to `real[name]`.
- [ ] Test suite is flaky on a cold start: RUN_LIMIT_MS (4000) is below the CLI's own default timeout (5000) plus workerd startup
    test/index.ts:11 and :56. On the first `npm test` in this worktree, 'a passing module exits 0 with its TAP on stdout' failed with exit code 143 (SIGTERM from the run helper). The child was killed while workerd was still cold-starting. A second run passed 136/136. Raise the limit well above startup time plus the longest `--timeout` any fixture relies on.
- [x] A run that ends without completing (workerd cancels the request, no `done` control line) exits 1 with nothing on stderr
    src/index.ts:162-174. When `summary.reason` is null, nothing is written to stderr. Repro: a module that is only `console.log('ok 1 - a')` prints `ok 1 - a` and exits 1 with no explanation, so the user cannot tell an apparent pass from a failure. The same silent exit hides the bug in the first finding. Write a short stderr line such as "cfout: the run ended without completing (no plan, testsFinished, or error)" when the body closes with reason null.

### Fix
- attempts: 1 of 4
- effort: medium
- agent exit code: 0
- result: merged

# Review-fix notes

## Finding 1: captured setTimeout keeps queueing -- done
- src/entry-worker.ts: the setTimeout/setInterval shims forward to
  `real[name]` once `live` is true.
- Test: `a timer function captured at top level works after the replay`
  (fixture test/_captured-timer.js), asserts summary.reason === 'plan'
  via runTestsInWorker. Failed with reason null before the fix.

## Finding 2: RUN_LIMIT_MS below CLI default timeout -- done
- test/index.ts: RUN_LIMIT_MS = DEFAULT_TIMEOUT + 10000 (imported from
  src/index.js), so the helper never kills a run the CLI would end itself.
- Red test: `with no --timeout a hanging module exits 1 by itself`
  (_hang.js, no flags). Before the fix the helper killed it at 4000ms
  and it exited 143. The cold-start flake itself is not reproducible on
  demand; this test pins the underlying invariant.
- Note: child.kill() on the CLI shows up as exitCode 143 with signal
  null, so `signal === null` does not prove the helper didn't kill it.

## Finding 3: silent exit when reason is null -- done
- src/index.ts: when the body closes with summary.reason null (and no
  timeout), write "cfout: the run ended without completing (no plan,
  testsFinished, or error)" to stderr.
- Test: `a run that ends without completing says so on stderr`
  (fixture test/_no-completion.js). Asserts non-empty stderr, not the
  exact text, per the no-brittle-tests rule.

AGENTS.md updated with the timer-shim and RUN_LIMIT_MS gotchas.
Full suite: 143/143, lint exit 0.
---
