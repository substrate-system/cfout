# 07: --var KEY=VALUE

**What to build:** tests can be parameterised from the command line
without a wrangler file. `--var KEY=VALUE` is repeatable, string values
only. The values are passed to Miniflare as bindings, so they arrive as
the fetch handler's `env`. Before importing the user module, the entry
worker assigns that object to `globalThis.env`, so test code reads
`globalThis.env.KEY`. Split on the first `=` so values may contain `=`.
A value with no `=` or an empty key is rejected in tapout's error
style.

**Blocked by:** 01

**Touches:** `src/cli.ts` (parse `--var`), `src/index.ts` (pass
bindings to Miniflare), `src/entry-worker.ts` (assign
`globalThis.env`), `test/index.ts`, new fixture under `test/`

**Status:** done

- [x] A module that checks `globalThis.env.FOO === 'bar'` passes when
      run with `--var FOO=bar` and fails without it
- [x] Two `--var` flags are both visible on `globalThis.env`
- [x] `--var A=b=c` makes `globalThis.env.A` equal `b=c`
- [x] `globalThis.env` is readable at module top level, not only
      inside tests
- [x] `--var NOEQUALS` and `--var =x` each print an error and exit 1
