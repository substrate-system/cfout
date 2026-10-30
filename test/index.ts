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
    signal:NodeJS.Signals|null;
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
        child.on('close', (exitCode, signal) => {
            clearTimeout(timer)
            resolve({ exitCode, signal, stdout, stderr })
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

test('--var FOO=bar is visible as globalThis.env.FOO', async t => {
    const withVar = await run('_var.js', ['--var', 'FOO=bar'])
    t.equal(withVar.exitCode, 0, 'should exit 0 with the var set')
    t.ok(withVar.stdout.split('\n').includes('ok 1 - env.FOO is bar'),
        'should print the passing line')

    const without = await run('_var.js')
    t.equal(without.exitCode, 1, 'should exit 1 without the var')
})

/**
 * Run the fixture that logs `globalThis.env` as read at module top level,
 * and parse what it logged.
 */
async function envAtTopLevel (args:string[]):Promise<unknown> {
    const { stdout } = await run('_env-echo.js', args)
    const line = stdout.split('\n').find(l => l.startsWith('# env '))
    return line ? JSON.parse(line.slice('# env '.length)) : undefined
}

test('two --var flags are both visible on globalThis.env', async t => {
    const env = await envAtTopLevel(['--var', 'A=1', '--var', 'B=2'])
    t.deepEqual(env, { A: '1', B: '2' }, 'env should have both vars')
})

test('--var splits on the first =', async t => {
    const env = await envAtTopLevel(['--var', 'A=b=c'])
    t.deepEqual(env, { A: 'b=c' }, 'the value keeps the later =')
})

test('globalThis.env is readable at module top level', async t => {
    const env = await envAtTopLevel(['--var', 'FOO=bar'])
    t.deepEqual(env, { FOO: 'bar' }, 'top-level code sees the var')
})

test('--var without = or with an empty key exits 1 with an error',
    async t => {
        for (const value of ['NOEQUALS', '=x']) {
            const { exitCode, stdout, stderr } = await runSource(
                await bundle('_pass.js'),
                ['--var', value]
            )
            t.equal(exitCode, 1, `--var ${value} should exit 1`)
            t.ok(stderr.includes(value), 'stderr should name the bad value')
            t.equal(stdout, '', 'nothing should run')
        }
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

test('more test points than a trailing plan is reported', async t => {
    const { exitCode, stdout } = await run('_plan-extra.js')
    t.equal(exitCode, 1, 'should exit 1')
    t.ok(hasMismatch(stdout, 2, 3), 'stdout reports the plan mismatch')
})

test('a 1..0 plan with a SKIP directive passes', async t => {
    const { exitCode } = await run('_plan-skip.js')
    t.equal(exitCode, 0, 'should exit 0')
})

test('an indented subtest plan does not end the run', async t => {
    const { exitCode, stdout } = await run('_plan-subtest.js')
    t.equal(exitCode, 0, 'should exit 0')
    const lines = stdout.split('\n')
    t.ok(lines.includes('ok 1 - outer'), 'stdout has the outer test point')
    t.ok(lines.includes('1..1'), 'stdout has the top-level plan')
})

test('a not ok line fails a run that matches its plan', async t => {
    const { exitCode } = await run('_plan-fail.js')
    t.equal(exitCode, 1, 'should exit 1')

    const { summary } = await runTestsInWorker(await bundle('_plan-fail.js'))
    t.equal(summary.reason, 'plan', 'should complete by the plan rule')
    t.equal(summary.notOk, 1, 'should count the failing test point')
})

test('a module that never finishes exits 1 at --timeout', async t => {
    const { exitCode, signal, stdout, stderr } = await run('_hang.js',
        ['--timeout', '500'])
    t.equal(exitCode, 1, 'should exit 1')
    t.equal(signal, null, 'cfout should exit by itself, not be killed')
    t.ok(stdout.split('\n').includes('ok 1 - before the hang'),
        'the line printed before the hang is on stdout')
    t.ok(/timed out/i.test(stderr), 'stderr has a timeout message')
})

test('-t is the same as --timeout', async t => {
    const { exitCode, signal, stdout, stderr } = await run('_hang.js',
        ['-t', '500'])
    t.equal(exitCode, 1, 'should exit 1')
    t.equal(signal, null, 'cfout should exit by itself, not be killed')
    t.ok(stdout.split('\n').includes('ok 1 - before the hang'),
        'the line printed before the hang is on stdout')
    t.ok(/timed out/i.test(stderr), 'stderr has a timeout message')
})

test('a run that finishes before the timeout exits 0', async t => {
    const { exitCode, stderr } = await run('_pass.js', ['--timeout', '3000'])
    t.equal(exitCode, 0, 'should exit 0')
    t.ok(!/timed out/i.test(stderr), 'stderr has no timeout message')
})

test('a bad --timeout value prints an error and exits 1', async t => {
    for (const args of [
        ['--timeout', 'abc'],
        ['--timeout', '-1'],
        ['--timeout'],
    ]) {
        const { exitCode, stderr } = await runSource('', args)
        t.equal(exitCode, 1, `${args.join(' ')} should exit 1`)
        t.ok(stderr.includes('Error:'),
            `${args.join(' ')} should print an error`)
    }
})

test('a passing tapzero suite exits 0 with an ok line per assertion',
    async t => {
        const { exitCode, stdout } = await run('_tapzero-pass.js')
        t.equal(exitCode, 0, 'should exit 0')
        const oks = stdout.split('\n').filter(line => /^ok \d+/.test(line))
        t.equal(oks.length, 3, 'should print an ok line per assertion')
    })

test('a tapzero test that awaits a setTimeout promise passes', async t => {
    const { exitCode, stdout } = await run('_tapzero-await.js')
    t.equal(exitCode, 0, 'should exit 0')
    t.ok(stdout.split('\n').some(line => (
        /^ok \d+/.test(line) && line.includes('the timer resolved')
    )), 'stdout has the passing assertion')
})

test('a top-level setInterval cleared from its callback completes',
    async t => {
        const { exitCode, stdout } = await run('_interval.js')
        t.equal(exitCode, 0, 'should exit 0')
        t.ok(stdout.split('\n').includes('# calls 3'),
            'the interval stopped after the third call')
    })

test('a tapzero suite with a failing assertion exits 1', async t => {
    const { exitCode, stdout } = await run('_tapzero-fail.js')
    t.equal(exitCode, 1, 'should exit 1')
    t.ok(stdout.split('\n').some(line => /^not ok \d+/.test(line)),
        'stdout has a not ok line')
})

/**
 * Does stdout have a top-level `not ok` line with the given message?
 */
function hasNotOk (stdout:string, message:string):boolean {
    return stdout.split('\n').some(line => (
        /^not ok\b/.test(line) && line.includes(message)
    ))
}

test('a module that throws at top level exits 1 and reports the error',
    async t => {
        const { exitCode, signal, stdout, stderr } = await run('_throw.js')
        t.equal(signal, null, 'cfout should exit by itself, not be killed')
        t.equal(exitCode, 1, 'should exit 1')
        t.ok(hasNotOk(stdout, 'boom at top level'),
            'stdout has a not ok line with the message')
        t.ok(stderr.includes('boom at top level'), 'stderr has the message')
        t.ok(stderr.includes('explode'), 'stderr has the stack')
        t.ok(!/timed out/i.test(stderr), 'the run did not time out')
    })

test('a module with an unhandled rejection exits 1 and reports it',
    async t => {
        const { exitCode, signal, stdout, stderr } = await run('_rejection.js')
        t.equal(signal, null, 'cfout should exit by itself, not be killed')
        t.equal(exitCode, 1, 'should exit 1')
        t.ok(hasNotOk(stdout, 'nobody caught this'),
            'stdout has a not ok line with the message')
        t.ok(stderr.includes('nobody caught this'), 'stderr has the message')
        t.ok(!/timed out/i.test(stderr), 'the run did not time out')
    })

test('a top-level setTimeout callback that throws exits 1 and reports it',
    async t => {
        const { exitCode, signal, stdout, stderr } = await run(
            '_timer-throw.js'
        )
        t.equal(signal, null, 'cfout should exit by itself, not be killed')
        t.equal(exitCode, 1, 'should exit 1')
        t.ok(hasNotOk(stdout, 'thrown from a timer'),
            'stdout has a not ok line with the message')
        t.ok(stderr.includes('thrown from a timer'), 'stderr has the message')
        t.ok(!/timed out/i.test(stderr), 'the run did not time out')
    })

test('crypto.randomUUID() at top level fails with the runtime error',
    async t => {
        const { exitCode, signal, stdout, stderr } = await run(
            '_random-uuid.js'
        )
        t.equal(signal, null, 'cfout should exit by itself, not be killed')
        t.equal(exitCode, 1, 'should exit 1')
        t.ok(stdout.split('\n').some(line => /^not ok\b/.test(line)),
            'stdout has a not ok line')
        // the runtime's message names global scope and points at the fix
        t.ok(/global scope/i.test(stderr), 'stderr has the runtime error')
        t.ok(!/timed out/i.test(stderr), 'the run did not time out')
    })

test('an uncaught error ends the run without waiting for the timeout',
    async t => {
        for (const fixture of [
            '_throw.js',
            '_rejection.js',
            '_timer-throw.js',
            '_random-uuid.js',
        ]) {
            // the run limit kills cfout long before this timeout
            const { exitCode, signal } = await run(fixture,
                ['--timeout', '60000'])
            t.equal(signal, null, `${fixture} should exit by itself`)
            t.equal(exitCode, 1, `${fixture} should exit 1`)

            const { summary } = await runTestsInWorker(
                await bundle(fixture),
                { timeout: 60000 }
            )
            t.equal(summary.reason, 'uncaught',
                `${fixture} should complete by the uncaught error rule`)
        }
    })
