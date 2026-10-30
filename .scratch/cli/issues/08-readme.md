# 08: README

**What to build:** a README for `@substrate-system/cfout` in the style
of tapout's README. Cover:

- What it is and why (the problem statement, briefly).
- Install and the pipeline example
  (`npx esbuild --bundle test/index.ts --format=esm | npx cfout | npx tap-spec`).
- The input contract: one fully bundled ES module, no bare imports,
  `node:*` imports marked external and needing `nodejs_compat`; cfout
  does not bundle or take a file path.
- Every CLI flag, matching the `--help` output.
- The four completion rules and the exit code rules, including that
  any `console.error` fails the run.
- Reading variables through `globalThis.env`.
- What is shimmed at module top level (timers, console) and what is
  deliberately not (`crypto.getRandomValues`, `crypto.randomUUID`,
  `fetch`).
- Known limitation: throws inside timers scheduled after the initial
  replay cannot be caught by the wrapper; workerd cancels the request.
  tapzero catches throws inside test bodies, so this only affects test
  code that schedules its own fire-and-forget timers.
- The programmatic `runTestsInWorker` API.

No em dashes or arrow characters. No tests for the docs.

**Blocked by:** 01, 02, 03, 04, 05, 06, 07

**Touches:** `README.md`

**Status:** ready-for-agent

- [ ] Every flag in `cfout --help` is documented in the README
- [ ] The pipeline example in the README runs successfully against a
      passing tapzero test file
- [ ] The late-timer limitation is documented
