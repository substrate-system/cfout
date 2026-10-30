# 06: Compatibility date and flags

**What to build:** developers can run tests under the same runtime
semantics as production.

- `--compat-date <YYYY-MM-DD>`: default is the newest date the
  installed workerd supports, derived from miniflare's version string
  (`4.20260702.0` means `2026-07-02`). "Today" is not a valid default;
  workerd refuses to start with a date newer than the binary supports.
  A malformed date is rejected in tapout's error style.
- `--compat-flag <name>`: repeatable. `nodejs_compat` is off by default
  so Node-only usage is caught unless the user opts in.

Both are passed to Miniflare as the worker's compatibility date and
flags. Input contract reminder: static `node:*` imports in the bundle
only work with `nodejs_compat`; esbuild users mark them external, so
the test helper needs a way to bundle a fixture with `node:*` external.

Blocked by 05 because the "fails without the flag" case surfaces as a
rejected import.

**Blocked by:** 05

**Touches:** `src/cli.ts` (parse `--compat-date`, `--compat-flag`),
`src/index.ts` (options, default date derived from miniflare's
`package.json` version), `test/index.ts` (bundle helper option for
`node:*` externals), new `node:assert` fixture under `test/`

**Status:** ready-for-agent

- [x] A module that imports `node:assert` and passes exits 0 with
      `--compat-flag nodejs_compat`
- [ ] The same module exits 1 without the flag
- [ ] `--compat-flag` can be given more than once and all values take
      effect
- [ ] A run with no `--compat-date` starts successfully (the default is
      accepted by the installed workerd)
- [ ] `--compat-date 2024-09-23` runs successfully
- [x] `--compat-date nope` prints an error and exits 1
