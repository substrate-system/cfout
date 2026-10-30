import { test } from '@substrate-system/tapzero'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { build } from 'esbuild'

// the suite is bundled and piped into node, so import.meta.url is not
// a real path; npm runs scripts from the package root
const ROOT = process.cwd()
const CLI = path.join(ROOT, 'dist', 'cli.js')

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
        let stdout = ''
        let stderr = ''
        child.stdout.on('data', (d) => { stdout += d.toString() })
        child.stderr.on('data', (d) => { stderr += d.toString() })
        child.on('error', reject)
        child.on('close', (exitCode) => {
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
