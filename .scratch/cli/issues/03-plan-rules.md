# 03: Plan completion rules

**What to build:** completion rule 2, ported from tapout's
`src/test-harness.js` into the entry worker. A top-level TAP plan line
`1..N`, optionally with a directive (`1..0 # SKIP reason`), ends the
run:

- A plan after the test points ends the run at once.
- A plan before the test points ends the run once N test points have
  been seen (at once for `1..0`).
- Indented subtest plans are ignored.
- On completion, if planned and seen test points differ, the wrapper
  emits `not ok - planned N tests but ran M` and the run exits 1.

The `testsFinished` rule from 01 keeps working alongside this.
Fixtures print raw TAP with `console.log`; no timers needed.

**Blocked by:** 01

**Touches:** `src/entry-worker.ts` (plan tracking on the stdout
channel), `test/index.ts`, new plan fixtures under `test/`

**Status:** ready-for-agent

- [ ] Two `ok` lines followed by `1..2` exits 0 without needing
      `testsFinished`
- [ ] `1..2` followed by two `ok` lines exits 0 without needing
      `testsFinished`
- [ ] `1..3`, two `ok` lines, then `globalThis.testsFinished = true`
      reports the plan mismatch on stdout and exits 1
- [ ] Three `ok` lines followed by `1..2` reports the plan mismatch on
      stdout and exits 1
- [ ] `1..0 # SKIP nothing to run` exits 0
- [ ] An indented `    1..1` inside a subtest does not end the run
- [ ] One `ok` line, one `not ok` line, then `1..2` exits 1
