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
