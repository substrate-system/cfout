import { test } from '@substrate-system/tapzero'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { build } from 'esbuild'
import { runTestsInWorker } from '../src/index.js'

// the suite is bundled and piped into node, so import.meta.url is not
// a real path; npm runs scripts from the package root
const ROOT = process.cwd()
const CLI = path.join(ROOT, 'dist', 'cli.js')
const RUN_LIMIT_MS = 4000

interface RunResult {
    exitCode:number|null;
    stdout:string;
    stderr:string;
}

/**
 * Bundle a fixture from `test/` with esbuild and pipe it into the
 * built CLI.
 */
async function run (fixture:string, args:string[] = []):Promise<RunResult> {
    const source = await bundle(fixture)
    return runSource(source, args)
}

async function bundle (fixture:string):Promise<string> {
    const result = await build({
        entryPoints: [path.join(ROOT, 'test', fixture)],
        bundle: true,
        format: 'esm',
        write: false,
    })
    return result.outputFiles[0].text
}

function runSource (source:string, args:string[] = []):Promise<RunResult> {
    return new Promise((resolve, reject) => {
        const child = spawn('node', [CLI, ...args], { cwd: ROOT })
        // a run that never completes has to be stopped from outside
        const timer = setTimeout(() => child.kill(), RUN_LIMIT_MS)
        let stdout = ''
        let stderr = ''
        child.stdout.on('data', (d) => { stdout += d.toString() })
        child.stderr.on('data', (d) => { stderr += d.toString() })
        child.on('error', reject)
        child.on('close', (exitCode) => {
            clearTimeout(timer)
            resolve({ exitCode, stdout, stderr })
        })
        child.stdin.end(source)
    })
}

test('a passing module exits 0 with its TAP on stdout', async t => {
    const { exitCode, stdout } = await run('_pass.js')
    t.equal(exitCode, 0, 'should exit 0')
    t.ok(stdout.split('\n').includes('ok 1 - x'),
        'should print the test line')
})

test('a module with a not ok line exits 1', async t => {
    const { exitCode, stdout } = await run('_fail.js')
    t.equal(exitCode, 1, 'should exit 1')
    t.ok(stdout.split('\n').includes('not ok 1 - x'),
        'should print the failing line')
})

test('setting testsFinished to a value other than true does not end the run',
    async t => {
        const { exitCode } = await run('_finished-other.js')
        t.notEqual(exitCode, 0, 'should not exit 0')

        const { summary } = await runTestsInWorker(
            await bundle('_finished-other.js')
        )
        t.notEqual(summary.reason, 'testsFinished',
            'should not complete by the testsFinished rule')
    })

test('console.log, info and debug go to stdout and not stderr', async t => {
    const { exitCode, stdout, stderr } = await run('_stdout-methods.js')
    t.equal(exitCode, 0, 'should exit 0')
    for (const line of [
        'ok 1 - from log',
        'ok 2 - from info',
        'ok 3 - from debug',
    ]) {
        t.ok(stdout.split('\n').includes(line), `stdout has "${line}"`)
        t.ok(!stderr.includes(line), `stderr does not have "${line}"`)
    }
})

test('console.warn goes to stderr and not stdout', async t => {
    const { exitCode, stdout, stderr } = await run('_warn.js')
    t.equal(exitCode, 0, 'a warning should not fail the run')
    t.ok(stderr.split('\n').includes('careful now'), 'stderr has the warning')
    t.ok(!stdout.includes('careful now'), 'stdout does not have the warning')
})

test('a console.error call fails an otherwise passing run', async t => {
    const { exitCode, stdout, stderr } = await run('_console-error.js')
    t.equal(exitCode, 1, 'should exit 1')
    t.ok(stderr.split('\n').includes('something broke'),
        'stderr has the message')
    t.ok(!stdout.includes('something broke'), 'stdout does not')
})

test('console output from module evaluation appears on stdout', async t => {
    const { exitCode, stdout } = await run('_top-level.js')
    t.equal(exitCode, 0, 'should exit 0')
    const lines = stdout.split('\n')
    t.ok(lines.includes('# top level'), 'stdout has the first line')
    t.ok(lines.includes('ok 1 - logged at top level'),
        'stdout has the second line')
})

test('stdout carries only the module output, no Miniflare logs', async t => {
    const { stdout } = await run('_pass.js')
    t.equal(stdout, 'ok 1 - x\n', 'stdout is exactly the TAP the module printed')
})

test('runTestsInWorker writes only through the injected writers', async t => {
    const source = await bundle('_stderr-too.js')
    const out:string[] = []
    const err:string[] = []

    // anything written straight to the process streams during the run is
    // captured here instead of reaching the terminal
    const leaked:string[] = []
    const realOut = process.stdout.write
    const realErr = process.stderr.write
    const capture = (chunk:string|Uint8Array) => {
        leaked.push(chunk.toString())
        return true
    }
    process.stdout.write = capture as typeof process.stdout.write
    process.stderr.write = capture as typeof process.stderr.write

    let result
    try {
        result = await runTestsInWorker(source, {
            stdout: text => { out.push(text) },
            stderr: text => { err.push(text) },
        })
    } finally {
        process.stdout.write = realOut
        process.stderr.write = realErr
    }

    t.equal(result.exitCode, 0, 'should resolve to exit code 0')
    t.equal(result.summary.reason, 'testsFinished',
        'summary should say how the run completed')
    t.equal(out.join(''), 'ok 1 - x\n', 'stdout writer got the TAP')
    t.ok(err.join('').includes('a warning'), 'stderr writer got the warning')
    t.equal(leaked.length, 0, 'nothing was written to the process streams')
})

test('cfout --help prints usage and exits 0', async t => {
    const { exitCode, stdout } = await runSource('', ['--help'])
    t.equal(exitCode, 0, 'should exit 0')
    t.ok(stdout.includes('Usage: cfout'), 'should print the usage block')
})

test('cfout --bogus prints an error to stderr and exits 1', async t => {
    const { exitCode, stderr } = await runSource('', ['--bogus'])
    t.equal(exitCode, 1, 'should exit 1')
    t.ok(stderr.includes('--bogus'), 'stderr should name the bad option')
})

test('a plan after the test points ends the run', async t => {
    const { exitCode, stdout } = await run('_plan-after.js')
    t.equal(exitCode, 0, 'should exit 0 without testsFinished')
    t.ok(stdout.split('\n').includes('1..2'), 'stdout has the plan')
})

test('a plan before the test points ends the run after N of them',
    async t => {
        const { exitCode, stdout } = await run('_plan-before.js')
        t.equal(exitCode, 0, 'should exit 0 without testsFinished')
        t.ok(stdout.split('\n').includes('ok 2 - b'),
            'stdout has the last test point')
    })

/**
 * Does stdout have a top-level `not ok` line naming the plan mismatch?
 */
function hasMismatch (stdout:string, planned:number, ran:number):boolean {
    return stdout.split('\n').some(line => (
        /^not ok\b/.test(line) &&
        line.includes(`planned ${planned}`) &&
        line.includes(`ran ${ran}`)
    ))
}

test('fewer test points than planned is reported when testsFinished ends ' +
    'the run', async t => {
    const { exitCode, stdout } = await run('_plan-short.js')
    t.equal(exitCode, 1, 'should exit 1')
    t.ok(hasMismatch(stdout, 3, 2), 'stdout reports the plan mismatch')
})
