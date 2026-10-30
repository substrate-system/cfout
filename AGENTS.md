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
- workerd cancels a request that has no pending I/O. A run that never
  completes and has nothing scheduled ends with no `done` control line,
  not a hang.

## Testing

- `npm test` builds, bundles `test/index.ts` with esbuild and pipes it
  into `node`, so `import.meta.url` is not a real path in tests. Use
  `process.cwd()` (npm runs from the package root).
- Fixtures are `test/_*.js`, bundled with esbuild and piped into
  `dist/cli.js` by the `run()` helper. Use `runTestsInWorker` directly
  only when a test needs the completion summary.
- Each run starts a real workerd, roughly 100-300ms per test.
- Check `npm run lint` by exit code, not by grepping for "error": eslint
  config errors are printed in prose.
- Lint also covers the `test/_*.js` fixtures, and its
  `operator-linebreak` rule rejects the trailing-`?` multi-line ternary.
  Keep ternaries in fixtures on one line.
- To read worker-side state in a test, have a fixture log it as JSON
  on a `# ...` comment line and parse that line from stdout (see
  `_env-echo.js`).
- To prove a test that passes on first run can fail, break the source
  temporarily, then run the raw TAP:
  `npm run build && npx esbuild test/index.ts --bundle --format=esm
  --platform=node --packages=external | node --input-type=module`.
